import { sanitizeBookDescription } from '../src/utils/bookDescription';

describe('sanitizeBookDescription', () => {
  it('renders HTML breaks as line breaks and preserves blank paragraphs', () => {
    expect(
      sanitizeBookDescription(
        '简介：第一段故事。 <br/><br/> 第二段故事。<BR>第三段故事。',
      ),
    ).toBe('第一段故事。\n\n第二段故事。\n第三段故事。');
  });

  it('decodes escaped markup and removes inline tags without losing paragraphs', () => {
    expect(
      sanitizeBookDescription(
        '&lt;p&gt;第一段&lt;b&gt;故事&lt;/b&gt;。&lt;/p&gt;&lt;p&gt;第二段&amp;故事。&lt;/p&gt;',
      ),
    ).toBe('第一段故事。\n\n第二段&故事。');
  });

  it('keeps existing newlines and limits excess blank lines', () => {
    expect(
      sanitizeBookDescription('第一段故事。\r\n\r\n\r\n  第二段  故事。'),
    ).toBe('第一段故事。\n\n第二段 故事。');
  });

  it('removes the label and trailing source promotion', () => {
    expect(
      sanitizeBookDescription(
        '简介：讲述一个普通少年踏上修仙之路的故事。 bookdown 小说下载网——是目前最新最全的小说网站，免费提供txt电子书。',
      ),
    ).toBe('讲述一个普通少年踏上修仙之路的故事。');
  });

  it('keeps ordinary story copy that mentions a download website', () => {
    expect(
      sanitizeBookDescription('他经营一家小说下载网，并因此卷入离奇案件。'),
    ).toBe('他经营一家小说下载网，并因此卷入离奇案件。');
  });

  it('returns undefined for empty or promotion-only copy', () => {
    expect(sanitizeBookDescription('简介：')).toBeUndefined();
    expect(
      sanitizeBookDescription('bookdown 小说下载网——是目前最新最全的网站'),
    ).toBeUndefined();
  });
});
