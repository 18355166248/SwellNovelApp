import { createStore } from 'jotai';
import {
  booksAtom,
  chaptersAtom,
  bookmarksAtom,
  readingHistoryAtom,
  selectedBookIdAtom,
  currentChapterIndexAtom,
} from '../src/store/atoms';
import {
  useAddOnlineBook,
  useAddRecognizedBook,
  useCacheWholeBook,
  useLoadNextChapterPage,
  useEnsureChapterContent,
  useCheckFollowedBooks,
  useCheckBookUpdate,
} from '../src/store/hooks/useOnlineBook';
import {
  addOnlineBook,
  normalizeOnlineCatalog,
  recognizedBookImportId,
  type OnlineBookResult,
} from '../src/utils/addOnlineBook';
import {
  loadBookChapters,
  saveBookChapters,
} from '../src/utils/libraryStorage';
import {
  ONLINE_CONTENT_VERSION,
  BROWSER_CONTENT_VERSION,
} from '../src/services/source/contentQuality';
import { getSourceById } from '../src/services/source/registry';
import type { Book, Chapter } from '../src/store/types/book';
import type { RecognizedBook } from '../src/services/recognize/recognizer';
import { fetchRenderedHtml } from '../src/services/browserFetch/bridge';

let mockStore = createStore();
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));
jest.mock('../src/utils/libraryStorage', () => ({
  loadBookChapters: jest.fn(),
  saveBookChapters: jest.fn(),
}));
jest.mock('../src/utils/addOnlineBook', () => ({
  ...jest.requireActual('../src/utils/addOnlineBook'),
  addOnlineBook: jest.fn(),
}));
jest.mock('../src/services/browserFetch/bridge', () => ({
  ...jest.requireActual('../src/services/browserFetch/bridge'),
  fetchRenderedHtml: jest.fn(),
}));

const ORIGIN = 'http://wap.xuanhuange.info';
const TITLE = '道诡异仙';
const sourceUrl = (chapter: number) => `${ORIGIN}/wapbook-170446/${chapter}/`;
const catalogUrl = `${ORIGIN}/wapbook-170446/`;
const incomingBook = (id = 'xuanhuange:170446'): Book => ({
  id,
  title: TITLE,
  author: '狐尾的笔',
  addedAt: 10,
  updatedAt: 10,
  progress: 0,
  source: { name: 'xuanhuange', bookUrl: catalogUrl },
});
const chapter = (
  bookId: string,
  id: string,
  sequence: number,
  cached = false,
): Chapter => ({
  id,
  bookId,
  order: sequence - 1,
  title: `第${sequence}章`,
  sourceUrl: sourceUrl(sequence),
  content: cached ? '有效正文。'.repeat(100) : '',
  contentVersion: cached ? ONLINE_CONTENT_VERSION : undefined,
  browserContentVersion: cached ? BROWSER_CONTENT_VERSION : undefined,
  contentComplete: cached || undefined,
});
const result = (
  book = incomingBook(),
  sequences = [1, 2, 3],
): OnlineBookResult => ({
  book,
  chapters: sequences.map(sequence =>
    chapter(book.id, `${book.id}-${sequence - 1}`, sequence),
  ),
});
const recognized = (sequences = [1, 2, 3]): RecognizedBook => ({
  ok: true,
  isDetail: true,
  host: 'wap.xuanhuange.info',
  url: catalogUrl,
  title: TITLE,
  author: '狐尾的笔',
  chapters: sequences.map(sequence => ({
    title: `第${sequence}章`,
    url: sourceUrl(sequence),
  })),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockStore = createStore();
  jest.clearAllMocks();
  jest.mocked(loadBookChapters).mockResolvedValue(null);
  jest.mocked(saveBookChapters).mockResolvedValue(undefined);
  jest.mocked(addOnlineBook).mockResolvedValue(result());
  jest
    .mocked(fetchRenderedHtml)
    .mockRejectedValue(new Error('test metadata offline'));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('正文缓存与目录变更竞争', () => {
  it('旧 host 来源的完整缓存判定与阅读器一致，过期浏览器版本必须重抓', async () => {
    const book = {
      ...incomingBook(),
      source: { name: 'wap.xuanhuange.info', bookUrl: catalogUrl },
    };
    const old = {
      ...chapter(book.id, 'cached', 1, true),
      browserContentVersion: BROWSER_CONTENT_VERSION - 1,
    };
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [old] });
    const parse = jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockResolvedValue({
        content: '完整有效新正文。'.repeat(100),
        complete: true,
      });
    expect(await useCacheWholeBook()(book.id)).toEqual({ done: 1, total: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(mockStore.get(chaptersAtom)[book.id][0].browserContentVersion).toBe(
      BROWSER_CONTENT_VERSION,
    );
  });

  it('自动缓存新章期间目录再次重排，仍按新章身份完成后续缓存', async () => {
    const book = { ...incomingBook(), following: true };
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, {
      [book.id]: [chapter(book.id, 'a', 1, true)],
    });
    const source = getSourceById('xuanhuange')!;
    jest
      .spyOn(source, 'parseCatalog')
      .mockResolvedValueOnce(
        [1, 2, 3].map(n => ({ title: `第${n}章`, url: sourceUrl(n) })),
      )
      .mockResolvedValueOnce(
        [1, 3, 2].map(n => ({ title: `第${n}章`, url: sourceUrl(n) })),
      );
    const response = deferred<{ content: string; complete: boolean }>();
    const parse = jest
      .spyOn(source, 'parseChapterContent')
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue({
        content: '完整有效正文。'.repeat(100),
        complete: true,
      });
    const pending = useCheckFollowedBooks()({ cacheNewChapters: true });
    for (let step = 0; step < 50 && !parse.mock.calls.length; step++)
      await Promise.resolve();
    expect(parse).toHaveBeenCalledTimes(1);
    await useCheckBookUpdate()(book.id);
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    expect(await pending).toMatchObject({ cached: 2, cacheFailed: 0 });
    expect(parse.mock.calls.map(call => call[0])).toEqual([
      sourceUrl(2),
      sourceUrl(3),
    ]);
    expect(mockStore.get(chaptersAtom)[book.id].every(c => !!c.content)).toBe(
      true,
    );
  });

  it('全本缓存期间追加新章会纳入同一任务，不误报旧目录已全部缓存', async () => {
    const book = incomingBook();
    const a = chapter(book.id, 'a', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [a] });
    const response = deferred<{ content: string; complete: boolean }>();
    const parse = jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue({
        content: '完整有效正文。'.repeat(100),
        complete: true,
      });
    const pending = useCacheWholeBook()(book.id);
    mockStore.set(chaptersAtom, { [book.id]: [a, chapter(book.id, 'new', 2)] });
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    expect(await pending).toEqual({ done: 2, total: 2 });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('阅读首个子页与全本下载并发时，完整下载能扩展新缓存的首个子页', async () => {
    const book = incomingBook();
    const a = chapter(book.id, 'a', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [a] });
    const response = deferred<{ content: string; complete: boolean }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValueOnce(response.promise);
    const pending = useCacheWholeBook()(book.id);
    const first = '有效首个子页。'.repeat(100);
    mockStore.set(chaptersAtom, {
      [book.id]: [
        {
          ...a,
          content: first,
          contentVersion: ONLINE_CONTENT_VERSION,
          contentComplete: false,
          nextPageUrl: sourceUrl(1) + '2.html',
        },
      ],
    });
    response.resolve({ content: first + '\n完整尾页。', complete: true });
    expect(await pending).toEqual({ done: 1, total: 1 });
    expect(mockStore.get(chaptersAtom)[book.id][0]).toMatchObject({
      content: first + '\n完整尾页。',
      contentComplete: true,
    });
  });

  it('阅读请求晚于完整缓存返回时不能把完整章降回首个子页', async () => {
    const book = incomingBook();
    const a = chapter(book.id, 'a', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [a] });
    const response = deferred<{
      content: string;
      complete: boolean;
      nextPageUrl?: string;
    }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValueOnce(response.promise);
    const pending = useEnsureChapterContent()(book.id, 0);
    await Promise.resolve();
    const full = {
      ...chapter(book.id, 'a', 1, true),
      content: '完整首尾正文。'.repeat(100),
    };
    mockStore.set(chaptersAtom, { [book.id]: [full] });
    response.resolve({
      content: '完整首尾正文。'.repeat(50),
      complete: false,
      nextPageUrl: sourceUrl(1) + '2.html',
    });
    expect(await pending).toBe(full);
    expect(mockStore.get(chaptersAtom)[book.id][0]).toBe(full);
  });

  it('全本请求期间移除书籍不回填正文、不落盘或报全部完成', async () => {
    const book = incomingBook();
    const a = chapter(book.id, 'a', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [a] });
    const response = deferred<{ content: string; complete: boolean }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValueOnce(response.promise);
    const pending = useCacheWholeBook()(book.id);
    mockStore.set(booksAtom, [{ ...book, deletedAt: 10 }]);
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    expect(await pending).toMatchObject({ done: 0, total: 1, cancelled: true });
    expect(mockStore.get(chaptersAtom)[book.id][0]).toBe(a);
    expect(saveBookChapters).not.toHaveBeenCalled();
  });

  it('正文迟到只补正文，不回退目录的新标题、顺序和来源地址', async () => {
    const book = incomingBook();
    const original = chapter(book.id, 'pending', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [original] });
    const response = deferred<{ content: string; complete: boolean }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValue(response.promise);
    const pending = useEnsureChapterContent()(book.id, 0);
    await Promise.resolve();
    const latest = {
      ...original,
      title: '第1章 修正标题',
      order: 1,
      sourceUrl: sourceUrl(1) + '#new',
    };
    mockStore.set(chaptersAtom, {
      [book.id]: [chapter(book.id, 'inserted', 4), latest],
    });
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    const filled = await pending;
    expect(filled).toMatchObject({
      title: latest.title,
      order: 1,
      sourceUrl: latest.sourceUrl,
    });
    expect(mockStore.get(chaptersAtom)[book.id][1]).toMatchObject({
      title: latest.title,
      order: 1,
      sourceUrl: latest.sourceUrl,
      content: filled!.content,
    });
  });

  it('子页迟到同样保留追更修正的目录信息', async () => {
    const book = incomingBook();
    const original = {
      ...chapter(book.id, 'partial', 1, true),
      contentComplete: false,
      nextPageUrl: sourceUrl(1) + '2.html',
    };
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [original] });
    const response = deferred<{ content: string; complete: boolean }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValue(response.promise);
    const pending = useLoadNextChapterPage()(book.id, 0);
    await Promise.resolve();
    const latest = { ...original, title: '第1章 修正标题', order: 1 };
    mockStore.set(chaptersAtom, {
      [book.id]: [chapter(book.id, 'inserted', 4), latest],
    });
    response.resolve({ content: '短尾页。', complete: true });
    expect(await pending).toMatchObject({ title: latest.title, order: 1 });
    expect(mockStore.get(chaptersAtom)[book.id][1]).toMatchObject({
      title: latest.title,
      order: 1,
    });
  });

  it('全本缓存期间目录重排不漏章，不回退目录元数据', async () => {
    const book = incomingBook();
    const [a, b] = [chapter(book.id, 'a', 1), chapter(book.id, 'b', 2)];
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [a, b] });
    const response = deferred<{ content: string; complete: boolean }>();
    const parse = jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue({
        content: '完整有效正文。'.repeat(100),
        complete: true,
      });
    const pending = useCacheWholeBook()(book.id);
    mockStore.set(chaptersAtom, {
      [book.id]: [
        { ...b, order: 0 },
        { ...a, order: 1, title: '第1章 修正标题' },
      ],
    });
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    expect(await pending).toEqual({ done: 2, total: 2 });
    expect(parse.mock.calls.map(call => call[0])).toEqual([
      a.sourceUrl,
      b.sourceUrl,
    ]);
    expect(mockStore.get(chaptersAtom)[book.id].map(c => c.order)).toEqual([
      0, 1,
    ]);
    expect(mockStore.get(chaptersAtom)[book.id].every(c => !!c.content)).toBe(
      true,
    );
  });

  it('正文请求期间移入回收站，迟到结果不能写入或返回成功', async () => {
    jest.useFakeTimers();
    const book = incomingBook();
    const original = chapter(book.id, 'pending', 1);
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: [original] });
    const response = deferred<{ content: string; complete: boolean }>();
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockReturnValue(response.promise);
    const pending = useEnsureChapterContent()(book.id, 0);
    await Promise.resolve();
    mockStore.set(booksAtom, [{ ...book, deletedAt: 10 }]);
    response.resolve({ content: '完整有效正文。'.repeat(100), complete: true });
    expect(await pending).toBeNull();
    await jest.advanceTimersByTimeAsync(1100);
    expect(mockStore.get(chaptersAtom)[book.id][0]).toBe(original);
    expect(saveBookChapters).not.toHaveBeenCalled();
  });

  it('已排队的缓存在书籍彻底移除后不重建孤立正文文件', async () => {
    jest.useFakeTimers();
    const book = incomingBook();
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, {
      [book.id]: [chapter(book.id, 'pending', 1)],
    });
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockResolvedValue({
        content: '完整有效正文。'.repeat(100),
        complete: true,
      });
    await useEnsureChapterContent()(book.id, 0);
    mockStore.set(booksAtom, []);
    mockStore.set(chaptersAtom, {});
    await jest.advanceTimersByTimeAsync(1100);
    expect(saveBookChapters).not.toHaveBeenCalled();
  });

  it('旧残目录的阅读自动修复保存失败不提前发布新目录', async () => {
    const book = {
      ...incomingBook('legacy'),
      source: {
        name: 'bookshuku',
        bookUrl: 'http://wap.bookshuku.org/read/1.html',
      },
    };
    const old = Array.from({ length: 11 }, (_, i) => ({
      ...chapter(book.id, `old-${i}`, 690 + i),
      sourceUrl: `http://wap.bookshuku.org/read/1_${690 + i}.html`,
    }));
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: old });
    const source = getSourceById('bookshuku')!;
    jest.spyOn(source, 'parseCatalog').mockResolvedValue(
      Array.from({ length: 701 }, (_, i) => ({
        title: `第${i + 1}章`,
        url: `http://wap.bookshuku.org/read/1_${i + 1}.html`,
      })),
    );
    const parse = jest.spyOn(source, 'parseChapterContent').mockResolvedValue({
      content: '完整有效正文。'.repeat(100),
      complete: true,
    });
    jest.mocked(saveBookChapters).mockRejectedValueOnce(new Error('disk full'));
    await expect(useEnsureChapterContent()(book.id, 0)).rejects.toThrow(
      'disk full',
    );
    expect(mockStore.get(chaptersAtom)[book.id]).toBe(old);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe('网站目录更新事务', () => {
  const setup = () => {
    const book = {
      ...incomingBook(),
      following: true,
      currentChapterId: 'old-2',
      progress: 50,
    };
    const chapters = [1, 2, 3].map(n => chapter(book.id, `old-${n}`, n, true));
    mockStore.set(booksAtom, [book]);
    mockStore.set(chaptersAtom, { [book.id]: chapters });
    return { book, chapters };
  };
  const catalog = (sequences: number[]) =>
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseCatalog')
      .mockResolvedValue(
        sequences.map(n => ({ title: `第${n}章`, url: sourceUrl(n) })),
      );

  it('更新去重并按 URL 合并插章，保持续读和正文，不按旧长度截取', async () => {
    const { book, chapters } = setup();
    catalog([1, 4, 2, 3, 3]);
    mockStore.set(selectedBookIdAtom, book.id);
    mockStore.set(currentChapterIndexAtom, 1);
    expect(await useCheckBookUpdate()(book.id)).toBe(1);
    expect(mockStore.get(chaptersAtom)[book.id].map(c => c.sourceUrl)).toEqual(
      [1, 4, 2, 3].map(sourceUrl),
    );
    expect(mockStore.get(chaptersAtom)[book.id][2]).toMatchObject({
      id: chapters[1].id,
      content: chapters[1].content,
    });
    expect(mockStore.get(currentChapterIndexAtom)).toBe(2);
    expect(mockStore.get(booksAtom)[0].unreadUpdates).toBe(1);
  });

  it('追更迁移独立阅读记录，修正旧id后保留字符位置', async () => {
    const { book, chapters } = setup();
    mockStore.set(booksAtom, [
      {
        ...book,
        readingRecords: [
          {
            id: 'saved',
            bookId: book.id,
            chapterId: 'legacy-id',
            chapterTitle: '旧标题',
            sourceUrl: sourceUrl(2),
            position: 180,
            updatedAt: 2,
          },
        ],
      },
    ]);
    catalog([3, 1, 2, 4]);
    await useCheckBookUpdate()(book.id);
    expect(mockStore.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
      chapterId: chapters[1].id,
      chapterTitle: '第2章',
      position: 180,
    });
  });

  it('等长目录重排也同步身份与标题，不丢缓存', async () => {
    const { book } = setup();
    catalog([3, 1, 2]);
    expect(await useCheckBookUpdate()(book.id)).toBe(0);
    expect(mockStore.get(chaptersAtom)[book.id].map(c => c.id)).toEqual([
      'old-3',
      'old-1',
      'old-2',
    ]);
  });

  it('目录未变且尚无阅读历史时，检查更新不把章内进度退回章首', async () => {
    const { book } = setup();
    catalog([1, 2, 3]);
    await useCheckBookUpdate()(book.id);
    expect(mockStore.get(booksAtom)[0].progress).toBe(50);
  });

  it('一个检查者取消不影响另一个等待者，不重复发布更新', async () => {
    const { book } = setup();
    const late = deferred<Array<{ title: string; url: string }>>();
    const parse = catalog([]).mockReturnValueOnce(late.promise);
    const check = useCheckBookUpdate();
    const controller = new AbortController();
    const first = check(book.id, controller.signal);
    const second = check(book.id);
    await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(parse.mock.calls[0][1]!.signal!.aborted).toBe(false);
    late.resolve(
      [1, 2, 3, 4].map(n => ({ title: `第${n}章`, url: sourceUrl(n) })),
    );
    expect(await second).toBe(1);
    expect(mockStore.get(booksAtom)[0].unreadUpdates).toBe(1);
  });

  it('追更缓存定位中间插入的新章，不误缓存原目录末章', async () => {
    const { book } = setup();
    catalog([1, 4, 2, 3]);
    const content = jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockResolvedValue({ content: '新的正文。'.repeat(100), complete: true });
    expect(
      await useCheckFollowedBooks()({ cacheNewChapters: true }),
    ).toMatchObject({ updated: 1, cached: 1 });
    expect(content).toHaveBeenCalledWith(sourceUrl(4), expect.anything());
    expect(mockStore.get(chaptersAtom)[book.id][1].content).toContain(
      '新的正文',
    );
  });

  it('追更资料更新成功但正文保存失败时，不报可离线缓存成功', async () => {
    jest.useFakeTimers();
    setup();
    catalog([1, 2, 3, 4]);
    jest
      .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
      .mockResolvedValue({ content: '新的正文。'.repeat(100), complete: true });
    jest
      .mocked(saveBookChapters)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('缓存存储已满'));
    expect(
      await useCheckFollowedBooks()({ cacheNewChapters: true }),
    ).toMatchObject({ updated: 1, cached: 0, cacheFailed: 1 });
    jest.runOnlyPendingTimers();
  });

  it('保存等待期间新增的正文和阅读进度不能被旧更新快照覆盖', async () => {
    jest.useFakeTimers();
    const { book, chapters } = setup();
    catalog([1, 2, 3, 4]);
    const writing = deferred<void>();
    jest.mocked(saveBookChapters).mockReturnValueOnce(writing.promise);
    const running = useCheckBookUpdate()(book.id);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const newer = chapters.map((c, i) =>
      i === 1 ? { ...c, content: '新缓存正文。'.repeat(100) } : c,
    );
    mockStore.set(chaptersAtom, { [book.id]: newer });
    mockStore.set(booksAtom, [{ ...book, lastReadAt: 99 }]);
    writing.resolve();
    await running;
    expect(mockStore.get(chaptersAtom)[book.id][1].content).toBe(
      newer[1].content,
    );
    expect(mockStore.get(booksAtom)[0].lastReadAt).toBe(99);
    jest.runOnlyPendingTimers();
    expect(saveBookChapters).toHaveBeenCalledTimes(2);
  });

  it('远端残目录不能误报已是最新，也不能改本地目录', async () => {
    const { book, chapters } = setup();
    catalog([2, 3]);
    await expect(useCheckBookUpdate()(book.id)).rejects.toThrow('不完整');
    expect(mockStore.get(chaptersAtom)[book.id]).toBe(chapters);
    expect(mockStore.get(booksAtom)[0].lastUpdateCheckAt).toBeUndefined();
  });

  it('保存失败会报错，章节数量与追更提示保持原样，允许重新检查', async () => {
    const { book, chapters } = setup();
    catalog([1, 2, 3, 4]);
    jest.mocked(saveBookChapters).mockRejectedValueOnce(new Error('存储已满'));
    await expect(useCheckBookUpdate()(book.id)).rejects.toThrow('存储已满');
    expect(mockStore.get(chaptersAtom)[book.id]).toBe(chapters);
    expect(mockStore.get(booksAtom)[0]).toBe(book);
    expect(await useCheckBookUpdate()(book.id)).toBe(1);
  });

  it('手动与自动同时检查共享请求，新增数不重复累计', async () => {
    const { book } = setup();
    const parse = catalog([1, 2, 3, 4]);
    const check = useCheckBookUpdate();
    await Promise.all([check(book.id), check(book.id)]);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(mockStore.get(booksAtom)[0].unreadUpdates).toBe(1);
  });

  it('解析期间移入回收站后，迟到更新不得继续发布', async () => {
    const { book, chapters } = setup();
    const late = deferred<Array<{ title: string; url: string }>>();
    catalog([]).mockReturnValueOnce(late.promise);
    const pending = useCheckBookUpdate()(book.id);
    await Promise.resolve();
    mockStore.set(booksAtom, [{ ...book, deletedAt: 123 }]);
    late.resolve(
      [1, 2, 3, 4].map(n => ({ title: `第${n}章`, url: sourceUrl(n) })),
    );
    await pending;
    expect(mockStore.get(chaptersAtom)[book.id]).toBe(chapters);
    expect(saveBookChapters).not.toHaveBeenCalled();
  });
});

it('更长但缺旧章的重新导入不能覆盖原书，存储期间后发的删除不被还原', async () => {
  const book = incomingBook();
  const chapters = [1, 2, 3].map(n => chapter(book.id, `old-${n}`, n, true));
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: chapters });
  await expect(
    useAddRecognizedBook()(recognized([1, 3, 4, 5])),
  ).rejects.toThrow('不完整');
  expect(mockStore.get(chaptersAtom)[book.id]).toBe(chapters);
  const writing = deferred<void>();
  jest.mocked(saveBookChapters).mockReturnValueOnce(writing.promise);
  const running = useAddRecognizedBook()({
    ...recognized(),
    metadataChecked: true,
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  mockStore.set(booksAtom, [{ ...book, deletedAt: 123 }]);
  writing.resolve();
  await expect(running).rejects.toThrow('已移除');
  expect(mockStore.get(booksAtom)[0].deletedAt).toBe(123);
  expect(mockStore.get(chaptersAtom)[book.id]).toBe(chapters);
});

it('目录持久化失败不会先显示成功或留下空壳书，下次添加可以重试', async () => {
  jest.mocked(saveBookChapters).mockRejectedValueOnce(new Error('存储已满'));
  const add = useAddOnlineBook();
  await expect(add(`${ORIGIN}/info-170446/`)).rejects.toThrow('存储已满');
  expect(mockStore.get(booksAtom)).toEqual([]);
  expect(mockStore.get(chaptersAtom)).toEqual({});
  await expect(add(`${ORIGIN}/info-170446/`)).resolves.toMatchObject({
    title: TITLE,
  });
  expect(mockStore.get(booksAtom)).toHaveLength(1);
});

it('搜索重新添加回收站的浏览器旧书会还原并保留正文、书签、续读和用户状态', async () => {
  const old: Book = {
    ...incomingBook('browser:wap.xuanhuange.info:170446'),
    source: { name: 'wap.xuanhuange.info', bookUrl: catalogUrl },
    addedAt: 1,
    lastReadAt: 2,
    finishedAt: 3,
    following: true,
    deletedAt: 4,
    progress: 75,
    currentChapterId: 'cached-chapter',
  };
  const cached = chapter(old.id, 'cached-chapter', 2, true);
  mockStore.set(booksAtom, [old]);
  // 重启后章节尚未加载时，也不能把磁盘里的正文当作不存在。
  jest.mocked(loadBookChapters).mockResolvedValue([cached]);
  mockStore.set(readingHistoryAtom, {
    [old.id]: {
      bookId: old.id,
      chapterId: cached.id,
      position: 50,
      updatedAt: 2,
    },
  });
  mockStore.set(bookmarksAtom, {
    [old.id]: [
      {
        id: 'mark',
        bookId: old.id,
        chapterId: cached.id,
        position: 50,
        createdAt: 1,
      },
    ],
  });
  const book = await useAddOnlineBook()(`${ORIGIN}/info-170446/`);
  expect(mockStore.get(booksAtom)).toHaveLength(1);
  expect(book).toMatchObject({
    id: old.id,
    addedAt: 1,
    lastReadAt: 2,
    finishedAt: 3,
    following: true,
    currentChapterId: cached.id,
  });
  expect(book.deletedAt).toBeUndefined();
  expect(mockStore.get(chaptersAtom)[old.id][1]).toMatchObject({
    id: cached.id,
    content: cached.content,
  });
  expect(mockStore.get(readingHistoryAtom)[old.id].position).toBe(50);
  expect(mockStore.get(bookmarksAtom)[old.id][0].chapterId).toBe(cached.id);
  expect(book.progress).toBe(mockStore.get(booksAtom)[0].progress);
  expect(book.progress).toBeGreaterThan(0);
});

it('浏览器再次识别插入新章节时保留原章身份、缓存和阅读器选择', async () => {
  const old = {
    ...incomingBook(),
    currentChapterId: 'stable-second',
    progress: 70,
    readingRecords: [
      {
        id: 'saved',
        bookId: incomingBook().id,
        chapterId: 'legacy-second',
        chapterTitle: '旧标题',
        sourceUrl: sourceUrl(2),
        position: 180,
        updatedAt: 2,
      },
    ],
  };
  const previous = [
    chapter(old.id, 'stable-second', 2, true),
    chapter(old.id, 'stable-third', 3),
  ];
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: previous });
  mockStore.set(selectedBookIdAtom, old.id);
  mockStore.set(currentChapterIndexAtom, 0);
  const book = await useAddRecognizedBook()(recognized());
  expect(book.source?.name).toBe('xuanhuange');
  expect(mockStore.get(chaptersAtom)[old.id][1]).toMatchObject({
    id: previous[0].id,
    content: previous[0].content,
  });
  expect(mockStore.get(currentChapterIndexAtom)).toBe(1);
  expect(book.currentChapterId).toBe(previous[0].id);
  expect(book.readingRecords?.[0]).toMatchObject({
    chapterId: previous[0].id,
    chapterTitle: '第2章',
    position: 180,
  });
});

it('浏览器目录导入通过通用资料补全取得封面，同时保留完整章节', async () => {
  jest
    .mocked(fetchRenderedHtml)
    .mockResolvedValue(
      `<h1>${TITLE}</h1><div class="block_img2"><img src="/cover.jpg"></div>`,
    );
  const book = await useAddRecognizedBook()(recognized());
  expect(book.cover).toBe(`${ORIGIN}/cover.jpg`);
  expect(mockStore.get(chaptersAtom)[book.id]).toHaveLength(3);
});

it('浏览器预览已尝试补全时入库复用结果，不再次抓资料或丢失目录', async () => {
  const book = await useAddRecognizedBook()({
    ...recognized(),
    metadataChecked: true,
  });
  expect(fetchRenderedHtml).not.toHaveBeenCalled();
  expect(mockStore.get(chaptersAtom)[book.id]).toHaveLength(3);
});

it('重识别只得到目录第一页时保留完整旧目录，不丢失缓存', async () => {
  const old = incomingBook();
  const previous = [1, 2, 3].map(sequence =>
    chapter(old.id, `old-${sequence}`, sequence, true),
  );
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: previous });
  const book = await useAddRecognizedBook()(recognized([1]));
  expect(book.totalChapters).toBe(3);
  expect(mockStore.get(chaptersAtom)[old.id].map(item => item.id)).toEqual(
    previous.map(item => item.id),
  );
  expect(mockStore.get(chaptersAtom)[old.id][2].content).toBe(
    previous[2].content,
  );
});

it('浏览器和搜索同时添加同书时共用请求结果，只发布一本书', async () => {
  const waiting = deferred<OnlineBookResult>();
  jest.mocked(addOnlineBook).mockReturnValue(waiting.promise);
  const first = useAddOnlineBook()(`${ORIGIN}/info-170446/`);
  const second = useAddRecognizedBook()(recognized());
  expect(first).toBe(second);
  waiting.resolve(result());
  await Promise.all([first, second]);
  expect(addOnlineBook).toHaveBeenCalledTimes(1);
  expect(saveBookChapters).toHaveBeenCalledTimes(1);
  expect(mockStore.get(booksAtom)).toHaveLength(1);
});

it('不同书的网络解析不会等待前一本超时，入库仍分别完成', async () => {
  const waiting = deferred<OnlineBookResult>();
  const secondBook = {
    ...incomingBook('xuanhuange:999999'),
    title: '另一本书',
    source: { name: 'xuanhuange', bookUrl: `${ORIGIN}/wapbook-999999/` },
  };
  jest
    .mocked(addOnlineBook)
    .mockReturnValueOnce(waiting.promise)
    .mockResolvedValueOnce(result(secondBook));
  const add = useAddOnlineBook();
  const first = add(`${ORIGIN}/info-170446/`);
  const second = add(`${ORIGIN}/info-999999/`);
  expect(addOnlineBook).toHaveBeenCalledTimes(2);
  await expect(second).resolves.toMatchObject({ id: secondBook.id });
  waiting.resolve(result());
  await first;
  expect(mockStore.get(booksAtom)).toHaveLength(2);
});

it('等待目录保存期间阅读器新缓存的正文不会被导入快照覆盖', async () => {
  jest.useFakeTimers();
  const old = incomingBook();
  const previous = [chapter(old.id, 'old-1', 1)];
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: previous });
  const waiting = deferred<void>();
  const savingStarted = deferred<void>();
  jest.mocked(saveBookChapters).mockImplementationOnce(() => {
    savingStarted.resolve();
    return waiting.promise;
  });
  const importing = useAddOnlineBook()(`${ORIGIN}/info-170446/`);
  await savingStarted.promise;
  const cached = {
    ...previous[0],
    content: '有效正文。'.repeat(100),
    contentVersion: ONLINE_CONTENT_VERSION,
  };
  mockStore.set(chaptersAtom, { [old.id]: [cached] });
  mockStore.set(booksAtom, [{ ...old, lastReadAt: 123 }]);
  waiting.resolve();
  const book = await importing;
  expect(mockStore.get(chaptersAtom)[old.id][0].content).toBe(cached.content);
  expect(book.lastReadAt).toBe(123);
  jest.runOnlyPendingTimers();
  expect(saveBookChapters).toHaveBeenCalledTimes(2);
});

it('浏览器空目录或非书籍页不能入库', async () => {
  await expect(useAddRecognizedBook()(recognized([]))).rejects.toThrow(
    '未获取到可阅读的章节目录',
  );
  await expect(
    useAddRecognizedBook()({ ...recognized(), isDetail: false }),
  ).rejects.toThrow('未识别到书籍目录');
  expect(saveBookChapters).not.toHaveBeenCalled();
  expect(mockStore.get(booksAtom)).toEqual([]);
});

it('目录去重会规范站点入口，过滤非正文网页，并保留章节顺序', () => {
  expect(
    normalizeOnlineCatalog([
      { title: '第一章', url: sourceUrl(1) },
      {
        title: '重复',
        url: sourceUrl(1).replace('http://wap.', 'https://www.'),
      },
      // 非网页章节链接仅作为过滤回归样本，不会执行。
      // eslint-disable-next-line no-script-url
      { title: '广告', url: 'javascript:alert(1)' },
      { title: '', url: sourceUrl(2) },
    ]),
  ).toEqual([
    { title: '第一章', url: sourceUrl(1) },
    { title: '第2章', url: sourceUrl(2) },
  ]);
});

it('未知站点不能只根据相同年份书号生成重复 id，已知书源使用统一书号', () => {
  expect(
    recognizedBookImportId('https://example.com/2026/book-a', 'example.com'),
  ).not.toBe(
    recognizedBookImportId('https://example.com/2026/book-b', 'example.com'),
  );
  expect(recognizedBookImportId(catalogUrl, 'wap.xuanhuange.info')).toBe(
    'xuanhuange:170446',
  );
});

it('全本缓存会补抓只缓存首个子页的章节，不能把它算作已完整离线', async () => {
  const old = incomingBook();
  const partial = {
    ...chapter(old.id, 'partial', 1, true),
    contentComplete: false,
    nextPageUrl: `${sourceUrl(1)}2.html`,
  };
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: [partial] });
  const parse = jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({ content: '完整正文。'.repeat(100), complete: true });
  const progress = jest.fn();
  await expect(useCacheWholeBook()(old.id, progress)).resolves.toEqual({
    done: 1,
    total: 1,
  });
  expect(progress).toHaveBeenNthCalledWith(1, { done: 0, total: 1 });
  expect(parse).toHaveBeenCalledTimes(1);
  expect(mockStore.get(chaptersAtom)[old.id][0].nextPageUrl).toBeUndefined();
});

it('网页导入来源不能误报成功缓存 0/0 章', async () => {
  const old = {
    ...incomingBook(),
    source: {
      name: 'unknown.example.com',
      bookUrl: 'https://unknown.example.com/novel',
    },
  };
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: [chapter(old.id, 'first', 1)] });
  await expect(useCacheWholeBook()(old.id)).rejects.toThrow('阅读时自动缓存');
});

it('全本缓存接纳正常短尾页，同时确认整章正文保存完整', async () => {
  const old = incomingBook();
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: [chapter(old.id, 'first', 1)] });
  jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValueOnce({
      content: '首页正文。'.repeat(100),
      nextPageUrl: `${sourceUrl(1)}2.html`,
      complete: false,
    })
    .mockResolvedValueOnce({ content: '这是本章的最后一句。', complete: true });
  await expect(useCacheWholeBook()(old.id)).resolves.toEqual({
    done: 1,
    total: 1,
  });
  expect(mockStore.get(chaptersAtom)[old.id][0].content).toContain(
    '这是本章的最后一句。',
  );
  expect(saveBookChapters).toHaveBeenCalled();
});

it('下一分页成环会结束缓存，不追加重复正文或误报完成', async () => {
  const old = incomingBook();
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: [chapter(old.id, 'first', 1)] });
  const parse = jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({
      content: '首页正文。'.repeat(100),
      nextPageUrl: sourceUrl(1),
      complete: false,
    });
  await expect(useCacheWholeBook()(old.id)).resolves.toEqual({
    done: 0,
    total: 1,
  });
  expect(parse).toHaveBeenCalledTimes(1);
  expect(mockStore.get(chaptersAtom)[old.id][0].content).toBe('');
});

it('全本下载后落盘失败必须提示失败，不能误报可离线阅读', async () => {
  const old = incomingBook();
  mockStore.set(booksAtom, [old]);
  mockStore.set(chaptersAtom, { [old.id]: [chapter(old.id, 'first', 1)] });
  jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({ content: '完整正文。'.repeat(100), complete: true });
  jest.mocked(saveBookChapters).mockRejectedValueOnce(new Error('disk full'));
  await expect(useCacheWholeBook()(old.id)).rejects.toThrow('disk full');
  await expect(useCacheWholeBook()(old.id)).resolves.toEqual({
    done: 1,
    total: 1,
  });
  expect(saveBookChapters).toHaveBeenCalledTimes(2);
});

it('入库总超时后恢复操作，迟到解析不能偷偷加入书架', async () => {
  jest.useFakeTimers();
  try {
    const delayed = deferred<OnlineBookResult>();
    jest.mocked(addOnlineBook).mockReturnValueOnce(delayed.promise);
    const request = useAddOnlineBook()(catalogUrl);
    const rejected = expect(request).rejects.toThrow('书源响应超时');
    await jest.advanceTimersByTimeAsync(45000);
    await rejected;
    delayed.resolve(result());
    await Promise.resolve();
    await Promise.resolve();
    expect(mockStore.get(booksAtom)).toEqual([]);
    expect(saveBookChapters).not.toHaveBeenCalled();
    await expect(useAddOnlineBook()(catalogUrl)).resolves.toMatchObject({
      id: incomingBook().id,
    });
  } finally {
    jest.useRealTimers();
  }
});

it('逐页续载允许正常短尾页，缓存完整正文而不是误报失败', async () => {
  jest.useFakeTimers();
  const book = incomingBook();
  const current = {
    ...chapter(book.id, 'tail', 1, true),
    contentComplete: false,
    nextPageUrl: `${sourceUrl(1)}2.html`,
  };
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: [current] });
  jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({ content: '完。', complete: true });
  const loaded = await useLoadNextChapterPage()(book.id, 0);
  expect(loaded?.content).toBe(`${current.content}\n完。`);
  expect(loaded?.contentComplete).toBe(true);
  expect(mockStore.get(chaptersAtom)[book.id][0].nextPageUrl).toBeUndefined();
  jest.runOnlyPendingTimers();
});

it('续页回到已读分页时拒绝追加，已缓存正文与重试入口保持原样', async () => {
  const book = incomingBook();
  const current = {
    ...chapter(book.id, 'cycle', 1, true),
    contentComplete: false,
    nextPageUrl: `${sourceUrl(1)}2.html`,
  };
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: [current] });
  const parse = jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({
      content: '错误的重复页',
      nextPageUrl: current.sourceUrl,
      complete: false,
    });
  await expect(useLoadNextChapterPage()(book.id, 0)).rejects.toThrow(
    '链接循环',
  );
  expect(mockStore.get(chaptersAtom)[book.id][0]).toEqual(current);
  expect(parse).toHaveBeenCalledTimes(1);
});

it('落盘恢复的已读分页列表仍拦截循环，不发起重复网络请求', async () => {
  const book = incomingBook();
  const page = `${sourceUrl(1)}2.html`;
  const current = {
    ...chapter(book.id, 'restore', 1, true),
    nextPageUrl: page,
    loadedPageUrls: [page],
    contentComplete: false,
  };
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: [current] });
  const parse = jest.spyOn(getSourceById('xuanhuange')!, 'parseChapterContent');
  await expect(useLoadNextChapterPage()(book.id, 0)).rejects.toThrow(
    '链接异常',
  );
  expect(parse).not.toHaveBeenCalled();
  expect(mockStore.get(chaptersAtom)[book.id][0].content).toBe(current.content);
});

it('bookshuku 同路径的 query 子页不会误判成已读章首页', async () => {
  jest.useFakeTimers();
  const book = {
    ...incomingBook(),
    source: {
      name: 'bookshuku',
      bookUrl: 'https://www.bookshuku.org/bookinfo/123.html',
    },
  };
  const current = {
    ...chapter(book.id, 'query', 1, true),
    sourceUrl: 'https://www.bookshuku.org/read/123_1.html',
    nextPageUrl: 'https://wap.bookshuku.org/read/123_1.html?page=2',
    contentComplete: false,
  };
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: [current] });
  jest
    .spyOn(getSourceById('bookshuku')!, 'parseChapterContent')
    .mockResolvedValue({ content: '尾页。', complete: true });
  await expect(useLoadNextChapterPage()(book.id, 0)).resolves.toMatchObject({
    contentComplete: true,
  });
  jest.runOnlyPendingTimers();
});

it.each([
  ['bqquge', 'https://www.bqquge.org/1'],
  ['mingzw', 'https://tw.mingzw.net/mzwchapter/1.html'],
])(
  '浏览器识别 %s 后重取专用目录，保留注册书源和正文能力',
  async (source, url) => {
    const book = {
      ...incomingBook(`${source}:1`),
      cover: 'https://covers.test/book.jpg',
      source: { name: source, bookUrl: url },
    };
    jest.mocked(addOnlineBook).mockResolvedValue(result(book, [1, 2, 3]));
    const added = await useAddRecognizedBook()({
      ...recognized([1]),
      host: new URL(url).host,
      url,
    });
    expect(addOnlineBook).toHaveBeenCalledWith(url);
    expect(added.source?.name).toBe(source);
    expect(added.cover).toBe('https://covers.test/book.jpg');
    expect(mockStore.get(chaptersAtom)[added.id]).toHaveLength(3);
  },
);

describe('启动追更只检查过期书籍', () => {
  it('跳过今天已检查和回收站书籍，不下载新章正文', async () => {
    const today = {
      ...incomingBook('today'),
      following: true,
      lastUpdateCheckAt: Date.now(),
    };
    const stale = { ...incomingBook('stale'), following: true };
    const deleted = {
      ...incomingBook('deleted'),
      following: true,
      deletedAt: 1,
    };
    mockStore.set(booksAtom, [today, stale, deleted]);
    mockStore.set(chaptersAtom, {
      stale: [chapter('stale', 'stale-0', 1, true)],
    });
    const source = getSourceById('xuanhuange')!;
    const catalog = jest.spyOn(source, 'parseCatalog').mockResolvedValue([
      { title: '第1章', url: sourceUrl(1) },
      { title: '第2章', url: sourceUrl(2) },
    ]);
    const content = jest.spyOn(source, 'parseChapterContent');
    try {
      const value = await useCheckFollowedBooks()({
        onlyIfStale: true,
        cacheNewChapters: false,
      });
      expect(value).toEqual({
        checked: 1,
        updated: 1,
        failed: 0,
        cached: 0,
        cacheFailed: 0,
      });
      expect(catalog).toHaveBeenCalledTimes(1);
      expect(content).not.toHaveBeenCalled();
      expect(mockStore.get(chaptersAtom).stale[0].content).toBe(
        chapter('stale', 'stale-0', 1, true).content,
      );
      expect(mockStore.get(chaptersAtom).stale[1].content).toBe('');
      expect(mockStore.get(booksAtom)[0]).toBe(today);
      // 手动检查不受当天限频限制，仍能检查所有有效追更书籍。
      catalog.mockClear();
      const manual = await useCheckFollowedBooks()();
      expect(manual.checked).toBe(2);
      expect(catalog).toHaveBeenCalledTimes(2);
    } finally {
      catalog.mockRestore();
      content.mockRestore();
    }
  });
});

it('加载中返回会取消底层正文，迟到结果不缓存，重新打开可以发起新请求', async () => {
  const book = incomingBook();
  const original = chapter(book.id, 'pending-chapter', 1);
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, { [book.id]: [original] });
  const late = deferred<{ content: string }>();
  const parse = jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockReturnValueOnce(late.promise);
  const ensure = useEnsureChapterContent();
  const controller = new AbortController();
  const pending = ensure(book.id, 0, { signal: controller.signal });
  await Promise.resolve();
  const sourceSignal = parse.mock.calls[0][1]!.signal!;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(sourceSignal.aborted).toBe(true);
  const content = '新的有效正文。'.repeat(100);
  parse.mockResolvedValueOnce({ content, complete: true });
  await expect(ensure(book.id, 0)).resolves.toMatchObject({ content });
  late.resolve({ content: '旧的迟到正文。'.repeat(100) });
  await Promise.resolve();
  await Promise.resolve();
  expect(mockStore.get(chaptersAtom)[book.id][0].content).toBe(content);
  expect(parse).toHaveBeenCalledTimes(2);
});

it('目录长标题在正文加载与缓存后保持原样，不降级为“章节”', async () => {
  const book = incomingBook();
  const title = `第446章 清明时节雨纷纷（${'感谢读者支持'.repeat(10)}）`;
  mockStore.set(booksAtom, [book]);
  mockStore.set(chaptersAtom, {
    [book.id]: [{ ...chapter(book.id, 'long-title', 1), title }],
  });
  jest
    .spyOn(getSourceById('xuanhuange')!, 'parseChapterContent')
    .mockResolvedValue({
      content: '完整正文。'.repeat(100),
      complete: true,
    });
  const loaded = await useEnsureChapterContent()(book.id, 0);
  expect(loaded?.title).toBe(title);
  expect(mockStore.get(chaptersAtom)[book.id][0].title).toBe(title);
});

it('TXT 详情页只有最新章节时，网页导入重取完整目录及正规书籍信息', async () => {
  const url = 'http://wap.bookshuku.org/bookinfo/149463.html';
  const book = {
    ...incomingBook('bookshuku:149463'),
    title: '都重生了谁考公务员啊',
    source: {
      name: 'bookshuku',
      bookUrl: 'http://wap.bookshuku.org/read/149463.html',
    },
  };
  const complete = result(
    book,
    Array.from({ length: 954 }, (_, index) => index + 1),
  );
  jest.mocked(addOnlineBook).mockResolvedValueOnce(complete);
  const added = await useAddRecognizedBook()({
    ...recognized(),
    url,
    host: 'wap.bookshuku.org',
    title: 'SEO 下载标题',
    chapters: recognized().chapters.slice(-2),
  });
  expect(addOnlineBook).toHaveBeenCalledWith(url);
  expect(added.title).toBe(book.title);
  expect(added.source?.name).toBe('bookshuku');
  expect(mockStore.get(chaptersAtom)[added.id]).toHaveLength(954);
});

it('TXT 完整目录校验失败时，不退回保存网页里的最新少量章', async () => {
  jest.mocked(addOnlineBook).mockRejectedValueOnce(new Error('目录解析不完整'));
  await expect(
    useAddRecognizedBook()({
      ...recognized(),
      url: 'http://wap.bookshuku.org/bookinfo/149463.html',
      host: 'wap.bookshuku.org',
    }),
  ).rejects.toThrow('目录解析不完整');
  expect(mockStore.get(booksAtom)).toEqual([]);
  expect(saveBookChapters).not.toHaveBeenCalled();
});
