interface CatalogQualityChapter {
  title: string;
  sourceUrl?: string;
}

function sourceSequence(url?: string): number | null {
  if (!url) return null;
  const match = /\/read\/\d+_(\d+)\.html/i.exec(url);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) ? sequence : null;
}

/**
 * 识别旧版 bookshuku 解析器落盘的切片/残缺目录。“第 N 章”本身是合法标题，
 * 只有“分节阅读 N”或 URL 最大序号远大于条数时才拦截，避免误伤完整数字目录。
 */
export function isBadBookshukuCatalog(
  sourceName: string | undefined,
  chapters: CatalogQualityChapter[],
): boolean {
  if (sourceName !== 'bookshuku' || chapters.length === 0) return false;

  if (
    chapters.some(chapter => /^分节阅读\s*\d+$/i.test(chapter.title.trim()))
  ) {
    return true;
  }

  const maxSequence = chapters.reduce(
    (max, chapter) => Math.max(max, sourceSequence(chapter.sourceUrl) ?? 0),
    0,
  );
  return maxSequence > 0 && chapters.length < maxSequence * 0.5;
}

/**
 * 残目录修复只接受“非空、内部完整、且至少覆盖旧目录最大序号”的候选结果。
 * 书源超时有时会返回首页或半截目录；这种结果不能覆盖本地章节与用户引用。
 */
export function isSafeBookshukuCatalogReplacement(
  sourceName: string | undefined,
  existing: CatalogQualityChapter[],
  candidate: CatalogQualityChapter[],
): boolean {
  if (sourceName !== 'bookshuku') return candidate.length > 0;
  if (candidate.length === 0 || isBadBookshukuCatalog(sourceName, candidate)) {
    return false;
  }

  const existingMaxSequence = existing.reduce(
    (max, chapter) => Math.max(max, sourceSequence(chapter.sourceUrl) ?? 0),
    0,
  );
  const candidateMaxSequence = candidate.reduce(
    (max, chapter) => Math.max(max, sourceSequence(chapter.sourceUrl) ?? 0),
    0,
  );
  if (existingMaxSequence <= 0) return true;
  return candidateMaxSequence >= existingMaxSequence;
}
