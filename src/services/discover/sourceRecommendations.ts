/**
 * 从已登记书源首页提取推荐书目。
 *
 * 推荐只保留详情页 URL，点击后才通过既有书源解析器拉目录和正文，避免首页加载时
 * 批量抓取内容；任一站点不可用时忽略该站，另一站仍可正常展示。
 */

import { fetchHtml } from '../http/fetchHtml';
import { decodeEntities, stripTags, toAbsolute } from '../source/html';
import { resolveSource } from '../source/registry';

export interface SourceRecommendation {
  url: string;
  title: string;
  author?: string;
  sourceName: string;
}

const BOOKSHUKU_LIST_URL = 'http://wap.bookshuku.org/txt/';
const MINGZW_HOME_URL = 'https://www.mingzw.net/';
const MAX_PER_SOURCE = 10;

function unique(items: SourceRecommendation[]): SourceRecommendation[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function parseBookshukuRecommendations(
  html: string,
): SourceRecommendation[] {
  const items: SourceRecommendation[] = [];
  const re =
    /<a\b[^>]*href="([^"]*\/bookinfo\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const plain = decodeEntities(stripTags(match[2]))
      .replace(/^\s*\[[^\]]+\]\s*/, '')
      .trim();
    const [title, author] = plain.split('/').map(part => part.trim());
    if (!title) continue;
    items.push({
      url: toAbsolute(BOOKSHUKU_LIST_URL, match[1]),
      title,
      author: author || undefined,
      sourceName: 'TXT图书下载网',
    });
  }
  return unique(items);
}

export function parseMingzwRecommendations(
  html: string,
): SourceRecommendation[] {
  const items: SourceRecommendation[] = [];
  const re =
    /<a\b[^>]*href="([^"]*\/(?:mibook|mzwbook)\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const title = decodeEntities(stripTags(match[2]))
      .replace(/阅读\s*>>?$/i, '')
      .trim();
    if (!title || title.length > 60) continue;
    items.push({
      url: toAbsolute(MINGZW_HOME_URL, match[1]),
      title,
      sourceName: '明智屋中文网',
    });
  }
  return unique(items);
}

async function fetchOne(
  url: string,
  parse: (html: string) => SourceRecommendation[],
): Promise<SourceRecommendation[]> {
  try {
    // 真机直连书源经常被 Cloudflare 降级成空列表或短列表。推荐页没有必要
    // 依赖用户网络，统一优先走已验证的服务端 curl 代理；Web 端会忽略第三参数。
    return parse(await fetchHtml(url, undefined, { preferLocalProxy: true }));
  } catch {
    return [];
  }
}

export async function fetchSourceRecommendations(): Promise<
  SourceRecommendation[]
> {
  const groups = await Promise.all([
    fetchOne(BOOKSHUKU_LIST_URL, parseBookshukuRecommendations),
    fetchOne(MINGZW_HOME_URL, parseMingzwRecommendations),
  ]);
  // 防御性校验：页面广告或导航链接即使误命中，也不能进入“加入书架”流程。
  return unique(groups.flatMap(group => group.slice(0, MAX_PER_SOURCE)))
    .filter(item => resolveSource(item.url))
    .slice(0, 16);
}

/**
 * 外部搜索引擎没有收录书籍时，退回书源公开列表做标题匹配。
 * 不扫描整站，避免一次搜索触发大量抓取请求；首页/书库的热门和新书仍可直达。
 */
export async function searchSourceCatalogs(
  keyword: string,
): Promise<SourceRecommendation[]> {
  const normalized = keyword.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const groups = await Promise.all([
    fetchOne(BOOKSHUKU_LIST_URL, parseBookshukuRecommendations),
    fetchOne(MINGZW_HOME_URL, parseMingzwRecommendations),
  ]);
  return unique(groups.flat())
    .filter(
      item =>
        resolveSource(item.url) &&
        item.title.toLocaleLowerCase().includes(normalized),
    )
    .slice(0, 15);
}
