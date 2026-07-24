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
  <a href="/mzwread/17482_2.html">第二章 青牛镇</a>`;

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
    ]);
  });
});
