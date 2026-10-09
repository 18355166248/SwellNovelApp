import {
  expandRecognizedCatalog,
  recognizeBookHtml,
} from '../src/services/recognize/recognizer';
import { isRequestedBrowserNavigation } from '../src/services/browserFetch/navigationGuard';

// 使用项目实际安装的 RN URL，而非 Jest/Node 的标准 URL，覆盖真机与测试环境的差异。
// eslint-disable-next-line @react-native/no-deep-imports
const { URL: NativeURL } = require('react-native/Libraries/Blob/URL');
const standardURL = global.URL;
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
});
afterEach(() => {
  global.URL = standardURL;
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
