import { xs23Source } from '../src/services/source/xs23';
import { fetchHtml } from '../src/services/http/fetchHtml';
import { Buffer } from 'buffer';
jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));
const fetchMock = fetchHtml as jest.MockedFunction<typeof fetchHtml>;
const root = 'https://www.23xs.la/book/35319/';
const info = {
  sourceBookId: '35319',
  title: '夜无疆',
  author: '辰东',
  catalogUrl: root,
};
const encoded = (text: string) =>
  Buffer.from(`<p>${text}</p>`).toString('base64');
const body = (text: string, href: string) =>
  `<h1>第1章 永夜</h1><div class="word_read"><script>document.writeln(qsbs.bb('${encoded(
    text,
  )}'));</script><script>广告()</script></div><a href="${href}">下一页</a>`;
const chapter = (id: number, title: string) =>
  `<a href="/book/35319/${id}.html">${title}</a>`;
beforeEach(() => fetchMock.mockReset());
it('后段标明本章未完却指回目录时拒绝缓存为完整章', async () => {
  fetchMock.mockResolvedValue(
    body('正常正文。'.repeat(80) + '本章未完，点击下一页继续阅读', root),
  );
  await expect(
    xs23Source.parseChapterContent(`${root}100.html`),
  ).rejects.toThrow('正文未完但续页缺失');
});
it('严格验证站点及书号，正文子页使用同一书籍身份', () => {
  expect(xs23Source.extractId(`${root}100_1.html`)).toBe('35319');
  expect(xs23Source.matchUrl('https://www.23xs.la.fake.test/book/35319/')).toBe(
    false,
  );
  expect(
    xs23Source.extractId('https://www.23xs.la/book/35319/index_2.html'),
  ).toBe('35319');
});
it('从详情元信息解析作者和封面，相对地址转绝对', async () => {
  fetchMock.mockResolvedValue(
    '<meta property="og:novel:book_name" content="夜无疆"/><meta property="og:novel:author" content="辰东"/><meta property="og:image" content="/cover.jpg"/>',
  );
  expect(await xs23Source.parseBookInfo(`${root}100.html`)).toMatchObject({
    title: '夜无疆',
    author: '辰东',
    cover: 'https://www.23xs.la/cover.jpg',
    catalogUrl: root,
  });
});
it('合并所有目录分页，忽略最新章区域、异书、子页和重复链接', async () => {
  fetchMock.mockImplementation(async url =>
    url === root
      ? chapter(999, '最新章') +
        '<h2>全部章节目录</h2>' +
        chapter(100, '第1章') +
        '<option value="/book/35319/index_2.html">第二页</option><option value="/book/99/index_2.html">广告</option>'
      : chapter(100, '第1章') +
        chapter(200, '第2章') +
        '<a href="/book/99/300.html">异书</a><a href="/book/35319/100_1.html">子页</a>',
  );
  expect((await xs23Source.parseCatalog(info)).map(item => item.title)).toEqual(
    ['第1章', '第2章'],
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('目录任一页无有效章节重试后拒绝残目录', async () => {
  fetchMock.mockImplementation(async url =>
    url === root
      ? '<h2>全部章节目录</h2>' +
        chapter(100, '第1章') +
        '<option value="/book/35319/index_2.html">第二页</option>'
      : '<h1>广告页</h1>',
  );
  await expect(xs23Source.parseCatalog(info)).rejects.toThrow(
    '目录第 2 页解析失败',
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('分页选择器丢失或跳页时拒绝残目录，兼容原生 URL 实现', async () => {
  const originalURL = globalThis.URL;
  // 真机故障来自 RN URL 的隐式补斜杠；解析不应依赖浏览器版 URL 行为。
  globalThis.URL = class {
    constructor() {
      throw new Error('不应调用原生 URL');
    }
  } as unknown as typeof URL;
  try {
    fetchMock.mockResolvedValue(
      '<h2>全部章节目录</h2>' +
        chapter(100, '第1章') +
        '<a href="index_2.html">下一页</a>',
    );
    await expect(xs23Source.parseCatalog(info)).rejects.toThrow('目录分页列表');
    fetchMock.mockResolvedValue(
      '<h2>全部章节目录</h2>' +
        chapter(100, '第1章') +
        '<option value="index_3.html">第三页</option>',
    );
    await expect(xs23Source.parseCatalog(info)).rejects.toThrow(
      '目录分页不连续',
    );
    fetchMock.mockImplementation(async url =>
      url.endsWith('100.html')
        ? body('正常正文。'.repeat(80), './100_1.html')
        : body('末句。', './200.html'),
    );
    await expect(
      xs23Source.parseChapterContent(`${root}100.html`),
    ).resolves.toMatchObject({
      complete: true,
      loadedPageUrls: [`${root}100_1.html`],
    });
  } finally {
    globalThis.URL = originalURL;
  }
});
it('解析公开编码段落并合并同章尾页，不把标为下一页的下一章合并', async () => {
  const firstText = '正常章节正文，保留生僻字𠮷与表情😀。'.repeat(30);
  fetchMock.mockImplementation(async url =>
    url.endsWith('100.html')
      ? body(firstText, '/book/35319/100_1.html')
      : body('本章最后一句。', '/book/35319/200.html'),
  );
  expect(await xs23Source.parseChapterContent(`${root}100.html`)).toMatchObject(
    {
      content: `${firstText}\n本章最后一句。`,
      title: '第1章 永夜',
      complete: true,
      loadedPageUrls: [`${root}100_1.html`],
    },
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('子页失败保留首屏和续载入口，拒绝伪造跨书下一页', async () => {
  const text = '正常正文。'.repeat(80);
  fetchMock.mockImplementation(async url => {
    if (url.endsWith('100_1.html')) throw new Error('offline');
    return body(text, '/book/35319/100_1.html');
  });
  expect(await xs23Source.parseChapterContent(`${root}100.html`)).toMatchObject(
    { content: text, complete: false, nextPageUrl: `${root}100_1.html` },
  );
  fetchMock.mockResolvedValue(body(text, '/book/99/100_1.html'));
  expect(await xs23Source.parseChapterContent(`${root}100.html`)).toMatchObject(
    { complete: true },
  );
});
