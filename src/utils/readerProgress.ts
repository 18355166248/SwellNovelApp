type ScrollPositionInput = {
  scrollY: number;
  contentHeight: number;
  viewportHeight: number;
  contentLength: number;
};

type ReadingPositionInput = {
  position: number;
  contentHeight: number;
  viewportHeight: number;
  contentLength: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function scrollOffsetToReadingPosition({
  scrollY,
  contentHeight,
  viewportHeight,
  contentLength,
}: ScrollPositionInput): number {
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const safeContentLength = Math.max(0, contentLength);
  if (maxScroll <= 0 || safeContentLength <= 0) return 0;

  const ratio = clamp(scrollY, 0, maxScroll) / maxScroll;
  return Math.round(ratio * safeContentLength);
}

export function readingPositionToScrollOffset({
  position,
  contentHeight,
  viewportHeight,
  contentLength,
}: ReadingPositionInput): number {
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const safeContentLength = Math.max(0, contentLength);
  if (maxScroll <= 0 || safeContentLength <= 0) return 0;

  const ratio = clamp(position, 0, safeContentLength) / safeContentLength;
  return Math.round(ratio * maxScroll);
}
