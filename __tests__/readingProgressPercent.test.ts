import { calculateReadingProgress } from '../src/utils/readingProgressPercent';

describe('calculateReadingProgress', () => {
  it('does not mark a book complete merely by opening the last chapter', () => {
    expect(
      calculateReadingProgress({
        chapterIndex: 9,
        totalChapters: 10,
        chapterFraction: 0,
      }),
    ).toBe(90);
  });

  it('returns 100 only at the end of the final chapter', () => {
    expect(
      calculateReadingProgress({
        chapterIndex: 9,
        totalChapters: 10,
        chapterFraction: 0.99,
      }),
    ).toBe(99);
    expect(
      calculateReadingProgress({
        chapterIndex: 9,
        totalChapters: 10,
        chapterFraction: 1,
      }),
    ).toBe(100);
  });

  it('clamps invalid indices and fractions', () => {
    expect(
      calculateReadingProgress({
        chapterIndex: -2,
        totalChapters: 4,
        chapterFraction: -1,
      }),
    ).toBe(0);
    expect(
      calculateReadingProgress({
        chapterIndex: 99,
        totalChapters: 4,
        chapterFraction: 2,
      }),
    ).toBe(100);
  });
});
