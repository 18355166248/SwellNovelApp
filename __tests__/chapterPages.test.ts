import {
  MAX_CHAPTER_PAGES,
  collectChapterPages,
  type ChapterPageResult,
} from '../src/services/source/chapterPages';

const base = 'http://wap.xuanhuange.info/read/170446/';

/** 用固定页表模拟站点分页，并记录实际请求顺序。 */
const sitePages = (pages: Record<string, ChapterPageResult>) => {
  const requested: string[] = [];
  const fetchPage = async (url: string) => {
    requested.push(url);
    const page = pages[url];
    if (!page) throw new Error(`404 ${url}`);
    return page;
  };
  return { fetchPage, requested };
};

const identity = (raw: string) => raw;

describe('collectChapterPages', () => {
  it('一次读完整章的所有子页，不留待续载的下一页', async () => {
    const { fetchPage, requested } = sitePages({
      [`${base}100_2.html`]: {
        content: '第二页正文',
        nextPageUrl: `${base}100_3.html`,
      },
      [`${base}100_3.html`]: { content: '第三页正文' },
    });

    const merged = await collectChapterPages({
      firstContent: '第一页正文',
      firstNextPageUrl: `${base}100_2.html`,
      fetchPage,
      cleanPage: identity,
    });

    expect(merged.content).toBe('第一页正文\n第二页正文\n第三页正文');
    expect(merged.nextPageUrl).toBeUndefined();
    expect(requested).toEqual([`${base}100_2.html`, `${base}100_3.html`]);
  });

  it('单页章节不额外发请求', async () => {
    const { fetchPage, requested } = sitePages({});
    const merged = await collectChapterPages({
      firstContent: '整章正文',
      firstNextPageUrl: undefined,
      fetchPage,
      cleanPage: identity,
    });
    expect(merged).toEqual({ content: '整章正文', nextPageUrl: undefined });
    expect(requested).toEqual([]);
  });

  it('尾页很短也照常并入，不按整章字数门槛丢弃', async () => {
    const { fetchPage } = sitePages({
      [`${base}100_2.html`]: { content: '完。' },
    });
    const merged = await collectChapterPages({
      firstContent: '有效正文。'.repeat(80),
      firstNextPageUrl: `${base}100_2.html`,
      fetchPage,
      cleanPage: identity,
    });
    expect(merged.content.endsWith('\n完。')).toBe(true);
    expect(merged.nextPageUrl).toBeUndefined();
  });

  it('子页失败时保留已读正文，并把失败页留给续载重试', async () => {
    const onError = jest.fn();
    const { fetchPage } = sitePages({
      [`${base}100_2.html`]: {
        content: '第二页正文',
        nextPageUrl: `${base}100_3.html`,
      },
    });

    const merged = await collectChapterPages({
      firstContent: '第一页正文',
      firstNextPageUrl: `${base}100_2.html`,
      fetchPage,
      cleanPage: identity,
      onError,
    });

    expect(merged.content).toBe('第一页正文\n第二页正文');
    expect(merged.nextPageUrl).toBe(`${base}100_3.html`);
    expect(onError).toHaveBeenCalledWith(
      `${base}100_3.html`,
      expect.any(Error),
    );
  });

  it('遇到广告拦截页立即停止合并，不把它写进正文', async () => {
    const { fetchPage } = sitePages({
      [`${base}100_2.html`]: {
        content: '请在浏览器中打开后继续阅读',
        nextPageUrl: `${base}100_3.html`,
      },
      [`${base}100_3.html`]: { content: '第三页正文' },
    });

    const merged = await collectChapterPages({
      firstContent: '第一页正文',
      firstNextPageUrl: `${base}100_2.html`,
      fetchPage,
      cleanPage: identity,
    });

    expect(merged.content).toBe('第一页正文');
    expect(merged.nextPageUrl).toBe(`${base}100_2.html`);
  });

  it('每个子页都按调用方规则清洗，剥掉重复的章节名', async () => {
    const { fetchPage } = sitePages({
      [`${base}100_2.html`]: { content: '第一章 标题\n第二页正文' },
    });
    const merged = await collectChapterPages({
      firstContent: '第一页正文',
      firstNextPageUrl: `${base}100_2.html`,
      fetchPage,
      cleanPage: raw => raw.replace(/^第一章 标题\n/, ''),
    });
    expect(merged.content).toBe('第一页正文\n第二页正文');
  });

  it('分页链接成环时按上限停下，不会无限抓取', async () => {
    const loop = `${base}100_2.html`;
    const { fetchPage, requested } = sitePages({
      [loop]: { content: '循环页正文', nextPageUrl: loop },
    });

    const merged = await collectChapterPages({
      firstContent: '第一页正文',
      firstNextPageUrl: loop,
      fetchPage,
      cleanPage: identity,
    });

    expect(requested).toHaveLength(MAX_CHAPTER_PAGES);
    expect(merged.nextPageUrl).toBe(loop);
  });
});
