import { charWidthEm } from './charWidthTable';
import type { MeasureChar } from './paginate';

type FontCacheEntry = {
  ctx: CanvasRenderingContext2D;
  widths: Map<string, number>;
};

// 按 font 字符串缓存 canvas context 与字符宽度；阅读器字号档位有限，不会膨胀。
const fontCache = new Map<string, FontCacheEntry>();

/**
 * Web：canvas measureText 精确测宽，结果按字符缓存；
 * canvas 不可用时回退宽度表。
 */
export function getCharWidthMeasurer(
  fontFamily: string | undefined,
  fontSize: number,
): MeasureChar {
  const font = `${fontSize}px ${fontFamily || 'serif'}`;
  let entry = fontCache.get(font);
  if (!entry) {
    const ctx =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null;
    if (ctx) {
      ctx.font = font;
      entry = { ctx, widths: new Map() };
      fontCache.set(font, entry);
    }
  }
  if (!entry) {
    return char => charWidthEm(char) * fontSize;
  }
  const { ctx, widths } = entry;
  return char => {
    let width = widths.get(char);
    if (width == null) {
      width = ctx.measureText(char).width;
      widths.set(char, width);
    }
    return width;
  };
}
