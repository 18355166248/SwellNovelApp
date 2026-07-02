/**
 * 无法真实测量时的字符宽度近似表（单位 em）。
 * 中文小说场景：CJK 与全角标点为主，通用标点区（“”—…）在中文衬线字体里
 * 也按全宽渲染，因此 0x2000 以上统一按 1em 处理；半角假名等罕见字符可接受误差。
 */
export function charWidthEm(char: string): number {
  const code = char.codePointAt(0) ?? 0x4e00;
  if (code === 0x20) return 0.3;
  if (code < 0x7f) return 0.54;
  if (code >= 0x2000) return 1;
  return 0.6;
}
