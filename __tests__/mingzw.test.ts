import { mingzwSource } from '../src/services/source/mingzw';
import { fetchHtml } from '../src/services/http/fetchHtml';

jest.mock('../src/services/http/fetchHtml', () => ({
  fetchHtml: jest.fn(),
}));

const mockFetchHtml = fetchHtml as jest.MockedFunction<typeof fetchHtml>;

const BOOK_PAGE = `
  <html><head><title>凡人修仙传最新章节,凡人修仙传全本在线阅读-明智屋</title></head>
  <body>作者: <a>忘语</a></body></html>`;
const CATALOG_PAGE = `
  <a href="/mclist/17482_0_100.html">第1章 ---- 第100章</a>
  <a href="/mclist/17482_100_200.html">第100章 ---- 第200章</a>`;
const SEGMENT_PAGE = `
  <a href="/mzwread/17482_1.html">第一章 七玄门</a>
  <a href="/mzwread/17482_2.html">第二章 青牛镇</a>
  <a href="/miread/frxxz_17482_3.html">第三章 山中人</a>`;

const LONG_ARTICLE =
  '这是一段完整的章节正文，用来确认嵌套广告不会截断后面的内容。'.repeat(12);

describe('mingzwSource', () => {
  beforeEach(() => mockFetchHtml.mockReset());

  it('兼容当前 mzwbook/mzwchapter/mzwread 路由并保留真实章节标题', async () => {
    mockFetchHtml.mockImplementation(async url => {
      if (url.endsWith('/mzwbook/17482.html')) return BOOK_PAGE;
      if (url.endsWith('/mzwchapter/17482.html')) return CATALOG_PAGE;
      if (/\/mclist\/17482_(?:0_100|100_200)\.html$/.test(url))
        return SEGMENT_PAGE;
      throw new Error(`unexpected url ${url}`);
    });

    const info = await mingzwSource.parseBookInfo(
      'https://www.mingzw.net/mclist/17482_1400_1500.html',
    );
    const chapters = await mingzwSource.parseCatalog(info);

    expect(info).toMatchObject({
      sourceBookId: '17482',
      title: '凡人修仙传',
      author: '忘语',
      catalogUrl: 'https://tw.mingzw.net/mzwchapter/17482.html',
    });
    expect(chapters).toEqual([
      {
        title: '第一章 七玄门',
        url: 'https://tw.mingzw.net/mzwread/17482_1.html',
      },
      {
        title: '第二章 青牛镇',
        url: 'https://tw.mingzw.net/mzwread/17482_2.html',
      },
      {
        title: '第三章 山中人',
        url: 'https://tw.mingzw.net/miread/frxxz_17482_3.html',
      },
    ]);
  });

  it('parseChapterContent 保留正文容器嵌套 div 后的完整内容', async () => {
    mockFetchHtml.mockResolvedValue(`
      <div id="content">
        <p>第一章 测试</p>
        <p>${LONG_ARTICLE}</p>
        <div class="ad"><span>广告占位</span></div>
        <p>嵌套广告后的结尾正文不能丢失。</p>
      </div>
    `);

    const result = await mingzwSource.parseChapterContent(
      'https://tw.mingzw.net/miread/frxxz_17482_3.html',
    );
    const content = typeof result === 'string' ? result : result.content;

    expect(content).toContain(LONG_ARTICLE);
    expect(content).toContain('嵌套广告后的结尾正文不能丢失。');
    expect(typeof result === 'string' ? undefined : result.complete).toBe(true);
  });

  it('parseChapterContent 拒绝短响应并回退另一个明智屋节点', async () => {
    mockFetchHtml.mockImplementation(async url => {
      if (url.startsWith('https://tw.mingzw.net/')) {
        return '<div id="content"><p>响应被截断。</p></div>';
      }
      return `<div id="content"><p>${LONG_ARTICLE}</p></div>`;
    });

    const result = await mingzwSource.parseChapterContent(
      'https://tw.mingzw.net/mzwread/17482_3.html',
    );
    const content = typeof result === 'string' ? result : result.content;

    expect(content).toBe(LONG_ARTICLE);
    expect(mockFetchHtml).toHaveBeenCalledWith(
      'https://www.mingzw.net/mzwread/17482_3.html',
      30000,
      { preferLocalProxy: true, requireLocalProxy: true },
    );
  });
});
