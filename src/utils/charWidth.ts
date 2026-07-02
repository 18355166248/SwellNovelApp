import { charWidthEm } from './charWidthTable';
import type { MeasureChar } from './paginate';

/**
 * iOS/Android：宽度表估算，仅作为 onTextLayout 真实测量完成前的过渡。
 */
export function getCharWidthMeasurer(
  _fontFamily: string | undefined,
  fontSize: number,
): MeasureChar {
  return char => charWidthEm(char) * fontSize;
}
