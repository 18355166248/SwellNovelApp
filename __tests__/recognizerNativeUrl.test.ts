import {
  expandRecognizedCatalog,
  recognizeBookHtml,
} from '../src/services/recognize/recognizer';
import { isRequestedBrowserNavigation } from '../src/services/browserFetch/navigationGuard';
import { normalizedChapterIdentity } from '../src/utils/catalogRepair';
import {
  chapterPageIdentity,
  collectChapterPages,
} from '../src/services/source/chapterPages';
import { mingzwSource } from '../src/services/source/mingzw';
import { fetchHtml } from '../src/services/http/fetchHtml';

jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));

// 使用项目实际安装的 RN URL，而非 Jest/Node 的标准 URL，覆盖真机与测试环境的差异。
// eslint-disable-next-line @react-native/no-deep-imports
const nativeUrlModule = require('react-native/Libraries/Blob/URL');
const { URL: NativeURL, URLSearchParams: NativeParams } = nativeUrlModule;
const standardURL = global.URL;
const standardParams = global.URLSearchParams;
const origin = 'http://wap.xuanhuange.info';
const firstUrl = `${origin}/wapbook-192466/`;
const secondUrl = `${origin}/wapbook-192466_2/`;
// 2026-10-09 从 Swell5 当前第二页抽取的少量目录锚点，不包含小说正文。
const pageTwo = `<h1>仙工开物</h1>
  <a href="/wapbook-192466-63854586/">第30章：只有一个人的榜单</a>
  <a href="/wapbook-192466-63854771/">第31章：我不想上榜啊！</a>
  <a href="/wapbook-192466-63856251/">第32章：暴露？</a>
  <a href="/wapbook-192466-63856811/">第33章：魂归</a>
  <a href="/wapbook-192466-63864222/">第34章：凤魂血香</a>
  <a href="/wapbook-192466_1/">首页</a>
  <a href="/wapbook-192466_3/">下一页</a>
  <a href="/wapbook-192466_30/">尾页</a>
  <p>第2/30页</p>`;

beforeEach(() => {
  global.URL = NativeURL;
  global.URLSearchParams = NativeParams;
});
afterEach(() => {
  global.URL = standardURL;
  global.URLSearchParams = standardParams;
  jest.clearAllMocks();
});

it('RN 环境章节身份保留含等号的参数值，不误合并不同链接', () => {
  expect(
    normalizedChapterIdentity('https://novel.test/read.php?id=1&token=a=b'),
  ).toBe('url:novel.test/read.php?id=1&token=a%3Db');
  expect(
    normalizedChapterIdentity('https://novel.test/read.php?id=1&token=a=b'),
  ).not.toBe(
    normalizedChapterIdentity('https://novel.test/read.php?id=1&token=a'),
  );
});

it('RN 环境正确规范分页协议、域名、锚点与参数顺序，换入口也能阻止循环', async () => {
  const first = 'http://wap.novel.test/read.php?a=1&b=2';
  const duplicate = 'https://www.novel.test/read.php?b=2&a=1#tail';
  expect(chapterPageIdentity(first)).toBe(chapterPageIdentity(duplicate));
  const fetchPage = jest.fn().mockRejectedValue(new Error('不应请求重复子页'));
  const result = await collectChapterPages({
    firstPageUrl: first,
    firstContent: '已读正文',
    firstNextPageUrl: duplicate,
    fetchPage,
    cleanPage: text => text,
  });
  expect(fetchPage).not.toHaveBeenCalled();
  expect(result.content).toBe('已读正文');
});

it('RN 环境明智屋 .html 章节不被自动追加斜杠，分段目录能成功解析', async () => {
  jest
    .mocked(fetchHtml)
    .mockResolvedValue(
      '<a href="/mzwread/17482_1.html">第一章 七玄门</a><a href="/mzwread/17482_2.html">第二章 青牛镇</a>',
    );
  const chapters = await mingzwSource.parseCatalog({
    sourceBookId: '17482',
    title: '测试书',
    author: '作者',
    catalogUrl: 'https://tw.mingzw.net/mzwchapter/17482.html',
  });
  expect(chapters.map(c => c.url)).toEqual([
    'https://tw.mingzw.net/mzwread/17482_1.html',
    'https://tw.mingzw.net/mzwread/17482_2.html',
  ]);
});

it('原生环境能解析玄幻阁分页的根相对章节链接及全部分页地址', () => {
  const book = recognizeBookHtml(pageTwo, secondUrl);
  expect(book.isDetail).toBe(true);
  expect(book.chapters).toHaveLength(5);
  expect(book.chapters[0].url).toBe(`${origin}/wapbook-192466-63854586/`);
  expect(book.pageUrls).toHaveLength(29);
  expect(book.pageUrls?.[0]).toBe(`${origin}/wapbook-192466_1/`);
  expect(book.pageUrls?.at(-1)).toBe(`${origin}/wapbook-192466_30/`);
});

it('原生环境合并目录时能读到第二页的新章节', async () => {
  const firstHtml = `<h1>仙工开物</h1>${Array.from(
    { length: 5 },
    (_, index) =>
      `<a href="/wapbook-192466-${63654391 + index}/">第${index + 1}章</a>`,
  ).join('')}`;
  const first = recognizeBookHtml(firstHtml, firstUrl);
  first.pageUrls = [secondUrl];
  const fetchPage = jest.fn().mockResolvedValue(pageTwo);
  const expanded = await expandRecognizedCatalog(first, fetchPage);
  expect(fetchPage).toHaveBeenCalledTimes(1);
  expect(expanded.chapters).toHaveLength(10);
  expect(expanded.chapters[5].url).toBe(`${origin}/wapbook-192466-63854586/`);
  expect(expanded.pageUrls).toEqual([]);
});

it('原生环境收到目录结果和完成入库后能校验当前页面，忽略锚点', () => {
  expect(isRequestedBrowserNavigation(secondUrl, `${secondUrl}#list`)).toBe(
    true,
  );
  expect(isRequestedBrowserNavigation(secondUrl, firstUrl)).toBe(false);
});

it('RN 环境资料提取也能正确解析根相对封面和详情链接', () => {
  const book = recognizeBookHtml(
    `<h1>仙工开物</h1>
    <div class="block_img2"><img src="/files/192466.jpg"></div>
    <a href="/info-192466/">仙工开物txt下载</a>`,
    secondUrl,
  );
  expect(book.cover).toBe(`${origin}/files/192466.jpg`);
  expect(book.metadataLinks).toContainEqual({
    url: `${origin}/info-192466/`,
    reason: 'book-link',
  });
});
