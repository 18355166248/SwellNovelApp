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

function appendParagraphTail(lines: ReaderLine[], tail: ReaderLine) {
  // 中文段末句号/闭引号常被原生排版收在上一行。估算器若独占一行，多段累加会
  // 虚耗整行预算；这里只合并最多两个尾标点，字体确实放不下时由原生行尾测量校正。
  if (
    !tail.isParagraphStart &&
    /^[，。！？；：、’”）】》」』]{1,2}$/.test(tail.text)
  ) {
    lines[lines.length - 1].text += tail.text;
  } else {
    lines.push(tail);
  }
}

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

    for (const char of paragraph) {
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
      appendParagraphTail(lines, {
        text: lineText,
        charOffset: lineStart,
        isParagraphStart: isFirst,
      });
    }
  });

  return lines;
}

/**
 * 后台预断行按段落及字符数双重分片；整章只有一个长段落时也能及时响应手势取消。
 * 分片保留正在断行的上下文，不能给每个字符片段重新缩进或重算逻辑偏移。
 */
export async function breakLinesCooperatively({
  paragraphs,
  maxWidth,
  measure,
  shouldCancel,
  chunkSize = 12,
  characterChunkSize = 2048,
  yieldControl = () => new Promise<void>(resolve => setTimeout(resolve, 0)),
}: {
  paragraphs: string[];
  maxWidth: number;
  measure: MeasureChar;
  shouldCancel: () => boolean;
  chunkSize?: number;
  characterChunkSize?: number;
  yieldControl?: () => Promise<void>;
}): Promise<ReaderLine[] | null> {
  const lines: ReaderLine[] = [];
  let offset = 0;
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const safeCharacterChunkSize = Math.max(1, Math.floor(characterChunkSize));
  const safeMax = Math.max(1, maxWidth);
  let charactersSinceYield = 0;

  for (let index = 0; index < paragraphs.length; index += 1) {
    if (shouldCancel()) return null;
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
    // for-of 逐码点消费，不为十万字单段先创建整段字符数组。
    for (const char of paragraphs[index]) {
      const charWidth = measure(char);
      const hasContent = isFirst
        ? lineText.length > INDENT.length
        : lineText.length > 0;
      if (hasContent && lineWidth + charWidth > safeMax) pushLine();
      lineText += char;
      lineWidth += charWidth;
      offset += 1;
      charactersSinceYield += 1;
      if (charactersSinceYield >= safeCharacterChunkSize) {
        await yieldControl();
        if (shouldCancel()) return null;
        charactersSinceYield = 0;
      }
    }
    if (lineText.length > 0)
      appendParagraphTail(lines, {
        text: lineText,
        charOffset: lineStart,
        isParagraphStart: isFirst,
      });
    if ((index + 1) % safeChunkSize === 0 || index === paragraphs.length - 1) {
      await yieldControl();
      if (shouldCancel()) return null;
      charactersSinceYield = 0;
    }
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
  heightCorrections = {},
  pageEndOffsets = {},
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
  /** 原生实测溢出只扣对应页首的预算，不牺牲其他页的行数。 */
  heightCorrections?: Readonly<Record<number, number>>;
  /** 实测可容纳的最后一个字符边界；优先于估算行高，避免一次挪走两行原生正文。 */
  pageEndOffsets?: Readonly<Record<number, number>>;
}): ReaderPageData[] {
  const pages: ReaderPageData[] = [];
  const safeLineHeight = Math.max(1, lineHeight);
  const safeGap = Math.max(0, paraGap);
  const budgetFor = (pageNo: number, startOffset: number) =>
    Math.max(
      safeLineHeight,
      (pageNo === 0 ? firstBodyHeight : bodyHeight) -
        Math.max(0, heightCorrections[startOffset] ?? 0),
    );

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

  const appendLine = (line: ReaderLine) => {
    let end = pageEndOffsets[pageHasContent ? pageStart : line.charOffset];
    if (pageHasContent && end > pageStart && line.charOffset >= end) {
      pushPage();
      end = pageEndOffsets[line.charOffset];
    }
    const startsParagraph = line.isParagraphStart;
    // 新段落且本页已有内容时，段落前要占用一段段间距。
    const gap = startsParagraph && pageHasContent ? safeGap : 0;

    if (
      pageHasContent &&
      !(end > pageStart) &&
      pageHeight + gap + safeLineHeight > budgetFor(pages.length, pageStart)
    ) {
      pushPage();
      end = pageEndOffsets[line.charOffset];
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

    // iOS 的断行边界可能位于估算行中间，只拆当前页尾；余下字符完整交给下一页。
    const chars = Array.from(line.text);
    const indent = startsParagraph && line.text.startsWith(INDENT) ? 2 : 0;
    const split = end - line.charOffset + indent;
    if (end > line.charOffset && split < chars.length) {
      blockLines.push(chars.slice(0, split).join(''));
      pushPage();
      appendLine({
        text: chars.slice(split).join(''),
        charOffset: end,
        isParagraphStart: false,
      });
    } else {
      blockLines.push(line.text);
    }
  };
  lines.forEach(appendLine);

  flushBlock();
  if (blocks.length > 0 || pages.length === 0) {
    pushPage();
  }

  return pages;
}

export interface NativeReaderLine {
  text: string;
  y: number;
  height: number;
}

/** 按原生行的真实底边选页尾；文本未完整对齐时返回 null，继续使用高度兜底。 */
export function getNativePageEndOffset({
  blocks,
  availableHeight,
  paraGap,
}: {
  blocks: Array<{ block: ReaderPageBlock; lines: NativeReaderLine[] }>;
  availableHeight: number;
  paraGap: number;
}): number | null {
  let top = 0;
  let end: number | null = null;
  for (const { block, lines: nativeLines } of blocks) {
    const text = block.text.replace(/\n/g, '');
    if (
      !nativeLines.length ||
      nativeLines.map(line => line.text).join('') !== text
    )
      return null;
    let count = 0;
    const indent = text.startsWith(INDENT) ? 2 : 0;
    for (const line of nativeLines) {
      if (top + line.y + line.height > availableHeight + 1) return end;
      count += Array.from(line.text).length;
      end = block.startOffset + Math.max(0, count - indent);
    }
    const last = nativeLines[nativeLines.length - 1];
    top += last.y + last.height + paraGap;
  }
  return end;
}

/** 原生行高会按屏幕像素舍入；保留 1pt 容差，避免 0.x pt 误差迫使本来放得下的一整行换页。 */
export function calculatePageHeightCorrection({
  actualHeight,
  estimatedHeight,
  availableHeight,
  previousCorrection = 0,
}: {
  actualHeight: number;
  estimatedHeight: number;
  availableHeight: number;
  previousCorrection?: number;
}): number {
  if (actualHeight <= availableHeight + 1) return previousCorrection;
  return Math.max(previousCorrection, actualHeight - estimatedHeight - 1, 0);
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
