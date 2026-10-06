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

  it('目录分段最多三路并发，乱序返回仍按章节顺序合并', async () => {
    let active = 0;
    let peak = 0;
    const pending: Array<() => void> = [];
    mockFetchHtml.mockImplementation(async url => {
      if (url.includes('/mzwchapter/')) {
        return [0, 100, 200, 300, 400]
          .map(
            start =>
              `<a href="/mclist/17482_${start}_${start + 100}.html">目录</a>`,
          )
          .reverse()
          .join('');
      }
      const start = Number(url.match(/17482_(\d+)_/)?.[1]);
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => {
        pending.push(resolve);
      });
      active--;
      return `<a href="/mzwread/17482_${start + 1}.html">第${
        start + 1
      }章 正文</a>`;
    });
    const parsing = mingzwSource.parseCatalog({
      sourceBookId: '17482',
      title: '测试',
      author: '测试作者',
      catalogUrl: 'https://tw.mingzw.net/mzwchapter/17482.html',
    });
    // 先让后三路乱序完成，再释放后续分段，避免测试依赖真实计时器。
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(pending).toHaveLength(3);
    pending[2]();
    pending[1]();
    pending[0]();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    pending[4]();
    pending[3]();
    const chapters = await parsing;
    expect(peak).toBe(3);
    expect(chapters.map(item => item.title)).toEqual(
      [1, 101, 201, 301, 401].map(number => `第${number}章 正文`),
    );
  });

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

  const info = {
    sourceBookId: '17482',
    title: '凡人修仙传',
    author: '忘语',
    catalogUrl: 'https://tw.mingzw.net/mzwchapter/17482.html',
  };

  it('空分段切换镜像后恢复，本书以外的目录链接不能混入', async () => {
    mockFetchHtml.mockImplementation(async url => {
      if (url.includes('/mzwchapter/'))
        return CATALOG_PAGE + '<a href="/mclist/999_0_100.html">推荐书</a>';
      if (url.includes('tw.mingzw.net') && url.includes('_100_200'))
        return '<h1>广告页</h1>';
      return SEGMENT_PAGE + '<a href="/mzwread/999_1.html">第一章 其他书</a>';
    });
    const chapters = await mingzwSource.parseCatalog(info);
    expect(chapters).toHaveLength(3);
    expect(chapters.every(chapter => chapter.url.includes('17482_'))).toBe(
      true,
    );
    expect(
      mockFetchHtml.mock.calls.some(([url]) => url.includes('/mclist/999_')),
    ).toBe(false);
    expect(
      mockFetchHtml.mock.calls.some(
        ([url]) => url === 'https://www.mingzw.net/mclist/17482_100_200.html',
      ),
    ).toBe(true);
  });

  it('任一分段两节点都返回无效目录时拒绝残目录入库', async () => {
    mockFetchHtml.mockImplementation(async url => {
      if (url.includes('/mzwchapter/')) return CATALOG_PAGE;
      return url.includes('_100_200') ? '<h1>请稍后再试</h1>' : SEGMENT_PAGE;
    });
    await expect(mingzwSource.parseCatalog(info)).rejects.toThrow(
      '目录第 2 段加载失败',
    );
  });

  it('短书直接使用完整目录页的章节，无需多抓取不存在的分段页', async () => {
    mockFetchHtml.mockResolvedValue(SEGMENT_PAGE);
    expect(await mingzwSource.parseCatalog(info)).toHaveLength(3);
    expect(mockFetchHtml).toHaveBeenCalledTimes(1);
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
