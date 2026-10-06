import { bqqugeSource as source } from '../src/services/source/bqquge';
import { fetchHtml } from '../src/services/http/fetchHtml';
import { isInvalidOnlineChapterContent } from '../src/services/source/contentQuality';
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
it('合法短公告带同书目录及章节导航时可读，广告和普通残章仍拒绝', async () => {
  const announcement = page(
    '今天休息一天，明天恢复更新。',
    '<a href="/1">目录</a><a href="/1/11">下一章</a>',
  ).replace('<h1>第1章</h1>', '<h1>休整一天</h1>');
  fetchMock.mockResolvedValue(announcement);
  const parsed = await source.parseChapterContent(`${root}/10`);
  expect(parsed).toMatchObject({
    content: '今天休息一天，明天恢复更新。',
    complete: true,
    trustedShort: true,
  });
  if (typeof parsed !== 'string')
    expect(
      isInvalidOnlineChapterContent(parsed.content, {
        trustedShort: parsed.trustedShort,
      }),
    ).toBe(false);
  fetchMock.mockResolvedValue(
    announcement.replace('今天休息一天，明天恢复更新。', '立即下载领取福利'),
  );
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '正文无效',
  );
  fetchMock.mockResolvedValue(
    announcement.replace('<a href="/1">目录</a>', ''),
  );
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '正文无效',
  );
  fetchMock.mockResolvedValue(page('正文过短。', '<a href="/1/11">下一章</a>'));
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '正文无效',
  );
});
it('先合并短首屏再检查整章字数，不把正常分页正文误判为空', async () => {
  fetchMock.mockImplementation(async url =>
    url.endsWith('/10')
      ? page('首屏只有一句。', '<a href="/1/10-2">下一页</a>')
      : page(text, '<a href="/1/11">下一章</a>'),
  );
  await expect(source.parseChapterContent(`${root}/10`)).resolves.toMatchObject(
    { content: `首屏只有一句。\n${text}`, complete: true, trustedShort: false },
  );
});
it('嵌套广告、脚本伪标签不截断正文，也不把广告标题和同书广告链接混入目录', async () => {
  fetchMock.mockResolvedValue(
    `<div class="con reader"><div class="ad"><h1>广告标题</h1><div>立即下载</div></div><h1>第1章</h1><p>${text}</p><script>var bait='<div>伪标签';</script><div><p>正文后半段。</p></div></div><div class="prenext"><a href="/1/11">下一章</a></div>`,
  );
  await expect(source.parseChapterContent(`${root}/10`)).resolves.toMatchObject(
    { title: '第1章', content: `${text}\n正文后半段。`, complete: true },
  );
  fetchMock.mockResolvedValue(
    '<div id="list"><div class="ad"><a href="/1/99">推广</a></div><div><a href="/1/10">第1章</a></div><a href="/1/11">第2章</a></div>',
  );
  expect(
    (await source.parseCatalog(info)).map(chapter => chapter.title),
  ).toEqual(['第1章', '第2章']);
  fetchMock.mockResolvedValue(
    `<div class="con"><h1>第1章</h1><p>${text}</p><div class="prenext"><a href="/1/11">下一章</a></div>`,
  );
  await expect(source.parseChapterContent(`${root}/10`)).rejects.toThrow(
    '正文和章节标题',
  );
});
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
