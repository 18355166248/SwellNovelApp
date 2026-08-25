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
// 单书源搜索最多等待 8 秒；多书源逐个兜底时不能让用户在搜索页长时间无反馈。
const SEARCH_ENGINE_TIMEOUT_MS = 8000;

/**
 * 已人工核验过目录质量的稳定入口。
 * 搜索引擎对老书收录经常不完整，而书库同名 TXT 可能只是“分节阅读 N”切片；
 * 命中这些精确书名时直接返回可逐章阅读的书源，避免用户加入不可用目录。
 */
const VERIFIED_TITLE_ENTRIES = [
  {
    title: '凡人修仙传',
    sourceId: 'mingzw',
    sourceBookId: '17482',
  },
  {
    title: '道诡异仙',
    sourceId: 'mingzw',
    sourceBookId: '39572',
  },
  {
    title: '道诡异仙',
    sourceId: 'bookshuku',
    sourceBookId: '117811',
  },
] as const;

interface RawHit {
  url: string; // 已解出的真实结果 URL（引擎跳转已还原）
  title: string; // 结果标题（可能含 HTML 标签）
}

interface SearchEngine {
  name: string;
  buildUrl(query: string): string;
  parse(html: string): RawHit[];
}

/** 用单一 site: 限定到一个书源；混合 OR 查询会让部分引擎混入同站相关推荐。 */
function sourceScopedQuery(keyword: string, host: string): string {
  return `${keyword} site:${host}`;
}

function getVerifiedTitleResults(keyword: string): NovelSearchResult[] {
  const normalized = keyword.replace(/\s+/g, '').toLocaleLowerCase();
  if (normalized.length < 2) return [];
  return VERIFIED_TITLE_ENTRIES.flatMap(entry => {
    // 用户常只输入“凡人”这类书名简称；同样锁定已核验的逐章书源，
    // 不能再退回 bookshuku 的 TXT 分节页（该站会把分段误报为章节）。
    if (!entry.title.toLocaleLowerCase().includes(normalized)) return [];
    const source = SOURCES.find(item => item.id === entry.sourceId);
    if (!source) return [];
    return [
      {
        url: source.detailUrl(entry.sourceBookId),
        title: entry.title,
        sourceName: source.name,
      },
    ];
  });
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
function filterToSources(hits: RawHit[], keyword: string): NovelSearchResult[] {
  const results: NovelSearchResult[] = [];
  const seen = new Set<string>();
  const normalizedKeyword = keyword.toLocaleLowerCase();
  for (const hit of hits) {
    const source = resolveSource(hit.url);
    if (!source) continue;
    const title = decodeEntities(stripTags(hit.title)).trim() || '未知书名';
    // site: 约束只能保证来源站点正确，搜索引擎仍会混入同站点的相关推荐。
    // 标题必须包含用户关键词，才可作为可加入书架的搜索结果，防止误加无关小说。
    if (!title.toLocaleLowerCase().includes(normalizedKeyword)) continue;
    // 站内书号由各书源自行提取，把章节页/详情页统一规范化到详情页，并按书号去重。
    const id = source.extractId(hit.url);
    if (!id) continue;
    const key = `${source.id}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      url: source.detailUrl(id),
      title,
      sourceName: source.name,
    });
    if (results.length >= MAX_RESULTS) break;
  }
  // 明智屋提供逐章目录；书库的部分旧 TXT 只暴露“分节阅读 N”切片。
  // 同一本同时命中时优先给可正确跳章、标题完整的来源，避免用户误加切片目录。
  return results.sort((a, b) => {
    const score = (item: NovelSearchResult) =>
      item.sourceName === '明智屋中文网' ? 0 : 1;
    return score(a) - score(b);
  });
}

export async function searchNovels(
  keyword: string,
): Promise<NovelSearchResult[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const verified = getVerifiedTitleResults(kw);
  if (verified.length > 0) return verified;
  const collected: NovelSearchResult[] = [];
  // 明智屋是逐章目录，书库部分作品只有 TXT 切片；同名书先查明智屋，
  // 但仍会继续查询其他已登记书源，避免因为一个站点漏收录而完全无结果。
  const orderedSources = [...SOURCES].sort(
    (a, b) => Number(b.id === 'mingzw') - Number(a.id === 'mingzw'),
  );
  for (const source of orderedSources) {
    const query = sourceScopedQuery(kw, source.host);
    for (const engine of ENGINES) {
      try {
        // 真机网络对搜索引擎的请求经常被限流或返回地区化页面，优先复用生产 curl
        // 代理；代理不可用时 fetchHtml 会回退直连，避免单点故障。
        const html = await fetchHtml(
          engine.buildUrl(query),
          SEARCH_ENGINE_TIMEOUT_MS,
          { preferLocalProxy: true },
        );
        const results = filterToSources(engine.parse(html), kw).filter(
          item => item.sourceName === source.name,
        );
        if (results.length > 0) {
          collected.push(...results);
          break;
        }
      } catch {
        // 该引擎失败，试下一个。
      }
    }
  }
  if (collected.length > 0) return collected;
  // 部分老书源页没有被搜索引擎收录，退回书库公开列表做轻量标题匹配。
  return (await searchSourceCatalogs(kw)).map(item => ({
    url: item.url,
    title: item.title,
    sourceName: item.sourceName,
  }));
}
