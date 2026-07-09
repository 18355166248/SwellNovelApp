import { bookshukuSource } from '../src/services/source/bookshuku';
import { fetchHtml } from '../src/services/http/fetchHtml';
import { fetchRenderedHtml } from '../src/services/browserFetch/bridge';

jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));
jest.mock('../src/services/browserFetch/bridge', () => ({
  cleanRenderedText: jest.fn((text: string) => text),
  fetchRenderedContent: jest.fn(),
  fetchRenderedHtml: jest.fn(),
}));

const mockFetch = fetchHtml as jest.MockedFunction<typeof fetchHtml>;
const mockFetchRenderedHtml = fetchRenderedHtml as jest.MockedFunction<
  typeof fetchRenderedHtml
>;

// 贴近真实站点结构的最小 fixture。
const BOOKINFO = `
<div class="info">
  <div class="cover"><img src="http://img.bookshuku.org/Cover/160/160297.jpg" onerror="x" alt="捞尸人" /></div>
  <div class="detail">
    <b>捞尸人</b>
    <p>作者：<a href="/writer/160297_1.html">纯洁滴小龙</a></p>
    <p>类别：<a href="/xuanhuan/">玄幻奇幻</a></p>
    <p>状态：连载中</p>
  </div>
</div>
<p class="intro">    人知鬼恐怖，鬼晓人心毒。这是一本传统灵异小说。</p>
`;

const CATALOG = `
<ul class="chapter">
<li><a href="http://wap.bookshuku.org/read/160297_1.html">第一章</a></li>
<li><a href="/read/160297_2.html">第二章</a></li>
</ul>
`;

const FULL_CATALOG = `
<ul class="chapter">
<li><a href="http://wap.bookshuku.org/read/160297_1.html">第一章</a></li>
<li><a href="http://wap.bookshuku.org/read/160297_101.html">第九十三章</a></li>
<li><a href="http://wap.bookshuku.org/read/160297_491.html">第四百五十章</a></li>
</ul>
`;

const BAD_SPLIT_CATALOG = `
<ul class="chapter">
${Array.from(
  { length: 11 },
  (_, i) =>
    `<li><a href="http://wap.bookshuku.org/read/160297_${i + 1}.html">分节阅读 ${i + 1}</a></li>`,
).join('')}
</ul>
`;

const DESKTOP_FULL_CATALOG = `
<ul class="chapter">
${Array.from(
  { length: 701 },
  (_, i) =>
    `<li><a href="http://www.bookshuku.org/read/160297_${i + 1}.html">捞尸人 第${i + 1}章</a></li>`,
).join('')}
</ul>
`;

const LONG = '这一段正文用于测试章节分页加载完整，避免因为测试正文太短被当成无效页面。'.repeat(8);
const CH1_P1 = `
<div class="read-top">
  <li class="catalogue"><a href="http://wap.bookshuku.org/read/160297.html"><span>目录</span></a></li>
  <li class="title">捞尸人 第一章</li>
</div>
<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;第一章 (第1/3页)<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;第一段正文。${LONG}<br />第二段正文。<br /></p></div>`;
const CH1_P2 = `<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;第一章 （第2/3页）<br />第三段正文。${LONG}<br /></p></div>`;
const CH1_P3 = `<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;第一章 （第3/3页）<br />第四段正文。${LONG}<br /></p></div>`;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetchRenderedHtml.mockReset();
  mockFetchRenderedHtml.mockResolvedValue(CATALOG);
  mockFetch.mockImplementation(async (url: string) => {
    if (url.endsWith('/bookinfo/160297.html')) return BOOKINFO;
    if (url.endsWith('/read/160297.html')) return CATALOG;
    if (url.endsWith('/read/160297_1.html')) return CH1_P1;
    if (url.endsWith('/read/160297_1_2.html')) return CH1_P2;
    if (url.endsWith('/read/160297_1_3.html')) return CH1_P3;
    throw new Error(`unexpected url ${url}`);
  });
});

describe('bookshukuSource', () => {
  it('matchUrl 识别本站链接', () => {
    expect(
      bookshukuSource.matchUrl('http://wap.bookshuku.org/bookinfo/160297.html'),
    ).toBe(true);
    expect(bookshukuSource.matchUrl('http://example.com/x')).toBe(false);
  });

  it('parseBookInfo 解析书名/作者/封面/简介/状态', async () => {
    const info = await bookshukuSource.parseBookInfo(
      'http://wap.bookshuku.org/bookinfo/160297.html',
    );
    expect(info.sourceBookId).toBe('160297');
    expect(info.title).toBe('捞尸人');
    expect(info.author).toBe('纯洁滴小龙');
    expect(info.cover).toBe('http://img.bookshuku.org/Cover/160/160297.jpg');
    expect(info.description).toContain('人知鬼恐怖');
    expect(info.status).toBe('连载中');
    expect(info.catalogUrl).toBe('http://wap.bookshuku.org/read/160297.html');
  });

  it('parseCatalog 解析章节并把相对 URL 转绝对，不能用过期已知总数硬补目录', async () => {
    const chapters = await bookshukuSource.parseCatalog({
      sourceBookId: 'unknown',
      title: '测试书',
      author: '佚名',
      catalogUrl: 'http://wap.bookshuku.org/read/160297.html',
    });
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toEqual({
      title: '第一章',
      url: 'http://wap.bookshuku.org/read/160297_1.html',
    });
    expect(chapters[1].url).toBe('http://wap.bookshuku.org/read/160297_2.html');
  });

  it('parseCatalog 目录重试后保留站点真实章号，不能按 URL 序号或数组顺序命名', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/read/160297.html')) return '<html></html>';
      if (url.endsWith('/bookinfo/160297.html')) return BOOKINFO;
      throw new Error(`unexpected url ${url}`);
    });
    mockFetchRenderedHtml.mockResolvedValueOnce(FULL_CATALOG);
    const chapters = await bookshukuSource.parseCatalog({
      sourceBookId: 'unknown',
      title: '测试书',
      author: '佚名',
      catalogUrl: 'http://wap.bookshuku.org/read/160297.html',
    });

    expect(chapters).toEqual([
      {
        title: '第一章',
        url: 'http://wap.bookshuku.org/read/160297_1.html',
      },
      {
        title: '第九十三章',
        url: 'http://wap.bookshuku.org/read/160297_101.html',
      },
      {
        title: '第四百五十章',
        url: 'http://wap.bookshuku.org/read/160297_491.html',
      },
    ]);
  });

  it('parseCatalog 拒绝分节阅读占位目录，避免把坏目录写进缓存', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/read/160297.html')) return BAD_SPLIT_CATALOG;
      if (url.endsWith('/bookinfo/160297.html')) return BOOKINFO;
      throw new Error(`unexpected url ${url}`);
    });
    mockFetchRenderedHtml.mockRejectedValueOnce(new Error('webview timeout'));

    await expect(
      bookshukuSource.parseCatalog({
        sourceBookId: '160297',
        title: '捞尸人',
        author: '纯洁滴小龙',
        catalogUrl: 'http://wap.bookshuku.org/read/160297.html',
      }),
    ).rejects.toThrow('目录解析不完整');
  });

  it('parseCatalog wap 占位目录失败时用桌面域名完整目录兜底，并转回 wap URL', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith('http://www.bookshuku.org/read/160297.html')) {
        return DESKTOP_FULL_CATALOG;
      }
      if (url.endsWith('/read/160297.html')) return BAD_SPLIT_CATALOG;
      if (url.endsWith('/bookinfo/160297.html')) return BOOKINFO;
      throw new Error(`unexpected url ${url}`);
    });
    mockFetchRenderedHtml.mockRejectedValueOnce(new Error('webview timeout'));

    const chapters = await bookshukuSource.parseCatalog({
      sourceBookId: '160297',
      title: '捞尸人',
      author: '纯洁滴小龙',
      catalogUrl: 'http://wap.bookshuku.org/read/160297.html',
    });

    expect(chapters).toHaveLength(701);
    expect(chapters[0]).toEqual({
      title: '第1章',
      url: 'http://wap.bookshuku.org/read/160297_1.html',
    });
    expect(chapters[10]).toEqual({
      title: '第11章',
      url: 'http://wap.bookshuku.org/read/160297_11.html',
    });
  });

  it('parseChapterContent 拼接多子页、去分页标记与标题回显', async () => {
    const result = await bookshukuSource.parseChapterContent(
      'http://wap.bookshuku.org/read/160297_1.html',
    );
    const content = typeof result === 'string' ? result : result.content;
    const title = typeof result === 'string' ? undefined : result.title;
    expect(content).toBe(
      [
        `第一段正文。${LONG}`,
        '第二段正文。',
        `第三段正文。${LONG}`,
        `第四段正文。${LONG}`,
      ].join('\n'),
    );
    expect(content).not.toMatch(/第\d+\/\d+页/);
    expect(content).not.toContain('第一章');
    expect(title).toBe('第一章');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://wap.bookshuku.org/read/160297_1_2.html',
      30000,
      { preferLocalProxy: true, localProxyRetries: 2 },
    );
  });
});
