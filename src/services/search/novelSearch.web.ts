/**
 * 在线搜书（Web）。浏览器请求由 fetchHtml.web.ts 交给同源白名单代理，
 * 只会访问固定搜索引擎与已登记书源，不会把服务器暴露为开放代理。
 */

import { fetchHtml } from '../http/fetchHtml';
import { SOURCES, resolveSource } from '../source/registry';
import { decodeEntities, stripTags } from '../source/html';
import { base64ToBytes } from '../../utils/decodeText';
import { searchSourceCatalogs } from '../discover/sourceRecommendations';

export const isNovelSearchSupported = true;

export interface NovelSearchResult {
  url: string;
  title: string;
  sourceName: string;
}

interface RawHit {
  url: string;
  title: string;
}

function siteScopedQuery(keyword: string): string {
  return `${keyword} (${SOURCES.map(s => `site:${s.host}`).join(' OR ')})`;
}

function decodeDdgHref(href: string): string | null {
  const match = /[?&]uddg=([^&"']+)/.exec(href);
  try {
    return match
      ? decodeURIComponent(match[1])
      : /^https?:\/\//i.test(href)
      ? href
      : null;
  } catch {
    return null;
  }
}

function decodeBingHref(href: string): string | null {
  const match = /[?&]u=a1([^&"']+)/.exec(href);
  try {
    if (match) {
      let base64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const bytes = base64ToBytes(base64);
      let url = '';
      for (let i = 0; i < bytes.length; i += 1)
        url += String.fromCharCode(bytes[i]);
      return /^https?:\/\//i.test(url) ? url : null;
    }
    return /^https?:\/\//i.test(href) && !/(^|\.)bing\.com/i.test(href)
      ? href
      : null;
  } catch {
    return null;
  }
}

function toResults(hits: RawHit[]): NovelSearchResult[] {
  const seen = new Set<string>();
  return hits
    .flatMap(hit => {
      const source = resolveSource(hit.url);
      const id = source?.extractId(hit.url);
      const key = source && id ? `${source.id}:${id}` : '';
      if (!source || !id || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          url: source.detailUrl(id),
          title: decodeEntities(stripTags(hit.title)).trim() || '未知书名',
          sourceName: source.name,
        },
      ];
    })
    .slice(0, 15);
}

export async function searchNovels(
  keyword: string,
): Promise<NovelSearchResult[]> {
  const query = siteScopedQuery(keyword.trim());
  if (!keyword.trim()) return [];
  const engines: Array<{ url: string; parse: (html: string) => RawHit[] }> = [
    {
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
        query,
      )}&kl=cn-zh`,
      parse: html =>
        Array.from(
          html.matchAll(
            /<a\b[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
          ),
        ).flatMap(match => {
          const url = decodeDdgHref(match[1]);
          return url ? [{ url, title: match[2] }] : [];
        }),
    },
    {
      url: `https://www.bing.com/search?q=${encodeURIComponent(
        query,
      )}&setlang=zh-CN&mkt=zh-CN`,
      parse: html =>
        Array.from(
          html.matchAll(
            /<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
          ),
        ).flatMap(match => {
          const url = decodeBingHref(match[1]);
          return url ? [{ url, title: match[2] }] : [];
        }),
    },
  ];
  for (const engine of engines) {
    try {
      const results = toResults(engine.parse(await fetchHtml(engine.url)));
      if (results.length) return results;
    } catch {
      // 单个搜索引擎失败时继续尝试另一个。
    }
  }
  // 外部索引缺失时从书源公开列表匹配，热门书仍可被直接加入书架。
  return (await searchSourceCatalogs(keyword)).map(item => ({
    url: item.url,
    title: item.title,
    sourceName: item.sourceName,
  }));
}
