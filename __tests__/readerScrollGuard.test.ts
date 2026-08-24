import {
  canHandleBoundaryTurnGesture,
  getChapterLanding,
  getChapterLandingPage,
  getBoundaryTurn,
  isChapterSwitchInFlight,
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

  it('treats an extreme overscroll as only one boundary direction', () => {
    expect(
      getBoundaryTurn({
        offsetX: 20 * 320,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
        threshold: 18,
      }),
    ).toBe('next');
  });

  it('requires the threshold to be exceeded rather than merely reached', () => {
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 18,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
        threshold: 18,
      }),
    ).toBeNull();
  });

  it('turns immediately on release when a fast flick has little overscroll', () => {
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 4,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
        threshold: 18,
        releaseVelocityX: 0.4,
        velocityThreshold: 0.18,
      }),
    ).toBe('next');
    expect(
      getBoundaryTurn({
        offsetX: -4,
        pageIndex: 0,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
        threshold: 18,
        releaseVelocityX: -0.4,
        velocityThreshold: 0.18,
      }),
    ).toBe('prev');
  });

  it('does not treat a slow release below both thresholds as a chapter turn', () => {
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 4,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 4,
        totalChapters: 10,
        locked: false,
        threshold: 18,
        releaseVelocityX: 0.1,
        velocityThreshold: 0.18,
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

  it('does not turn beyond the first or last chapter', () => {
    expect(
      getBoundaryTurn({
        offsetX: -100,
        pageIndex: 0,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 0,
        totalChapters: 10,
        locked: false,
      }),
    ).toBeNull();
    expect(
      getBoundaryTurn({
        offsetX: 2 * 320 + 100,
        pageIndex: 2,
        pagesLength: 3,
        viewportWidth: 320,
        chapterIndex: 9,
        totalChapters: 10,
        locked: false,
      }),
    ).toBeNull();
  });

  it('only accepts one active drag from the currently mounted chapter', () => {
    expect(
      canHandleBoundaryTurnGesture(
        { chapterId: 'chapter-2', dragging: true, consumed: false },
        'chapter-2',
      ),
    ).toBe(true);
    expect(
      canHandleBoundaryTurnGesture(
        { chapterId: 'chapter-2', dragging: true, consumed: true },
        'chapter-2',
      ),
    ).toBe(false);
    expect(
      canHandleBoundaryTurnGesture(
        { chapterId: 'chapter-2', dragging: false, consumed: false },
        'chapter-2',
      ),
    ).toBe(false);
    expect(
      canHandleBoundaryTurnGesture(
        { chapterId: 'chapter-1', dragging: true, consumed: false },
        'chapter-2',
      ),
    ).toBe(false);
  });

  it('releases the switch gate as soon as the target chapter is interactive', () => {
    expect(isChapterSwitchInFlight(5, 4, 'loading')).toBe(true);
    expect(isChapterSwitchInFlight(5, 5, 'loading')).toBe(true);
    expect(isChapterSwitchInFlight(5, 5, 'ready')).toBe(false);
    expect(isChapterSwitchInFlight(5, 5, 'error')).toBe(false);
    expect(isChapterSwitchInFlight(null, 5, 'ready')).toBe(false);
  });

  it('treats old web scroll sync epochs as stale', () => {
    expect(isStaleScrollSync(3, 4)).toBe(true);
    expect(isStaleScrollSync(4, 4)).toBe(false);
  });

  it('lands on the previous chapter last page only for backward boundary navigation', () => {
    expect(getChapterLanding('prev')).toBe('last');
    expect(getChapterLanding('prev', true)).toBe('last');
    expect(getChapterLanding('prev', false)).toBe('first');
    expect(getChapterLanding('next')).toBe('first');
    expect(getChapterLanding('direct')).toBe('first');
  });

  it('calculates the target page before the new chapter list mounts', () => {
    expect(getChapterLandingPage('first', 55)).toBe(0);
    expect(getChapterLandingPage('last', 55)).toBe(54);
    expect(getChapterLandingPage('last', 0)).toBe(0);
  });
});
