import { bqqugeSource as source } from '../src/services/source/bqquge';
import { fetchHtml } from '../src/services/http/fetchHtml';
jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));
const fetchMock = fetchHtml as jest.MockedFunction<typeof fetchHtml>;
const root = 'https://www.bqquge.org/1';
const info = {
  sourceBookId: '1',
  title: '测试书',
  author: '作者',
  catalogUrl: root,
};
const text = '真实正文。'.repeat(80);
const page = (body: string, next: string) =>
  `<div class="con"><h1>第1章</h1><p>${body}</p><script>广告脚本()</script></div><div class="prenext">${next}</div><div>猜你喜欢：广告</div>`;
beforeEach(() => fetchMock.mockReset());
it('网站最新章未在全文目录中出现时拒绝截短目录', async () => {
  fetchMock.mockResolvedValue(
    '<div class="newest"><h3><a href="/1/99">第99章</a></h3></div><div id="list"><a href="/1/10">第1章</a></div>',
  );
  await expect(source.parseCatalog(info)).rejects.toThrow('缺少网站最新章');
});
it('即使包含最新章，只剩高编号尾段也不能冒充全目录', async () => {
  fetchMock.mockResolvedValue(
    '<div class="newest"><a href="/1/99">第99章</a></div><div id="list"><a href="/1/98">第98章</a><a href="/1/99">第99章</a></div>',
  );
  await expect(source.parseCatalog(info)).rejects.toThrow('章号覆盖不足');
});
it('固定域名和书号识别，子页不改变书籍身份', () => {
  expect(source.extractId(`${root}/10-2`)).toBe('1');
  expect(source.matchUrl('https://www.bqquge.org.fake.test/1')).toBe(false);
  expect(source.matchUrl('https://www.bqquge.org/zuozhe/1')).toBe(false);
});
it('详情保留标题作者封面简介', async () => {
  fetchMock.mockResolvedValue(
    '<div class="bookdetail"><img src="/cover.jpg"><h1>测试书</h1><p>作者：作者</p></div><div class="des"><p>简介</p></div>',
  );
  await expect(source.parseBookInfo(`${root}/10-2`)).resolves.toMatchObject({
    title: '测试书',
    author: '作者',
    cover: 'https://www.bqquge.org/cover.jpg',
    description: '简介',
    catalogUrl: root,
  });
});
it('只取全文目录，保留同名不同地址和上下篇，过滤子页异书与重复链接', async () => {
  fetchMock.mockResolvedValue(
    '<a href="/1/99">最新章</a><div id="list"><a href="/1/10">第1章</a><a href="/1/10">第1章</a><a href="/1/11">第1章</a><a href="/1/12">第2章【下】</a><a href="/1/12-2">子页</a><a href="/2/12">异书</a></div>',
  );
  expect((await source.parseCatalog(info)).map(item => item.url)).toEqual([
    `${root}/10`,
    `${root}/11`,
    `${root}/12`,
  ]);
  fetchMock.mockResolvedValue('<a href="/1/99">只有最新章</a>');
  await expect(source.parseCatalog(info)).rejects.toThrow('全文目录缺失');
});
it('合并三页及短尾页，下一章不并入且不混入推荐广告', async () => {
  fetchMock.mockImplementation(async url =>
    url.endsWith('/10')
      ? page(text, '<a href="/1/10-2">下一页</a>')
      : url.endsWith('-2')
      ? page('中间段。', '<a href="/1/10-3">下一页</a>')
      : page('结束。', '<a href="/1/11">下一章</a>'),
  );
  await expect(source.parseChapterContent(`${root}/10`)).resolves.toMatchObject(
    {
      content: `${text}\n中间段。\n结束。`,
      complete: true,
      loadedPageUrls: [`${root}/10-2`, `${root}/10-3`],
    },
  );
});
it('子页断网保留重试入口，非法归属、倒退页不能作为完整正文', async () => {
  fetchMock.mockImplementation(async url => {
    if (url.endsWith('-2')) throw new Error('offline');
    return page(text, '<a href="/1/10-2">下一页</a>');
  });
  await expect(source.parseChapterContent(`${root}/10`)).resolves.toMatchObject(
    { complete: false, nextPageUrl: `${root}/10-2` },
  );
  for (const href of ['/2/10-2', '/1/11-2', '/1/10-3', '/1/10']) {
    fetchMock.mockResolvedValue(page(text, `<a href="${href}">下一页</a>`));
    await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
      '归属或页序异常',
    );
  }
});
it('正文导航缺失和验证码广告页不能入库', async () => {
  fetchMock.mockResolvedValue(
    '<div class="con"><h1>第1章</h1><p>广告</p></div>',
  );
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '导航缺失',
  );
  fetchMock.mockResolvedValue(
    page(
      'Just a moment Enable JavaScript and cookies to continue'.repeat(20),
      '<a href="/1">目录</a>',
    ),
  );
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '正文无效',
  );
});
