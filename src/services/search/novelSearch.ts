/**
 * 在线搜书（原生 iOS / Android）。
 *
 * 思路：搜索引擎不用来“读”，而是把书名解析成**受支持书源**的书籍链接——
 * 用 `site:` 限定到已注册书源域名去搜，从结果里挑出书籍页 URL，再交给现有解析器
 * 加入书架。多引擎兜底：先 DuckDuckGo（HTML 结构最稳），空则退回 Bing；原生请求
 * 走用户设备 IP，不受搜索引擎对数据中心 IP 的封锁。
 *
 * Web 端由 novelSearch.web.ts 覆盖为 no-op：浏览器有跨域限制、代理又是数据中心
 * IP 会被搜索引擎拦，因此 Web 保持“粘贴 URL 添加”模式。
 */

import { fetchHtml } from '../http/fetchHtml';
import { SOURCES, resolveSource } from '../source/registry';
import { decodeEntities, stripTags } from '../source/html';
import { base64ToBytes } from '../../utils/decodeText';

export const isNovelSearchSupported = true;

export interface NovelSearchResult {
  url: string; // 规范化后的书籍详情页 URL，供加入书架
  title: string; // 搜索引擎结果标题
  sourceName: string; // 命中的书源展示名
}

const MAX_RESULTS = 15;

interface RawHit {
  url: string; // 已解出的真实结果 URL（引擎跳转已还原）
  title: string; // 结果标题（可能含 HTML 标签）
}

interface SearchEngine {
  name: string;
  buildUrl(query: string): string;
  parse(html: string): RawHit[];
}

/** 用 site: 把搜索限定到已注册书源域名，命中率更高。 */
function siteScopedQuery(keyword: string): string {
  const sites = SOURCES.map(s => `site:${s.host}`);
  const scope = sites.length === 1 ? sites[0] : `(${sites.join(' OR ')})`;
  return `${keyword} ${scope}`;
}

/** DuckDuckGo 结果链接是跳转形式 //duckduckgo.com/l/?uddg=<encoded>；解出真实 URL。 */
function decodeDdgHref(href: string): string | null {
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

/** Bing 结果链接可能是 bing.com/ck/a?...&u=a1<base64url>，或直接 URL。 */
function decodeBingHref(href: string): string | null {
  const m = /[?&]u=a1([^&"']+)/.exec(href);
  if (m) {
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bytes = base64ToBytes(b64);
      let out = '';
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return /^https?:\/\//i.test(out) ? out : null;
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(href) && !/(^|\.)bing\.com/i.test(href)) return href;
  return null;
}

const ENGINES: SearchEngine[] = [
  {
    name: 'duckduckgo',
    buildUrl: q =>
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=cn-zh`,
    parse: html => {
      const hits: RawHit[] = [];
      const re =
        /<a\b[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const url = decodeDdgHref(m[1]);
        if (url) hits.push({ url, title: m[2] });
      }
      return hits;
    },
  },
  {
    name: 'bing',
    buildUrl: q =>
      `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-CN&mkt=zh-CN`,
    parse: html => {
      const hits: RawHit[] = [];
      const re = /<h2>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const url = decodeBingHref(m[1]);
        if (url) hits.push({ url, title: m[2] });
      }
      return hits;
    },
  },
];

/** 把引擎原始命中过滤成“命中已注册书源的书籍详情页”，按书源+书号去重。 */
function filterToSources(hits: RawHit[]): NovelSearchResult[] {
  const results: NovelSearchResult[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const source = resolveSource(hit.url);
    if (!source) continue;
    // 站内书号：把章节页/详情页统一规范化到详情页，并按书号去重。
    const idm = /\/(?:bookinfo|read|down|txt)\/(\d+)/.exec(hit.url);
    if (!idm) continue;
    const key = `${source.id}:${idm[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      url: `http://${source.host}/bookinfo/${idm[1]}.html`,
      title: decodeEntities(stripTags(hit.title)).trim() || '未知书名',
      sourceName: source.name,
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

export async function searchNovels(
  keyword: string,
): Promise<NovelSearchResult[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const query = siteScopedQuery(kw);

  // 多引擎兜底：任一引擎拿到结果即返回；全部失败/空则返回空列表。
  for (const engine of ENGINES) {
    try {
      const html = await fetchHtml(engine.buildUrl(query));
      const results = filterToSources(engine.parse(html));
      if (results.length > 0) return results;
    } catch {
      // 该引擎失败，试下一个。
    }
  }
  return [];
}
