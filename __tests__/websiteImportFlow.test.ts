import { createStore } from 'jotai';
import { JSDOM } from 'jsdom';
import {
  booksAtom,
  chaptersAtom,
  readingHistoryAtom,
  bookmarksAtom,
} from '../src/store/atoms';
import {
  useAddRecognizedBook,
  useEnsureChapterContent,
  useCheckBookUpdate,
} from '../src/store/hooks/useOnlineBook';
import {
  RECOGNIZER_JS,
  recognizeBookHtml,
  type RecognizedBook,
} from '../src/services/recognize/recognizer';
import { prepareRecognizedCatalog } from '../src/services/recognize/prepareRecognizedCatalog';
import {
  fetchRenderedHtml,
  fetchRenderedChapterPage,
} from '../src/services/browserFetch/bridge';
import {
  saveBookChapters,
  loadBookChapters,
} from '../src/utils/libraryStorage';
import type { Chapter } from '../src/store/types/book';

let mockStore = createStore();
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));
jest.mock('../src/utils/libraryStorage', () => ({
  loadBookChapters: jest.fn(),
  saveBookChapters: jest.fn(),
}));
jest.mock('../src/services/browserFetch/bridge', () => ({
  ...jest.requireActual('../src/services/browserFetch/bridge'),
  fetchRenderedHtml: jest.fn(),
  fetchRenderedChapterPage: jest.fn(),
}));

const origin = 'http://wap.xuanhuange.info';
const detailUrl = `${origin}/info-192466/`;
const catalogUrl = `${origin}/wapbook-192466/`;
const page2Url = `${origin}/wapbook-192466_2/`;
const chapterUrl = (n: number) => `${origin}/wapbook-192466-${63654000 + n}/`;
const header =
  '<h1>《集成小说》</h1><p>作者：回归作者</p><div class="block_img2"><img src="/cover.jpg"></div>';
const links = (numbers: number[]) =>
  numbers.map(n => `<a href="${chapterUrl(n)}">第${n}章 故事</a>`).join('');
const detail = `${header}<a href="/wapbook-192466/">查看目录</a>${links([
  12, 11, 10, 9, 8, 7,
])}`;
const first = `${header}${links([
  1, 2, 3, 4, 5, 6,
])}<a href="/wapbook-192466_2/">下一页</a><p>第1/2页</p>`;
const second = `${header}${links([
  7, 8, 9, 10, 11, 12,
])}<a href="/wapbook-192466_2/">尾页</a><p>第2/2页</p>`;
let files: Map<string, Chapter[]>;

beforeEach(() => {
  mockStore = createStore();
  files = new Map();
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.mocked(saveBookChapters).mockImplementation(async (id, chapters) => {
    files.set(id, structuredClone(chapters));
  });
  jest
    .mocked(loadBookChapters)
    .mockImplementation(async id => files.get(id) ?? null);
  jest.mocked(fetchRenderedHtml).mockImplementation(async url => {
    const html = new Map([
      [detailUrl, detail],
      [catalogUrl, first],
      [page2Url, second],
    ]).get(url);
    if (!html) throw new Error('unexpected URL ' + url);
    return html;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function domRecognize(html: string, url: string): RecognizedBook {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document.body, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const post = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage: post },
  });
  try {
    dom.window.eval(RECOGNIZER_JS);
    return JSON.parse(post.mock.calls[0][0]);
  } finally {
    dom.window.close();
  }
}

it('完整链路：DOM详情预览→完整分页→重复入库→阅读缓存→重启懒加载→目录插章更新', async () => {
  const preview = domRecognize(detail, detailUrl);
  expect(preview.chapters).toHaveLength(6);
  expect(preview.catalogUrl).toBe(catalogUrl);
  const expanded = await prepareRecognizedCatalog(preview, url =>
    fetchRenderedHtml(url),
  );
  expect(expanded.chapters.map(c => c.url)).toEqual(
    Array.from({ length: 12 }, (_, i) => chapterUrl(i + 1)),
  );
  const add = useAddRecognizedBook();
  const book = await add(expanded);
  expect(book).toMatchObject({
    title: '集成小说',
    author: '回归作者',
    cover: `${origin}/cover.jpg`,
    totalChapters: 12,
    source: { name: 'xuanhuange', bookUrl: catalogUrl },
  });
  expect((await add(expanded)).id).toBe(book.id);
  expect(mockStore.get(booksAtom)).toHaveLength(1);
  jest.useFakeTimers();
  jest
    .mocked(fetchRenderedChapterPage)
    .mockResolvedValue({ content: '真实结构回归正文。'.repeat(80) });
  const cached = await useEnsureChapterContent()(book.id, 3);
  expect(cached?.contentComplete).toBe(true);
  jest.runOnlyPendingTimers();
  await Promise.resolve();
  jest.useRealTimers();
  mockStore.set(booksAtom, [
    { ...book, currentChapterId: cached!.id, progress: 30, following: true },
  ]);
  mockStore.set(readingHistoryAtom, {
    [book.id]: {
      bookId: book.id,
      chapterId: cached!.id,
      position: 100,
      updatedAt: 1,
    },
  });
  mockStore.set(bookmarksAtom, {
    [book.id]: [
      {
        id: 'mark',
        bookId: book.id,
        chapterId: cached!.id,
        position: 100,
        createdAt: 1,
      },
    ],
  });
  // 新 store 模拟进程重启；只恢复书架资料，更新必须从持久化层懒加载旧正文。
  const restored = createStore();
  restored.set(booksAtom, mockStore.get(booksAtom));
  restored.set(readingHistoryAtom, mockStore.get(readingHistoryAtom));
  restored.set(bookmarksAtom, mockStore.get(bookmarksAtom));
  mockStore = restored;
  jest
    .mocked(fetchRenderedHtml)
    .mockImplementation(async url =>
      url === catalogUrl
        ? `${header}${links([
            1, 2, 13, 3, 4, 5, 6,
          ])}<a href="/wapbook-192466_2/">下一页</a><p>第1/2页</p>`
        : second,
    );
  expect(await useCheckBookUpdate()(book.id)).toBe(1);
  expect(mockStore.get(chaptersAtom)[book.id]).toHaveLength(13);
  expect(mockStore.get(chaptersAtom)[book.id][4]).toMatchObject({
    id: cached!.id,
    content: cached!.content,
  });
  expect(mockStore.get(readingHistoryAtom)[book.id].position).toBe(100);
  expect(mockStore.get(bookmarksAtom)[book.id][0].chapterId).toBe(cached!.id);
  expect(mockStore.get(booksAtom)[0].unreadUpdates).toBe(1);
});

it('未知站点也从明确目录链接扩展，且后续能直接检查更新', async () => {
  const url = 'https://novel.test/book/a';
  const target = 'https://novel.test/catalog/a';
  const markup = (count: number) =>
    '<h1>未知站小说</h1>' +
    Array.from(
      { length: count },
      (_, i) => `<a href="/read/a/${i}.html">第${i + 1}章 故事</a>`,
    ).join('');
  const preview = domRecognize(
    '<h1>未知站小说</h1><a href="/catalog/a">全部目录</a>' + markup(5),
    url,
  );
  jest.mocked(fetchRenderedHtml).mockResolvedValue(markup(8));
  const expanded = await prepareRecognizedCatalog(preview, u =>
    fetchRenderedHtml(u),
  );
  expect(expanded.url).toBe(target);
  const book = await useAddRecognizedBook()({
    ...expanded,
    metadataChecked: true,
  });
  expect(book.totalChapters).toBe(8);
  jest.mocked(fetchRenderedHtml).mockResolvedValue(markup(9));
  expect(await useCheckBookUpdate()(book.id)).toBe(1);
  expect(mockStore.get(chaptersAtom)[book.id]).toHaveLength(9);
});

it('取消分页抓取会立即终止，不重试、不入库，下一次能重试成功', async () => {
  const controller = new AbortController();
  const pending = new Promise<string>(() => {});
  const fetch = jest.fn().mockReturnValue(pending);
  const running = prepareRecognizedCatalog(
    recognizeBookHtml(first, catalogUrl),
    fetch,
    undefined,
    controller.signal,
  );
  controller.abort();
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(saveBookChapters).not.toHaveBeenCalled();
  expect(mockStore.get(booksAtom)).toEqual([]);
  const retried = await prepareRecognizedCatalog(
    recognizeBookHtml(first, catalogUrl),
    async () => second,
  );
  expect(retried.chapters).toHaveLength(12);
});

it('详情入口指向其他书或外站时拒绝，不混入推荐目录', async () => {
  const preview = recognizeBookHtml(detail, detailUrl);
  // 选择未知站以检查页面提供的入口；已知玄幻阁优先使用站内书号路由。
  await expect(
    prepareRecognizedCatalog(
      {
        ...preview,
        url: 'https://novel.test/book/a',
        catalogUrl: 'https://ads.test/catalog',
      },
      jest.fn(),
    ),
  ).rejects.toThrow('不属于');
  await expect(
    prepareRecognizedCatalog(preview, async () =>
      first.replace('集成小说', '另一本小说'),
    ),
  ).rejects.toThrow('同一本书');
});

it('OG占位图不会从旧兼容分支重新写回DOM预览', () => {
  const html = detail
    .replace(
      '<h1>',
      '<meta property="og:image" content="/images/no_photo.jpg"><h1>',
    )
    .replace('<img src="/cover.jpg">', '<img src="/images/no_photo.jpg">');
  expect(domRecognize(html, detailUrl).cover).toBe('');
  expect(recognizeBookHtml(html, detailUrl).cover).toBe('');
});
