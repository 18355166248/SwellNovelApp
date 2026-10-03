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
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
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
