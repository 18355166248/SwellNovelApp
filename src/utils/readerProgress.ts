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
  if (safeContentLength <= 0) return 0;
  // 正文已经全部落在可视区时虽没有滚动距离，但整章实际已完整可见。
  // 高度尚未测量完成（0）时仍留在开头，避免首帧误记为完成。
  if (
    contentHeight > 0 &&
    viewportHeight > 0 &&
    contentHeight <= viewportHeight
  ) {
    return safeContentLength;
  }
  if (maxScroll <= 0) return 0;

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
