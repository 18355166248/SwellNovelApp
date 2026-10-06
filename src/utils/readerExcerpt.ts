export interface ResolvedExcerptDraft {
  position: number;
  excerpt: string;
}

export interface ExcerptRange {
  start: number;
  end: number;
}

interface ParagraphEntry {
  text: string;
  start: number;
}

const charLength = (value: string) => Array.from(value).length;

export function paragraphsFromContent(content: string): string[] {
  return content.split(/\n+/).filter(paragraph => paragraph.trim().length > 0);
}

function paragraphEntries(content: string): ParagraphEntry[] {
  let start = 0;
  return paragraphsFromContent(content).map(text => {
    const entry = { text, start };
    start += charLength(text);
    return entry;
  });
}

/** 同段文字可以重复多次；记录每次命中的逻辑偏移，按实际长按/书签位置选最近锚点。 */
function anchorCandidates(content: string, anchor: string) {
  return paragraphEntries(content).flatMap(entry => {
    const matches: Array<{
      entry: ParagraphEntry;
      anchorIndex: number;
      position: number;
    }> = [];
    let cursor = 0;
    let logical = 0;
    let index = entry.text.indexOf(anchor);
    while (index >= 0) {
      // 增量计算码点偏移，生僻字/表情按一个字符处理，长段反复匹配也不重复扫描整段。
      logical += charLength(entry.text.slice(cursor, index));
      matches.push({
        entry,
        anchorIndex: index,
        position: entry.start + logical,
      });
      cursor = index;
      index = entry.text.indexOf(anchor, index + 1);
    }
    return matches;
  });
}

function normalizedVisibleAnchor(visibleText: string): string {
  return visibleText
    .replace(/\n/g, '')
    .replace(/^　　/, '')
    .trim()
    .slice(0, 48);
}

/**
 * 把长按命中的分页块还原成完整段落，并返回分页器使用的逻辑字符偏移。
 * 逻辑偏移不计段间换行，必须与 paginate.ts 保持一致，否则章节越长高亮和回跳越偏。
 */
export function resolveExcerptDraft(
  content: string,
  visibleText: string,
  fallbackPosition: number,
): ResolvedExcerptDraft | null {
  const anchor = normalizedVisibleAnchor(visibleText);
  if (!anchor || !content) return null;

  const candidates = anchorCandidates(content, anchor).sort(
    (a, b) =>
      Math.abs(a.position - fallbackPosition) -
      Math.abs(b.position - fallbackPosition),
  );
  const selected = candidates[0];
  if (!selected) return null;

  const raw = selected.entry.text;
  const leadingUnits = raw.length - raw.trimStart().length;
  let position = selected.entry.start + charLength(raw.slice(0, leadingUnits));
  const trimmed = raw.trim();
  const chars = Array.from(trimmed);
  let excerpt = trimmed;

  // 极少数无换行长文本只保留锚点附近内容，防止笔记面板被超长段落撑满。
  if (chars.length > 600) {
    const anchorUnits = selected.anchorIndex - leadingUnits;
    const anchorOffset = charLength(trimmed.slice(0, Math.max(0, anchorUnits)));
    const sliceStart = Math.max(0, anchorOffset - 180);
    position += sliceStart;
    excerpt = `${sliceStart > 0 ? '…' : ''}${chars
      .slice(sliceStart, sliceStart + 600)
      .join('')}${sliceStart + 600 < chars.length ? '…' : ''}`;
  }

  return { position, excerpt };
}

/**
 * 根据摘抄文字重新解析实际逻辑范围。优先使用文字锚点，因此可兼容旧版本保存的原始正文下标。
 */
export function resolveExcerptRange(
  content: string,
  excerpt: string,
  fallbackPosition: number,
): ExcerptRange {
  const cleanExcerpt = excerpt.replace(/^…/, '').replace(/…$/, '').trim();
  const anchor = cleanExcerpt.slice(0, 48);
  if (!content || !anchor) {
    return {
      start: fallbackPosition,
      end: fallbackPosition + Math.max(1, charLength(cleanExcerpt)),
    };
  }

  const candidates = anchorCandidates(content, anchor).sort(
    (a, b) =>
      Math.abs(a.position - fallbackPosition) -
      Math.abs(b.position - fallbackPosition),
  );
  const selected = candidates[0];
  if (!selected) {
    return {
      start: fallbackPosition,
      end: fallbackPosition + Math.max(1, charLength(cleanExcerpt)),
    };
  }

  const start =
    selected.entry.start +
    charLength(selected.entry.text.slice(0, selected.anchorIndex));
  return { start, end: start + Math.max(1, charLength(cleanExcerpt)) };
}
