import type { MeasureChar } from './paginate';

/** 首帧和相邻章预排版尚未拿到原生测量时，按标题字宽估算首页标题区高度。 */
export function estimateReaderHeadingHeight({
  title,
  maxWidth,
  measure,
  lineHeight,
  metaHeight = 15,
}: {
  title: string;
  maxWidth: number;
  measure: MeasureChar;
  lineHeight: number;
  metaHeight?: number;
}): number {
  let lines = 1;
  let width = 0;
  const available = Math.max(1, maxWidth);
  for (const char of title.replace(/\r\n?/g, '\n')) {
    if (char === '\n') {
      lines += 1;
      width = 0;
      continue;
    }
    const charWidth = measure(char);
    if (width > 0 && width + charWidth > available) {
      lines += 1;
      width = 0;
    }
    width += charWidth;
  }
  return Math.ceil(lines * lineHeight + 8 + metaHeight + 24);
}
