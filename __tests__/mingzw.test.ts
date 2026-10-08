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
const SECOND_SEGMENT_PAGE = '<a href="/mzwread/17482_4.html">第四章 新旅程</a>';

const LONG_ARTICLE =
  '这是一段完整的章节正文，用来确认嵌套广告不会截断后面的内容。'.repeat(12);

describe('mingzwSource', () => {
  beforeEach(() => mockFetchHtml.mockReset());

  it('设备可用时不强制走代理，避免代理故障拖住蜂窝网的正常读取', async () => {
    mockFetchHtml.mockResolvedValue(BOOK_PAGE);
    const info = await mingzwSource.parseBookInfo(
      'https://tw.mingzw.net/mzwbook/17482.html',
    );
    expect(info.title).toBe('凡人修仙传');
    expect(mockFetchHtml).toHaveBeenCalledTimes(1);
    const options = mockFetchHtml.mock.calls[0][2];
    expect(options?.preferLocalProxy).not.toBe(true);
    expect(options?.requireLocalProxy).not.toBe(true);
  });

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
        return url.includes('_100_200') ? SECOND_SEGMENT_PAGE : SEGMENT_PAGE;
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
      {
        title: '第四章 新旅程',
        url: 'https://tw.mingzw.net/mzwread/17482_4.html',
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
      return (
        (url.includes('_100_200') ? SECOND_SEGMENT_PAGE : SEGMENT_PAGE) +
        '<a href="/mzwread/999_1.html">第一章 其他书</a>'
      );
    });
    const chapters = await mingzwSource.parseCatalog(info);
    expect(chapters).toHaveLength(4);
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

  it('非空但重复的分段、缺失的中间分段均拒绝入库', async () => {
    mockFetchHtml.mockImplementation(async url =>
      url.includes('/mzwchapter/') ? CATALOG_PAGE : SEGMENT_PAGE,
    );
    await expect(mingzwSource.parseCatalog(info)).rejects.toThrow(
      '目录分段重复',
    );
    mockFetchHtml.mockResolvedValue(
      CATALOG_PAGE.replace(/_100_200/g, '_200_300'),
    );
    await expect(mingzwSource.parseCatalog(info)).rejects.toThrow(
      '目录分段不连续',
    );
  });

  it('短书直接使用完整目录页的章节，无需多抓取不存在的分段页', async () => {
    mockFetchHtml.mockResolvedValue(SEGMENT_PAGE);
    expect(await mingzwSource.parseCatalog(info)).toHaveLength(3);
    expect(mockFetchHtml).toHaveBeenCalledTimes(1);
  });

  it('保留无章号感言、序章和带空格标题，去除两种路由的同章重复项', async () => {
    mockFetchHtml.mockResolvedValue(`
      <a href="/mzwread/17482_1.html">序章</a>
      <a href="/miread/_17482_1.html">序章</a>
      <a href="/mzwread/17482_2.html">第 1 章 开始</a>
      <a href="/mzwread/17482_3.html">上架感言：新旅程</a>
      <a href="/mzwread/17482_4.html">下一章</a>
      <a href="https://evil.test/mzwread/17482_5.html">第二章 广告</a>`);
    const chapters = await mingzwSource.parseCatalog(info);
    expect(chapters.map(chapter => chapter.title)).toEqual([
      '序章',
      '第 1 章 开始',
      '上架感言：新旅程',
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
      15000,
      { signal: undefined },
    );
  });
});

it('兼容实际繁体详情布局：跳过 h1 Logo，读取 novel-name、独立封面和嵌套简介', async () => {
  mockFetchHtml.mockReset();
  mockFetchHtml.mockResolvedValue(`<title>測試小說最新章節,測試小說全本在線閱讀-明智屋</title>
    <h1 class="logo"><a>明智屋小說網</a></h1>
    <i class="status ">連載</i><i class="novel-name">《測試小說》</i>
    <div class="pic"><img src="/images/mzwid/42628.jpg"></div>
    <dl><dt>作者:</dt><dd><a href="/mzwlist/作者.html">測試作者</a></dd></dl>
    <div class="desc"><div class="title">作品介紹:</div><div class="content">這是書籍簡介。<div>簡介的後半段也需要保留。</div></div></div>`);
  const info = await mingzwSource.parseBookInfo(
    'https://tw.mingzw.net/mzwbook/42628.html',
  );
  expect(info).toMatchObject({
    title: '測試小說',
    author: '測試作者',
    cover: 'https://tw.mingzw.net/images/mzwid/42628.jpg',
    status: '連載',
  });
  expect(info.description).toContain('這是書籍簡介。');
  expect(info.description).toContain('簡介的後半段也需要保留。');
  expect(info.description).not.toContain('作品介紹:');
});

it('没有正文标题时兼容繁体 title 中的最新章節', async () => {
  mockFetchHtml.mockReset();
  mockFetchHtml.mockResolvedValue(
    '<h1 class="logo">明智屋</h1><title>測試小說最新章節,明智屋</title>',
  );
  expect(
    (
      await mingzwSource.parseBookInfo(
        'https://tw.mingzw.net/mzwbook/42628.html',
      )
    ).title,
  ).toBe('測試小說');
});

it('当前 contents 正文保留全文，剔除书名回显、标点导航和完整站点水印后的推荐书单', async () => {
  mockFetchHtml.mockReset();
  mockFetchHtml.mockResolvedValue(`<div class="contents">
    _測試小說_<p/>&larr;&rarr;：、、、、<p/>
    ${LONG_ARTICLE}<p/>正文提到新書推薦，但還有後半段。<p/>這是章節的真正結尾。<p/>
    新書推薦：、、、、 ( 明智屋中文 wWw.MinGzw.Net 沒有彈窗,更新及時 )
    <div><a href="/mzwbook/99.html">其他小說推薦</a></div><div>上一章 下一章</div>
  </div>`);
  const result = await mingzwSource.parseChapterContent(
    'https://tw.mingzw.net/mzwread/42628_1.html',
  );
  const content = typeof result === 'string' ? result : result.content;
  expect(content.startsWith(LONG_ARTICLE)).toBe(true);
  expect(content).toContain('正文提到新書推薦，但還有後半段。');
  expect(content.endsWith('這是章節的真正結尾。')).toBe(true);
  expect(content).not.toContain('其他小說推薦');
  expect(content).not.toContain('明智屋中文');
});
