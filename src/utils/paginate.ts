/**
 * 左右翻页分页器（纯函数，iOS / Web 共享）。
 * 「逻辑偏移量」指章节 paragraphs.join('') 中的字符下标（不含缩进与换行），
 * 字号/行距/视口变化重新分页后，用它恢复阅读位置。
 */

export type MeasureChar = (char: string) => number;

export interface ReaderLine {
  /** 展示文本（段首行含全角缩进） */
  text: string;
  /** 行首字符的逻辑偏移量 */
  charOffset: number;
  /** 是否段落首行（段首带全角缩进，用于区分段落与恢复阅读位置） */
  isParagraphStart: boolean;
}

export const INDENT = '　　';

export function breakLines(
  paragraphs: string[],
  maxWidth: number,
  measure: MeasureChar,
): ReaderLine[] {
  const lines: ReaderLine[] = [];
  const safeMax = Math.max(1, maxWidth);
  let offset = 0;

  paragraphs.forEach(paragraph => {
    let isFirst = true;
    let lineText = INDENT;
    let lineWidth = measure('　') * 2;
    let lineStart = offset;

    const pushLine = () => {
      lines.push({
        text: lineText,
        charOffset: lineStart,
        isParagraphStart: isFirst,
      });
      isFirst = false;
      lineText = '';
      lineWidth = 0;
      lineStart = offset;
    };

    for (const char of Array.from(paragraph)) {
      const charWidth = measure(char);
      const hasContent = isFirst
        ? lineText.length > INDENT.length
        : lineText.length > 0;
      if (hasContent && lineWidth + charWidth > safeMax) {
        pushLine();
      }
      lineText += char;
      lineWidth += charWidth;
      offset += 1;
    }
    if (lineText.length > 0) {
      pushLine();
    }
  });

  return lines;
}

export interface ReaderPageData {
  key: string;
  /** 页内文本，行以 \n 连接（段落仅靠首行缩进区分，不插空行） */
  text: string;
  /** 本页首行的逻辑偏移量 */
  startOffset: number;
  /** 仅章节首页展示标题区 */
  showHeader: boolean;
}

export function buildPages({
  chapterId,
  lines,
  linesPerPage,
  firstPageLines,
}: {
  chapterId: string;
  lines: ReaderLine[];
  linesPerPage: number;
  firstPageLines: number;
}): ReaderPageData[] {
  const pages: ReaderPageData[] = [];
  const limitFor = (pageNo: number) =>
    Math.max(1, pageNo === 0 ? firstPageLines : linesPerPage);

  let current: string[] = [];
  let currentStart = 0;

  const pushPage = () => {
    pages.push({
      key: `${chapterId}-${pages.length}`,
      text: current.join('\n'),
      startOffset: currentStart,
      showHeader: pages.length === 0,
    });
    current = [];
  };

  lines.forEach(line => {
    // 段落之间不再插入空行，仅靠段首行的全角缩进区分，避免左右翻页段间距过大。
    if (current.length > 0 && current.length + 1 > limitFor(pages.length)) {
      pushPage();
    }
    if (current.length === 0) {
      currentStart = line.charOffset;
    }
    current.push(line.text);
  });

  if (current.length > 0 || pages.length === 0) {
    pushPage();
  }

  return pages;
}

/** 逻辑偏移量 → 页码（返回 startOffset <= offset 的最后一页） */
export function findPageByOffset(
  pages: ReaderPageData[],
  offset: number,
): number {
  let idx = 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].startOffset <= offset) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * 把 onTextLayout 返回的真实排版行文本，对齐到展示文本
 * （paragraphs.map(p => INDENT + p).join('\n')），换算出逻辑偏移量与段首标记。
 * 行文本与展示文本不完全一致时按顺序尽力对齐，偏差只影响恢复位置的精度。
 */
export function linesFromTextLayout(
  paragraphs: string[],
  layoutLineTexts: string[],
): ReaderLine[] {
  const displayChars: string[] = [];
  const logicalOffsets: number[] = [];
  const paragraphStarts = new Set<number>();
  let logical = 0;

  paragraphs.forEach((paragraph, pi) => {
    if (pi > 0) {
      displayChars.push('\n');
      logicalOffsets.push(logical);
    }
    paragraphStarts.add(displayChars.length);
    for (const ch of INDENT) {
      displayChars.push(ch);
      logicalOffsets.push(logical);
    }
    for (const ch of Array.from(paragraph)) {
      displayChars.push(ch);
      logicalOffsets.push(logical);
      logical += 1;
    }
  });

  const lines: ReaderLine[] = [];
  let pos = 0;
  layoutLineTexts.forEach(raw => {
    const text = raw.replace(/\n+$/g, '');
    while (pos < displayChars.length && displayChars[pos] === '\n') {
      pos += 1;
    }
    const start = pos;
    lines.push({
      text,
      charOffset:
        logicalOffsets[
          Math.min(start, Math.max(0, logicalOffsets.length - 1))
        ] ?? 0,
      isParagraphStart: paragraphStarts.has(start),
    });
    pos += Array.from(text).length;
  });

  return lines;
}
