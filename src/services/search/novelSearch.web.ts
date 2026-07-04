/**
 * 在线搜书（Web）——no-op。
 *
 * 浏览器有跨域限制，需经代理取搜索结果，而代理跑在数据中心 IP 会被搜索引擎封锁，
 * 无法稳定拿到结果。因此 Web 端不提供在线搜书，保持“粘贴 URL 添加网络书籍”模式。
 * 接口与 novelSearch.ts 保持一致，供 SearchScreen 按 isNovelSearchSupported 分支。
 */

export const isNovelSearchSupported = false;

export interface NovelSearchResult {
  url: string;
  title: string;
  sourceName: string;
}

export async function searchNovels(
  _keyword: string,
): Promise<NovelSearchResult[]> {
  return [];
}
