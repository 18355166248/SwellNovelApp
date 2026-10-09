/** 部分书成功不能遮住其他书的检查/落盘失败；离线缓存只计入已成功保存的章节。 */
export function formatFollowResult(result: {
  updated: number;
  failed: number;
  cached: number;
  cacheFailed?: number;
}) {
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`发现 ${result.updated} 个新章节`);
  if (result.cached > 0) parts.push(`已自动缓存 ${result.cached} 章`);
  if (result.failed > 0) parts.push(`${result.failed} 本检查失败`);
  if (result.cacheFailed)
    parts.push(`${result.cacheFailed} 章缓存失败，可阅读时重试`);
  return parts.join('，') || '追更书籍已是最新';
}
