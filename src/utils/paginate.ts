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

/**
 * 后台预断行的协作式版本。按段落小批次执行并主动让出事件循环，使阅读手势能
 * 及时推进取消标记；结果与一次性 breakLines 保持完全相同的逻辑偏移。
 */
export async function breakLinesCooperatively({
  paragraphs,
  maxWidth,
  measure,
  shouldCancel,
  chunkSize = 12,
  yieldControl = () => new Promise<void>(resolve => setTimeout(resolve, 0)),
}: {
  paragraphs: string[];
  maxWidth: number;
  measure: MeasureChar;
  shouldCancel: () => boolean;
  chunkSize?: number;
  yieldControl?: () => Promise<void>;
}): Promise<ReaderLine[] | null> {
  const lines: ReaderLine[] = [];
  let logicalOffset = 0;
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));

  for (let start = 0; start < paragraphs.length; start += safeChunkSize) {
    if (shouldCancel()) return null;
    const chunk = paragraphs.slice(start, start + safeChunkSize);
    const chunkLines = breakLines(chunk, maxWidth, measure);
    chunkLines.forEach(line =>
      lines.push({ ...line, charOffset: line.charOffset + logicalOffset }),
    );
    logicalOffset += chunk.reduce(
      (sum, paragraph) => sum + Array.from(paragraph).length,
      0,
    );
    await yieldControl();
  }

  return shouldCancel() ? null : lines;
}

/** 页内的一个段落块（同段的连续行），块之间渲染时插入段间距。 */
export interface ReaderPageBlock {
  /** 段落在本页的文本，行以 \n 连接 */
  text: string;
  /** 该块首行的逻辑偏移量 */
  startOffset: number;
}

export interface ReaderPageData {
  key: string;
  /** 本页的段落块；相邻块之间按段间距留白，段落仅靠首行缩进区分 */
  blocks: ReaderPageBlock[];
  /** 本页首行的逻辑偏移量 */
  startOffset: number;
  /** 仅章节首页展示标题区 */
  showHeader: boolean;
}

/**
 * 按像素高度组页：每行占 lineHeight，相邻段落之间额外占 paraGap，
 * 这样段间距（marginTop）能被准确计入分页，避免最后一行溢出页面。
 */
export function buildPages({
  chapterId,
  lines,
  lineHeight,
  paraGap,
  bodyHeight,
  firstBodyHeight,
}: {
  chapterId: string;
  lines: ReaderLine[];
  /** 单行像素高（fontSize × 行高倍率） */
  lineHeight: number;
  /** 段落之间的像素间距 */
  paraGap: number;
  /** 普通页可用像素高 */
  bodyHeight: number;
  /** 首页可用像素高（已扣除标题区） */
  firstBodyHeight: number;
}): ReaderPageData[] {
  const pages: ReaderPageData[] = [];
  const safeLineHeight = Math.max(1, lineHeight);
  const safeGap = Math.max(0, paraGap);
  const budgetFor = (pageNo: number) =>
    Math.max(safeLineHeight, pageNo === 0 ? firstBodyHeight : bodyHeight);

  let blocks: ReaderPageBlock[] = [];
  let blockLines: string[] = [];
  let blockStart = 0;
  let pageStart = 0;
  let pageHeight = 0;
  let pageHasContent = false;

  const flushBlock = () => {
    if (blockLines.length > 0) {
      blocks.push({ text: blockLines.join('\n'), startOffset: blockStart });
      blockLines = [];
    }
  };

  const pushPage = () => {
    flushBlock();
    pages.push({
      key: `${chapterId}-${pages.length}`,
      blocks,
      startOffset: pageStart,
      showHeader: pages.length === 0,
    });
    blocks = [];
    pageHeight = 0;
    pageHasContent = false;
  };

  lines.forEach(line => {
    const startsParagraph = line.isParagraphStart;
    // 新段落且本页已有内容时，段落前要占用一段段间距。
    const gap = startsParagraph && pageHasContent ? safeGap : 0;

    if (
      pageHasContent &&
      pageHeight + gap + safeLineHeight > budgetFor(pages.length)
    ) {
      pushPage();
    }

    // 段落边界：结束上一块，另起一块（页首的续段块 blockLines 为空，同样在此起块）。
    if (startsParagraph || blockLines.length === 0) {
      flushBlock();
      blockStart = line.charOffset;
    }

    if (!pageHasContent) {
      pageStart = line.charOffset;
      pageHasContent = true;
      pageHeight += safeLineHeight;
    } else {
      pageHeight += (startsParagraph ? safeGap : 0) + safeLineHeight;
    }

    blockLines.push(line.text);
  });

  flushBlock();
  if (blocks.length > 0 || pages.length === 0) {
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
