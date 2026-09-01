interface ReadingProgressInput {
  chapterIndex: number;
  totalChapters: number;
  /** 当前章节已读比例，范围 0-1。 */
  chapterFraction: number;
}

/**
 * 按“章节位置 + 章内比例”计算整本进度。只有真正到达末章末尾才返回 100，
 * 避免仅打开末章就被记录为读完并写入 finishedAt。
 */
export function calculateReadingProgress({
  chapterIndex,
  totalChapters,
  chapterFraction,
}: ReadingProgressInput): number {
  if (totalChapters <= 0) return 0;

  const safeIndex = Math.max(0, Math.min(chapterIndex, totalChapters - 1));
  const safeFraction = Math.max(0, Math.min(chapterFraction, 1));
  const reachedBookEnd = safeIndex === totalChapters - 1 && safeFraction >= 1;

  if (reachedBookEnd) return 100;

  const progress = Math.floor(
    ((safeIndex + safeFraction) / totalChapters) * 100,
  );
  return Math.max(0, Math.min(progress, 99));
}
