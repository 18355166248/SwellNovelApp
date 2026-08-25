import {
  chapterPageExtractorJs,
  parseRenderedChapterPagePayload,
} from '../src/services/browserFetch/bridge';

describe('browser chapter page extraction', () => {
  const current = 'http://wap.xuanhuange.info/read/170446/100.html';

  it('保留同站点的明确下一页链接', () => {
    expect(
      parseRenderedChapterPagePayload(
        JSON.stringify({
          content: '正文内容',
          nextPageUrl: '/read/170446/100_2.html',
          nextPageLabel: '下一页 >',
        }),
        current,
      ),
    ).toEqual({
      content: '正文内容',
      nextPageUrl:
        'http://wap.xuanhuange.info/read/170446/100_2.html',
    });
  });

  it('拒绝下一章、跨站链接和当前页循环', () => {
    const cases = [
      { nextPageUrl: '/read/170446/101.html', nextPageLabel: '下一章' },
      { nextPageUrl: 'https://example.com/100_2.html', nextPageLabel: '下一页' },
      { nextPageUrl: current, nextPageLabel: '下一页' },
    ];
    for (const value of cases) {
      expect(
        parseRenderedChapterPagePayload(
          JSON.stringify({ content: '正文内容', ...value }),
          current,
        ),
      ).toEqual({ content: '正文内容', nextPageUrl: undefined });
    }
  });

  it('注入脚本只识别章节内下一页，不匹配下一章', () => {
    const script = chapterPageExtractorJs('job-1');
    expect(script).toContain('下一页');
    expect(script).not.toContain('下一章|');
    expect(script).toContain("id:'job-1'");
  });
});
