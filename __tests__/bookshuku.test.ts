import { bookshukuSource } from '../src/services/source/bookshuku';
import { fetchHtml } from '../src/services/http/fetchHtml';

jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));

const mockFetch = fetchHtml as jest.MockedFunction<typeof fetchHtml>;

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

const CH1_P1 = `<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;第一章 (第1/3页)<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;第一段正文。<br />第二段正文。<br /></p></div>`;
const CH1_P2 = `<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;（第2/3页）<br />第三段正文。<br /></p></div>`;
const CH1_P3 = `<div class="articlecon font-large"><p>&nbsp;&nbsp;&nbsp;&nbsp;（第3/3页）<br />第四段正文。<br /></p></div>`;

beforeEach(() => {
  mockFetch.mockReset();
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

  it('parseCatalog 解析章节并把相对 URL 转绝对', async () => {
    const info = await bookshukuSource.parseBookInfo(
      'http://wap.bookshuku.org/bookinfo/160297.html',
    );
    const chapters = await bookshukuSource.parseCatalog(info);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toEqual({
      title: '第一章',
      url: 'http://wap.bookshuku.org/read/160297_1.html',
    });
    expect(chapters[1].url).toBe('http://wap.bookshuku.org/read/160297_2.html');
  });

  it('parseChapterContent 拼接多子页、去分页标记与标题回显', async () => {
    const content = await bookshukuSource.parseChapterContent(
      'http://wap.bookshuku.org/read/160297_1.html',
    );
    expect(content).toBe(
      ['第一段正文。', '第二段正文。', '第三段正文。', '第四段正文。'].join('\n'),
    );
    expect(content).not.toMatch(/第\d+\/\d+页/);
    expect(content).not.toContain('第一章');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://wap.bookshuku.org/read/160297_1_2.html',
    );
  });
});
