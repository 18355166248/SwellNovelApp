/**
 * 在线搜书（原生 iOS / Android）。
 *
 * 思路：搜索引擎不用来“读”，而是把书名解析成**受支持书源**的书籍链接——
 * 用 DuckDuckGo 的 HTML 端点搜「书名 + 书源域名」，从结果里挑出命中已注册书源
 * 的书籍页 URL，再交给现有解析器加入书架。选 DDG 是因为它的结果 HTML 结构简单
 * 稳定、便于解析；且原生请求走用户设备 IP，不受搜索引擎对数据中心 IP 的封锁。
 *
 * Web 端由 novelSearch.web.ts 覆盖为 no-op：浏览器有跨域限制、代理又是数据中心
 * IP 会被搜索引擎拦，因此 Web 保持“粘贴 URL 添加”模式。
 */

import { fetchHtml } from '../http/fetchHtml';
import { SOURCES, resolveSource } from '../source/registry';
import { decodeEntities, stripTags } from '../source/html';

export const isNovelSearchSupported = true;

export interface NovelSearchResult {
  url: string; // 规范化后的书籍详情页 URL，供加入书架
  title: string; // 搜索引擎结果标题
  sourceName: string; // 命中的书源展示名
}

const DDG_HTML = 'https://html.duckduckgo.com/html/';
const MAX_RESULTS = 15;

/** DuckDuckGo 结果链接是跳转形式 //duckduckgo.com/l/?uddg=<encoded>；解出真实 URL。 */
function resolveResultHref(href: string): string | null {
  const m = /[?&]uddg=([^&"']+)/.exec(href);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  return /^https?:\/\//i.test(href) ? href : null;
}

export async function searchNovels(
  keyword: string,
): Promise<NovelSearchResult[]> {
  const kw = keyword.trim();
  if (!kw) return [];

  // 附带书源域名做提示词，提高命中已支持书源的概率；再用 resolveSource 过滤。
  const hostTerms = SOURCES.map(s => s.host).join(' ');
  const q = encodeURIComponent(`${kw} ${hostTerms}`);
  const html = await fetchHtml(`${DDG_HTML}?q=${q}&kl=cn-zh`);

  const results: NovelSearchResult[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < MAX_RESULTS) {
    const url = resolveResultHref(m[1]);
    if (!url) continue;
    const source = resolveSource(url);
    if (!source) continue;
    // 站内书号：把章节页/详情页统一规范化到详情页，并按书号去重。
    const idm = /\/(?:bookinfo|read|down|txt)\/(\d+)/.exec(url);
    if (!idm) continue;
    const key = `${source.id}:${idm[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      url: `http://${source.host}/bookinfo/${idm[1]}.html`,
      title: decodeEntities(stripTags(m[2])).trim() || '未知书名',
      sourceName: source.name,
    });
  }
  return results;
}
