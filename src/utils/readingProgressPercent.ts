interface ReadingProgressInput {
  chapterIndex: number;
  totalChapters: number;
  /** 当前章节已读比例，范围 0-1。 */
  chapterFraction: number;
  /** 书源当前章仍有未加载的子页，已展示内容不能代表章尾。 */
  hasRemainingPages?: boolean;
}

/**
 * 按“章节位置 + 章内比例”计算整本进度。只有真正到达末章末尾才返回 100，
 * 避免仅打开末章就被记录为读完并写入 finishedAt。
 */
export function calculateReadingProgress({
  chapterIndex,
  totalChapters,
  chapterFraction,
  hasRemainingPages = false,
}: ReadingProgressInput): number {
  if (totalChapters <= 0) return 0;

  const safeIndex = Math.max(0, Math.min(chapterIndex, totalChapters - 1));
  const safeFraction = Math.max(0, Math.min(chapterFraction, 1));
  // 有下一子页时，当前缓存末尾只是临时边界；不能提前写入不可逆的 finishedAt。
  const reachedBookEnd =
    !hasRemainingPages && safeIndex === totalChapters - 1 && safeFraction >= 1;

  if (reachedBookEnd) return 100;

  const progress = Math.floor(
    ((safeIndex + safeFraction) / totalChapters) * 100,
  );
  return Math.max(0, Math.min(progress, 99));
}
