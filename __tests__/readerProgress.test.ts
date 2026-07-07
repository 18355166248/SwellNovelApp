import {
  readingPositionToScrollOffset,
  scrollOffsetToReadingPosition,
} from '../src/utils/readerProgress';

describe('readerProgress', () => {
  it('maps vertical scroll offset to chapter reading position', () => {
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 400,
        contentHeight: 1200,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(500);
  });

  it('maps reading position back to vertical scroll offset', () => {
    expect(
      readingPositionToScrollOffset({
        position: 500,
        contentHeight: 1200,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(400);
  });

  it('clamps scroll and reading positions to safe bounds', () => {
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 2000,
        contentHeight: 1200,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(1000);

    expect(
      readingPositionToScrollOffset({
        position: -50,
        contentHeight: 1200,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(0);
  });

  it('falls back to the start when content is not scrollable', () => {
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 100,
        contentHeight: 400,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(0);
    expect(
      readingPositionToScrollOffset({
        position: 800,
        contentHeight: 400,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(0);
  });
});
