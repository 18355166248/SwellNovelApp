import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { extractBookMetadata } from '../src/services/recognize/bookMetadata';
import {
  RECOGNIZER_JS,
  recognizeBookHtml,
  type RecognizedBook,
} from '../src/services/recognize/recognizer';
import {
  enrichBookMetadata,
  mergeBookMetadata,
  getBookMetadataReport,
} from '../src/services/recognize/enrichBookMetadata';

const origin = 'http://wap.xuanhuange.info';
const catalog = `${origin}/wapbook-192466/`;
const detail = `${origin}/info-192466/`;
const cover = `${origin}/files/article/image/192/192466/192466s.jpg`;
// 图片节点取自真机当前详情页，其余只保留验证解析所需的书籍资料。
const detailHtml = `<title>仙工开物-玄幻阁</title><h1>《仙工开物》</h1>
  <div class="block_img2"><img src="${cover}" onerror="this.src='/images/no_photo.jpg'"></div>
  <p>作者：蛊真人</p><meta name="description" content="小说简介">`;
const seed = (extra: Partial<RecognizedBook> = {}): RecognizedBook => ({
  ok: true,
  isDetail: true,
  url: catalog,
  host: 'wap.xuanhuange.info',
  title: '仙工开物全文阅读',
  author: '佚名',
  chapters: [{ title: '第1章', url: `${origin}/wapbook-192466-63654391/` }],
  ...extra,
});

beforeEach(() => jest.spyOn(console, 'info').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it('注入脚本与唯一 TS 源保持同步，不依赖运行时函数源码', () => {
  const {
    generateMetadataScript,
    targetPath,
  } = require('../scripts/generate-book-metadata-script.cjs');
  expect(fs.readFileSync(targetPath, 'utf8')).toBe(generateMetadataScript());
  expect(RECOGNIZER_JS).not.toContain('[bytecode]');
});

it('Hermes 的函数 toString 返回 bytecode 时，网页仍执行静态提取脚本', () => {
  jest.doMock('../src/services/recognize/bookMetadata', () => {
    const actual = jest.requireActual('../src/services/recognize/bookMetadata');
    const extractor = actual.extractBookMetadata.bind(null);
    extractor.toString = () =>
      'function extractBookMetadata(a0, a1, a2) { [bytecode] }';
    return { ...actual, extractBookMetadata: extractor };
  });
  try {
    jest.isolateModules(() => {
      const {
        RECOGNIZER_JS: script,
      } = require('../src/services/recognize/recognizer');
      const dom = new JSDOM(detailHtml, {
        url: detail,
        runScripts: 'outside-only',
      });
      const postMessage = jest.fn();
      Object.defineProperty(dom.window, 'ReactNativeWebView', {
        value: { postMessage },
      });
      dom.window.eval(script);
      expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject({
        title: '仙工开物',
        cover,
      });
      dom.window.close();
    });
  } finally {
    jest.dontMock('../src/services/recognize/bookMetadata');
  }
});

it('DOM 和 HTML 共用同一提取器，读取玄幻阁真实封面容器并清理书名', () => {
  const expected = { title: '仙工开物', author: '蛊真人', cover };
  expect(recognizeBookHtml(detailHtml, detail)).toMatchObject(expected);
  const dom = new JSDOM(detailHtml, {
    url: detail,
    runScripts: 'outside-only',
  });
  const postMessage = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage },
  });
  dom.window.eval(RECOGNIZER_JS);
  expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject(expected);
  dom.window.close();
});

it('优先结构化书籍资料，排除广告脚本、无关图片和占位封面', () => {
  const html = `<img src="/ad.jpg"><script>var ad='<div class="cover"><img src="/fake.jpg"></div>';</script>
    <div class="block_img2"><img src="/images/no_photo.jpg"></div>
    <script type="application/ld+json">{"@type":"Book","name":"仙工开物","author":{"name":"蛊真人"},"image":{"url":"/real.jpg"}}</script>`;
  expect(extractBookMetadata(html, detail, URL)).toMatchObject({
    title: '仙工开物',
    author: '蛊真人',
    cover: `${origin}/real.jpg`,
  });
  expect(
    extractBookMetadata(
      html.replace(/<script type[\s\S]*?<\/script>/, ''),
      detail,
      URL,
    ).cover,
  ).toBeUndefined();
});

it('目录导入自动补取已注册书源详情，不改章节和目录地址', async () => {
  const original = seed();
  const fetchHtml = jest.fn().mockResolvedValue(detailHtml);
  const { book, report } = await enrichBookMetadata(original, { fetchHtml });
  expect(fetchHtml.mock.calls.map(call => call[0])).toEqual([detail]);
  expect(book).toMatchObject({
    title: '仙工开物',
    author: '蛊真人',
    cover,
    url: catalog,
  });
  expect(book.chapters).toBe(original.chapters);
  expect(report.attempts[0]).toMatchObject({
    status: 'merged',
    via: 'source-detail',
    fields: ['title', 'author', 'cover', 'description'],
  });
  expect(getBookMetadataReport(catalog)).toBe(report);
  expect(report.remaining).toEqual([]);
});

it('未知站点沿书名/详情链接发现资料，不需要注册站点适配', async () => {
  const url = 'https://novel.test/catalog/abc';
  const initial = recognizeBookHtml(
    '<title>仙工开物全文阅读</title><a href="/book/abc">仙工开物txt下载</a>',
    url,
  );
  const fetchHtml = jest.fn().mockResolvedValue(detailHtml);
  const { book } = await enrichBookMetadata(
    { ...initial, ok: true, isDetail: true },
    { fetchHtml },
  );
  expect(fetchHtml.mock.calls[0][0]).toBe('https://novel.test/book/abc');
  expect(book.cover).toBe(cover);
});

it('旧未知站点书籍先回读原页，再沿详情链接补全，循环地址只访问一次', async () => {
  const url = 'https://novel.test/catalog/abc';
  const fetchHtml = jest.fn(async (target: string) =>
    target === url
      ? '<title>仙工开物目录</title><a href="/book/abc">书籍详情</a>'
      : `${detailHtml}<a href="${url}">仙工开物</a>`,
  );
  const { book } = await enrichBookMetadata(seed({ url }), { fetchHtml });
  expect(fetchHtml.mock.calls.map(call => call[0])).toEqual([
    url,
    'https://novel.test/book/abc',
  ]);
  expect(book.cover).toBe(cover);
});

it('已知书源排除其他书号和外站，未知站点还要核对书名', async () => {
  const fetchHtml = jest
    .fn()
    .mockResolvedValue(
      '<h1>另一本小说</h1><meta property="og:image" content="/wrong.jpg">',
    );
  const { book, report } = await enrichBookMetadata(
    seed({
      metadataLinks: [
        { url: `${origin}/info-999/`, reason: 'book-link' },
        { url: 'https://ad.test/book', reason: 'canonical' },
      ],
    }),
    { fetchHtml },
  );
  expect(book.cover).toBeUndefined();
  expect(
    report.attempts.filter(item => item.status === 'rejected'),
  ).toHaveLength(4);
  expect(fetchHtml).toHaveBeenCalledTimes(2);
});

it('一个备用地址失败后继续下一个，特殊提取规则也共用补全流程', async () => {
  const fetchHtml = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(
      '<h1>仙工开物</h1><div data-cover="/custom.jpg"></div>',
    );
  const { book, report } = await enrichBookMetadata(seed(), {
    fetchHtml,
    extensions: [
      {
        id: 'test-custom',
        matches: () => true,
        candidates: () => [
          { url: `${origin}/info-192466/?legacy=1`, reason: 'legacy' },
        ],
        extract: html =>
          html.includes('data-cover')
            ? { author: '蛊真人', cover: `${origin}/custom.jpg` }
            : {},
      },
    ],
  });
  expect(book.cover).toBe(`${origin}/custom.jpg`);
  expect(report.attempts.map(item => item.status)).toEqual([
    'failed',
    'merged',
  ]);
});

it('补全失败保留原目录、资料和阅读进度，严格遵守请求次数', async () => {
  const original = seed({
    metadataLinks: Array.from({ length: 8 }, (_, i) => ({
      url: `${detail}?v=${i}`,
      reason: 'fallback',
    })),
  });
  const { book, report } = await enrichBookMetadata(original, {
    fetchHtml: jest.fn().mockRejectedValue(new Error('offline')),
    maxRequests: 2,
  });
  expect(book).toEqual(original);
  expect(report.attempts).toHaveLength(2);
  const current = {
    title: '仙工开物全文阅读',
    author: '蛊真人',
    cover: '/current.jpg',
    progress: 42,
  };
  expect(
    mergeBookMetadata(current, {
      title: '仙工开物',
      author: '别人',
      cover: '/new.jpg',
    }),
  ).toEqual({ ...current, title: '仙工开物' });
});

it('整体时间预算耗尽也返回目录，不等待永不响应的抓取', async () => {
  jest.useFakeTimers();
  try {
    const original = seed();
    const pending = enrichBookMetadata(original, {
      fetchHtml: () => new Promise(() => {}),
      timeoutMs: 100,
    });
    await jest.advanceTimersByTimeAsync(101);
    const { book, report } = await pending;
    expect(book).toEqual(original);
    expect(report.attempts[0].reason).toBe('budget-timeout');
  } finally {
    jest.useRealTimers();
  }
});

it('用户取消后停止候选抓取，不提交迟到的资料', async () => {
  const controller = new AbortController();
  const fetchHtml = jest.fn(() => new Promise<string>(() => {}));
  const pending = enrichBookMetadata(seed(), {
    fetchHtml,
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchHtml).toHaveBeenCalledTimes(1);
  expect(getBookMetadataReport(catalog)).toMatchObject({
    outcome: 'cancelled',
    attempts: [{ status: 'cancelled', reason: 'caller-aborted' }],
  });
});

it('玄鉴仙族真实封面沿用 nocover 文件名时，DOM、HTML 和补全均保留站点封面', async () => {
  const url = `${origin}/wapbook-220996/`;
  // 真机已确认这个地址实际显示本书封面，文件名不能作为图片内容的证据。
  const html = `<title>玄鉴仙族txt下载-季越人-玄幻阁</title><h1>《玄鉴仙族》</h1>
    <div class="block_img2"><img src="http://wap.xuanhuange.info/modules/article/images/nocover.jpg"></div>
    <p>作者：<a>季越人</a></p>`;
  const extracted = recognizeBookHtml(html, `${origin}/info-220996/`);
  const siteCover = `${origin}/modules/article/images/nocover.jpg`;
  expect(extracted.cover).toBe(siteCover);
  expect(extracted.metadataIssues).toEqual([]);
  const dom = new JSDOM(html, {
    url: `${origin}/info-220996/`,
    runScripts: 'outside-only',
  });
  const postMessage = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage },
  });
  dom.window.eval(RECOGNIZER_JS);
  expect(JSON.parse(postMessage.mock.calls[0][0]).cover).toBe(siteCover);
  dom.window.close();
  const { book, report } = await enrichBookMetadata(
    seed({ url, title: '玄鉴仙族', author: '季越人' }),
    { fetchHtml: jest.fn().mockResolvedValue(html) },
  );
  expect(book.cover).toBe(siteCover);
  expect(report).toMatchObject({
    outcome: 'complete',
    remaining: ['description'],
  });
  expect(report.attempts[0]).toMatchObject({
    status: 'merged',
    fields: ['cover'],
    rules: { cover: 'image:book-container' },
    issues: [],
  });
});

it('放宽 nocover 文件名不允许提取无关图片，也继续过滤 no_photo 加载失败图', () => {
  const html =
    '<h1>玄鉴仙族</h1><img src="/images/nocover.jpg"><div class="block_img2"><img src="/images/no_photo.jpg"></div>';
  expect(
    extractBookMetadata(html, `${origin}/info-220996/`, URL),
  ).toMatchObject({
    metadataIssues: ['placeholder-cover'],
  });
  expect(
    extractBookMetadata(html, `${origin}/info-220996/`, URL).cover,
  ).toBeUndefined();
});
