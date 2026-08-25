import { xuanhuangeSource } from '../src/services/source/xuanhuange';
import { resolveSource, getSourceById } from '../src/services/source/registry';
import {
  fetchRenderedChapterPage,
  fetchRenderedHtml,
} from '../src/services/browserFetch/bridge';

jest.mock('../src/services/browserFetch/bridge', () => {
  const actual = jest.requireActual('../src/services/browserFetch/bridge');
  return {
    ...actual,
    fetchRenderedHtml: jest.fn(),
    fetchRenderedChapterPage: jest.fn(),
  };
});

const mockHtml = fetchRenderedHtml as jest.MockedFunction<
  typeof fetchRenderedHtml
>;
const mockChapterPage = fetchRenderedChapterPage as jest.MockedFunction<
  typeof fetchRenderedChapterPage
>;

const ORIGIN = 'http://wap.xuanhuange.info';

/** 详情页：只有书籍资料，没有章节锚点。 */
const detailHtml = `<html><head>
  <meta property="og:novel:book_name" content="道诡异仙" />
  <meta property="og:novel:author" content="狐尾的笔" />
  <meta property="og:image" content="${ORIGIN}/files/article/image/170446.jpg" />
</head><body><div class="info">状态：连载中</div></body></html>`;

/** 目录页：章节锚点 + “第 N/M 页” + 翻页链接。 */
const catalogPage = (page: number, from: number, to: number) => {
  const links = [];
  for (let i = from; i <= to; i += 1) {
    links.push(`<a href="/read/170446/${i}.html">第${i}章 标题${i}</a>`);
  }
  return `<html><body>
    <div class="chapter">${links.join('')}</div>
    <div class="page">第 ${page}/2 页
      <a href="/wapbook-170446-2/">下一页</a>
    </div>
  </body></html>`;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('玄幻阁书源', () => {
  it('已登记到书源注册表，站内各类链接都能命中', () => {
    expect(getSourceById('xuanhuange')).toBe(xuanhuangeSource);
    for (const url of [
      `${ORIGIN}/info-170446/`,
      `${ORIGIN}/wapbook-170446/`,
      `${ORIGIN}/read/170446/100.html`,
      'https://wap.xuanhuange.info/info-1/',
    ]) {
      expect(resolveSource(url)).toBe(xuanhuangeSource);
    }
    expect(resolveSource('https://example.com/info-170446/')).toBeNull();
    expect(resolveSource('not a url')).toBeNull();
  });

  it('从详情页/目录页/正文页三种链接都能取到同一个书号', () => {
    expect(xuanhuangeSource.extractId(`${ORIGIN}/info-170446/`)).toBe('170446');
    expect(xuanhuangeSource.extractId(`${ORIGIN}/wapbook-170446/`)).toBe(
      '170446',
    );
    expect(xuanhuangeSource.extractId(`${ORIGIN}/wapbook-170446-3/`)).toBe(
      '170446',
    );
    expect(xuanhuangeSource.extractId(`${ORIGIN}/read/170446/100.html`)).toBe(
      '170446',
    );
    expect(xuanhuangeSource.extractId(`${ORIGIN}/`)).toBeUndefined();
    expect(xuanhuangeSource.detailUrl('170446')).toBe(`${ORIGIN}/info-170446/`);
  });

  it('详情页解析出书名作者封面，并把目录指向 wapbook 路由', async () => {
    mockHtml.mockResolvedValue(detailHtml);
    const info = await xuanhuangeSource.parseBookInfo(
      `${ORIGIN}/read/170446/100.html`,
    );
    expect(info).toMatchObject({
      sourceBookId: '170446',
      title: '道诡异仙',
      author: '狐尾的笔',
      catalogUrl: `${ORIGIN}/wapbook-170446/`,
    });
    // 详情页没有章节锚点，必须换算到目录页才能取目录。
    expect(mockHtml).toHaveBeenCalledWith(
      `${ORIGIN}/info-170446/`,
      expect.anything(),
    );
  });

  it('目录分页逐页抓取后合并成完整章节表', async () => {
    mockHtml.mockImplementation(async url =>
      url.includes('-2/') ? catalogPage(2, 7, 12) : catalogPage(1, 1, 6),
    );

    const chapters = await xuanhuangeSource.parseCatalog({
      sourceBookId: '170446',
      title: '道诡异仙',
      author: '狐尾的笔',
      catalogUrl: `${ORIGIN}/wapbook-170446/`,
    });

    expect(chapters).toHaveLength(12);
    expect(chapters[0]).toEqual({
      title: '第1章 标题1',
      url: `${ORIGIN}/read/170446/1.html`,
    });
    expect(chapters[11].url).toBe(`${ORIGIN}/read/170446/12.html`);
    expect(mockHtml).toHaveBeenCalledWith(
      `${ORIGIN}/wapbook-170446-2/`,
      expect.anything(),
    );
  });

  it('目录页取不到章节时报错，不写入空目录', async () => {
    mockHtml.mockResolvedValue('<html><body>暂无数据</body></html>');
    await expect(
      xuanhuangeSource.parseCatalog({
        sourceBookId: '170446',
        title: '道诡异仙',
        author: '狐尾的笔',
        catalogUrl: `${ORIGIN}/wapbook-170446/`,
      }),
    ).rejects.toThrow('未识别到章节');
  });

  it('一章的多个网页子页一次读完，返回的是完整章节', async () => {
    const body = '正文段落。'.repeat(60);
    mockChapterPage.mockImplementation(async url => {
      if (url.endsWith('100.html')) {
        return {
          content: `第100章 标题\n${body}一`,
          nextPageUrl: `${ORIGIN}/read/170446/100_2.html`,
        };
      }
      if (url.endsWith('100_2.html')) {
        return {
          content: `第100章 标题\n${body}二`,
          nextPageUrl: `${ORIGIN}/read/170446/100_3.html`,
        };
      }
      return { content: `第100章 标题\n${body}三` };
    });

    const parsed = await xuanhuangeSource.parseChapterContent(
      `${ORIGIN}/read/170446/100.html`,
    );
    if (typeof parsed === 'string') throw new Error('应返回结构化正文');

    expect(mockChapterPage).toHaveBeenCalledTimes(3);
    expect(parsed.complete).toBe(true);
    expect(parsed.nextPageUrl).toBeUndefined();
    // 每个子页开头重复的章节名都被剥掉，三页正文按顺序拼接。
    expect(parsed.content.startsWith('正文段落。')).toBe(true);
    expect(parsed.content).not.toContain('第100章 标题');
    expect(parsed.content.endsWith('一\n' + body + '二\n' + body + '三')).toBe(
      true,
    );
  });

  it('正文不完整时抛错，不把广告页写进缓存', async () => {
    mockChapterPage.mockResolvedValue({ content: '请在浏览器中打开' });
    await expect(
      xuanhuangeSource.parseChapterContent(`${ORIGIN}/read/170446/100.html`),
    ).rejects.toThrow('内容不完整');
  });

  it('子页中途失败时保留已读正文，并留下续载入口', async () => {
    const body = '正文段落。'.repeat(60);
    mockChapterPage.mockImplementation(async url => {
      if (url.endsWith('100.html')) {
        return {
          content: body,
          nextPageUrl: `${ORIGIN}/read/170446/100_2.html`,
        };
      }
      throw new Error('WebView 取章节分页超时');
    });

    const parsed = await xuanhuangeSource.parseChapterContent(
      `${ORIGIN}/read/170446/100.html`,
    );
    if (typeof parsed === 'string') throw new Error('应返回结构化正文');

    expect(parsed.content).toBe(body);
    expect(parsed.complete).toBe(false);
    expect(parsed.nextPageUrl).toBe(`${ORIGIN}/read/170446/100_2.html`);
  });
});
