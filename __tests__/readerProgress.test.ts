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

  it('marks a non-empty short chapter as fully visible', () => {
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 100,
        contentHeight: 400,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(1000);
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 0,
        contentHeight: 300,
        viewportHeight: 400,
        contentLength: 600,
      }),
    ).toBe(600);
    expect(
      readingPositionToScrollOffset({
        position: 800,
        contentHeight: 400,
        viewportHeight: 400,
        contentLength: 1000,
      }),
    ).toBe(0);
  });

  it('keeps empty or not-yet-measured content at the start', () => {
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 0,
        contentHeight: 300,
        viewportHeight: 400,
        contentLength: 0,
      }),
    ).toBe(0);
    expect(
      scrollOffsetToReadingPosition({
        scrollY: 0,
        contentHeight: 0,
        viewportHeight: 400,
        contentLength: 600,
      }),
    ).toBe(0);
  });
});
