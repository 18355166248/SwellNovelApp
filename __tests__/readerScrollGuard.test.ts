import {
  getChapterLanding,
  getBoundaryTurn,
  isStaleScrollSync,
} from '../src/utils/readerScrollGuard';

describe('readerScrollGuard', () => {
  it('allows one next-chapter boundary turn at the last page', () => {
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 41,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
      }),
    ).toBe('next');
  });

  it('ignores repeated boundary turns while locked', () => {
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 80,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: true,
      }),
    ).toBeNull();
  });

  it('allows one previous-chapter boundary turn at the first page', () => {
    expect(
      getBoundaryTurn({
        offsetX: -41,
        pageIndex: 0,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
      }),
    ).toBe('prev');
  });

  it('does not turn chapters from the middle of a chapter', () => {
    expect(
      getBoundaryTurn({
        offsetX: 320 + 100,
        pageIndex: 1,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
      }),
    ).toBeNull();
  });

  it('treats old web scroll sync epochs as stale', () => {
    expect(isStaleScrollSync(3, 4)).toBe(true);
    expect(isStaleScrollSync(4, 4)).toBe(false);
  });

  it('lands on the previous chapter last page only for backward boundary navigation', () => {
    expect(getChapterLanding('prev')).toBe('last');
    expect(getChapterLanding('next')).toBe('first');
    expect(getChapterLanding('direct')).toBe('first');
  });
});
