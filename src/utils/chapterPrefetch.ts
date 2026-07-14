/** 阅读器默认向后预取的章节数。顺序抓取，避免同时打满书源连接。 */
export const READER_PREFETCH_AHEAD = 3;

/**
 * 计算当前章之后需要预取的章节索引；只向阅读方向前进，末尾自动截断。
 * 纯函数供三端共用，也便于覆盖章节边界场景。
 */
export function getForwardPrefetchIndices(
  currentIndex: number,
  total: number,
  count = READER_PREFETCH_AHEAD,
): number[] {
  if (total <= 0 || count <= 0) return [];
  const start = Math.max(-1, Math.min(currentIndex, total - 1));
  const end = Math.min(total, start + 1 + count);
  const indices: number[] = [];
  for (let index = start + 1; index < end; index += 1) {
    indices.push(index);
  }
  return indices;
}
