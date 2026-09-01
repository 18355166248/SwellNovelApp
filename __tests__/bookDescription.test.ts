import { sanitizeBookDescription } from '../src/utils/bookDescription';

describe('sanitizeBookDescription', () => {
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
