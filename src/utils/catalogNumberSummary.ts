/** 目录项不等于原文章数：上下篇是多项，合章覆盖多个章号，公告没有章号。只统计，不改阅读顺序。 */
const DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
function numberOf(value: string): number | null {
  const text = value.replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10));
  if (/^\d+$/.test(text)) return Number(text);
  if (!/[十百千万萬]/.test(text)) {
    const digits = [...text].map(c => DIGITS[c]);
    return digits.every(n => n !== undefined) ? Number(digits.join('')) : null;
  }
  let total = 0,
    section = 0,
    digit = 0;
  for (const c of text) {
    if (DIGITS[c] !== undefined) {
      digit = DIGITS[c];
      continue;
    }
    const unit = (
      { 十: 10, 百: 100, 千: 1000, 万: 10000, 萬: 10000 } as Record<
        string,
        number
      >
    )[c];
    if (!unit) return null;
    if (unit === 10000) {
      total += (section + digit || 1) * unit;
      section = 0;
    } else section += (digit || 1) * unit;
    digit = 0;
  }
  return total + section + digit;
}
export function catalogNumberSummary(chapters: { title: string }[]) {
  const covered = new Set<number>();
  let numberedEntries = 0,
    mergedExtraNumbers = 0,
    maxNumber = 0;
  // 繁体书源会使用「兩千」「萬」「節」；统计漏认会制造假缺章，但不能据此改动原目录。
  const pattern =
    /^第\s*([\d０-９零〇一二两兩三四五六七八九十百千万萬]+)(?:\s*[-~～—至]\s*([\d０-９零〇一二两兩三四五六七八九十百千万萬]+))?\s*[章节節回]/;
  for (const chapter of chapters) {
    // 部分目录把卷名并入章标题；只去掉开头明确的卷前缀，避免把章名中的数字计入。
    const title = chapter.title
      .trim()
      .replace(/^第[^\s]+卷\s+.*?\s+(?=第)/, '');
    const match = pattern.exec(title);
    if (!match) continue;
    const start = numberOf(match[1]),
      end = match[2] ? numberOf(match[2]) : start;
    // 异常巨大编号/范围不展开，避免坏站点触发长循环；它仍作为未识别目录项保留。
    if (!start || !end || end < start || end > 100000 || end - start > 100)
      continue;
    numberedEntries++;
    mergedExtraNumbers += end - start;
    maxNumber = Math.max(maxNumber, end);
    for (let n = start; n <= end; n++) covered.add(n);
  }
  const unmatchedNumbers: number[] = [];
  for (let n = 1; n <= maxNumber; n++)
    if (!covered.has(n)) unmatchedNumbers.push(n);
  return {
    entries: chapters.length,
    maxNumber,
    coveredNumbers: covered.size,
    numberedEntries,
    unnumberedEntries: chapters.length - numberedEntries,
    mergedExtraNumbers,
    repeatedNumberEntries: numberedEntries + mergedExtraNumbers - covered.size,
    unmatchedNumbers,
  };
}
