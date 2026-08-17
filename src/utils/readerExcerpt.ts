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

function distanceToParagraph(position: number, entry: ParagraphEntry): number {
  const end = entry.start + charLength(entry.text);
  if (position < entry.start) return entry.start - position;
  if (position > end) return position - end;
  return 0;
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

  const candidates = paragraphEntries(content)
    .map(entry => ({
      entry,
      anchorIndex: entry.text.trim().indexOf(anchor),
    }))
    .filter(candidate => candidate.anchorIndex >= 0)
    .sort(
      (a, b) =>
        distanceToParagraph(fallbackPosition, a.entry) -
        distanceToParagraph(fallbackPosition, b.entry),
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
    const anchorUnits = trimmed.indexOf(anchor);
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

  const candidates = paragraphEntries(content)
    .map(entry => ({ entry, anchorIndex: entry.text.indexOf(anchor) }))
    .filter(candidate => candidate.anchorIndex >= 0)
    .sort((a, b) => {
      const aStart = a.entry.start + charLength(a.entry.text.slice(0, a.anchorIndex));
      const bStart = b.entry.start + charLength(b.entry.text.slice(0, b.anchorIndex));
      return (
        Math.abs(aStart - fallbackPosition) - Math.abs(bStart - fallbackPosition)
      );
    });
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
