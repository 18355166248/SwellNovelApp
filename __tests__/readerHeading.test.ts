import { estimateReaderHeadingHeight } from '../src/utils/readerHeading';

describe('reader heading height before native layout', () => {
  const estimate = (title: string, maxWidth = 100) =>
    estimateReaderHeadingHeight({
      title,
      maxWidth,
      measure: char => (/^[A-Za-z0-9]$/.test(char) ? 5 : 10),
      lineHeight: 20,
    });

  it('reserves more first-page space when a title wraps, without body indentation', () => {
    expect(estimate('一'.repeat(10))).toBe(67);
    expect(estimate('一'.repeat(11))).toBe(87);
    expect(estimate('第30章：只有一个人的榜单')).toBe(87);
  });

  it('includes explicit title line breaks and responds to narrower columns', () => {
    expect(estimate('第一章\r\n第二章')).toBe(87);
    expect(estimate('一'.repeat(10), 50)).toBe(87);
  });
});
