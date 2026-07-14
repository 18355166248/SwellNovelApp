/**
 * 在线搜书（原生 iOS / Android）。
 *
 * 思路：搜索引擎不用来“读”，而是把书名解析成**受支持书源**的书籍链接——
 * 用 `site:` 限定到已注册书源域名去搜，从结果里挑出书籍页 URL，再交给现有解析器
 * 加入书架。多引擎兜底：先 DuckDuckGo（HTML 结构最稳），空则退回 Bing；原生请求
 * 走用户设备 IP，不受搜索引擎对数据中心 IP 的封锁。
 *
 * Web 端也会复用这套逻辑；浏览器请求由同源受限代理转发，避免 CORS 限制。
 */

import { fetchHtml } from '../http/fetchHtml';
import { SOURCES, resolveSource } from '../source/registry';
import { decodeEntities, stripTags } from '../source/html';
import { base64ToBytes } from '../../utils/decodeText';
import { searchSourceCatalogs } from '../discover/sourceRecommendations';

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
      for (let i = 0; i < bytes.length; i++)
        out += String.fromCharCode(bytes[i]);
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
      `https://www.bing.com/search?q=${encodeURIComponent(
        q,
      )}&setlang=zh-CN&mkt=zh-CN`,
    parse: html => {
      const hits: RawHit[] = [];
      // Bing 近版会输出 <h2 class="">，不能再假设 h2 没有属性。
      const re = /<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
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
    // 站内书号由各书源自行提取，把章节页/详情页统一规范化到详情页，并按书号去重。
    const id = source.extractId(hit.url);
    if (!id) continue;
    const key = `${source.id}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      url: source.detailUrl(id),
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
      // 真机网络对搜索引擎的请求经常被限流或返回地区化页面，优先复用生产 curl
      // 代理；代理不可用时 fetchHtml 会回退直连，避免单点故障。
      const html = await fetchHtml(engine.buildUrl(query), undefined, {
        preferLocalProxy: true,
      });
      const results = filterToSources(engine.parse(html));
      if (results.length > 0) return results;
    } catch {
      // 该引擎失败，试下一个。
    }
  }
  // 部分老书源页没有被搜索引擎收录，退回书库公开列表做轻量标题匹配。
  return (await searchSourceCatalogs(kw)).map(item => ({
    url: item.url,
    title: item.title,
    sourceName: item.sourceName,
  }));
}
