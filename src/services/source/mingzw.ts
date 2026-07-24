/**
 * 书源：明智屋中文网（www.mingzw.net，手机版）。
 *
 * 页面结构（已实测，UTF-8）：
 * - 详情页 /mibook/{id}.html（旧版）或 /mzwbook/{id}.html（当前版）：书名、作者、封面、
 *   简介 <div class="desc">、状态 状态：xxx；目录按每 100 章分段，页内给出各段链接
 *   /mzwchapter/{id}.html → /mclist/{id}_{start}_{end}.html。
 * - 目录分段页 /mclist/{id}_{start}_{end}.html：<a href="/miread 或 /mzwread/{id}_{cid}.html">第N章 标题</a>。
 * - 正文页 /miread 或 /mzwread/{id}_{cid}.html：正文在 <div class="wrap" id="content"> 内，段落用 <p> 分隔，
 *   单页无分页；开头有 SEO 面包屑 / 章节名回显 / ←→ 导航等噪声行需剔除。
 */

import { fetchHtml } from '../http/fetchHtml';
import { BookSource, ParsedBookInfo, ParsedChapter } from './types';
import { decodeEntities, matchOne, stripTags, toAbsolute } from './html';

const HOST = 'www.mingzw.net';
// www 节点在部分国内云服务器上会被解析到不可达地址；繁体站保留同一书库与目录结构，
// 优先走它以保障真机可添加，失败时再回退主站。
const ORIGINS = ['https://tw.mingzw.net', 'https://www.mingzw.net'] as const;
const ORIGIN = ORIGINS[0];
const PROXY_TIMEOUT_MS = 30000;

const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;

function extractBookId(url: string): string | undefined {
  return matchOne(
    /\/(?:mibook|mzwbook|miread|mzwread|mclist|mzwchapter)\/(\d+)/,
    url,
  );
}

/**
 * 明智屋的 www 证书主机名偶发不匹配，iOS 原生 TLS 直连会被 ATS 拦下。
 * 固定走我们白名单 curl 代理，既规避该兼容问题，也保证目录与正文来自同一链路。
 */
function fetchMingzwHtml(url: string): Promise<string> {
  return fetchHtml(url, PROXY_TIMEOUT_MS, {
    preferLocalProxy: true,
    requireLocalProxy: true,
  });
}

async function fetchBookInfoHtml(id: string): Promise<{
  html: string;
  origin: string;
}> {
  let lastError: unknown;
  for (const origin of ORIGINS) {
    try {
      return {
        html: await fetchMingzwHtml(`${origin}/mzwbook/${id}.html`),
        origin,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('明智屋书籍页暂不可达');
}

/** 抽取正文页纯文本：取 id="content" 容器，<p> 转行，剔除开头的 SEO/标题/箭头噪声行。 */
function cleanArticle(html: string): string {
  const block =
    matchOne(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/, html) ||
    matchOne(/<div[^>]*class="content"[^>]*>([\s\S]*?)<\/div>/, html);
  if (!block) return '';
  const text = decodeEntities(
    block
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<ins[\s\S]*?<\/ins>/gi, '')
      .replace(/<\/?p[^>]*>/gi, '\n'),
  );
  const lines = stripTags(text)
    .split('\n')
    .map(l => l.replace(/ /g, ' ').replace(/[←→]/g, '').trim())
    .filter(l => l.length > 0);

  // 剔除开头噪声：SEO 面包屑（含“频道/文学”下划线串）、章节名回显。只在开头连续剔除，
  // 避免误删正文中偶发的“第N章”。
  let start = 0;
  while (
    start < lines.length &&
    start < 4 &&
    (/频道|_.*文学|文学$/.test(lines[start]) ||
      HEADING_RE.test(lines[start]))
  ) {
    start++;
  }
  return lines.slice(start).join('\n');
}

export const mingzwSource: BookSource = {
  id: 'mingzw',
  name: '明智屋中文网',
  host: HOST,

  matchUrl(url: string) {
    return /(^|\.)mingzw\.net/i.test(url);
  },

  extractId(url: string) {
    return extractBookId(url);
  },

  detailUrl(id: string) {
    return `${ORIGIN}/mzwbook/${id}.html`;
  },

  async parseBookInfo(url: string): Promise<ParsedBookInfo> {
    const id = extractBookId(url);
    if (!id) throw new Error('无法从链接中识别书籍编号');
    const { html, origin } = await fetchBookInfoHtml(id);

    const title = [
      matchOne(/<h1[^>]*>([\s\S]*?)<\/h1>/, html),
      matchOne(/<title>\s*(.*?)最新章节/i, html),
      matchOne(/《([^《》]+)》最新章节/i, html),
    ]
      .map(candidate => candidate && decodeEntities(stripTags(candidate)).trim())
      .find(Boolean);
    if (!title) throw new Error('未能解析到书名，可能不是书籍详情页');

    const author =
      matchOne(/作者\s*[：:]\s*(?:<[^>]+>\s*)*<a[^>]*>([^<]+)<\/a>/, html)?.trim() ||
      '佚名';
    const rawCover = matchOne(
      /<div class="cover">[\s\S]*?<img[^>]+src="([^"]+)"/,
      html,
    );
    const cover = rawCover ? toAbsolute(origin, rawCover) : undefined;
    const description = matchOne(/<div[^>]*class="desc"[^>]*>([\s\S]*?)<\/div>/, html);
    const status = matchOne(/状态[：:]\s*(?:<[^>]+>\s*)?([^<\n]{1,8})/, html)?.trim();

    return {
      sourceBookId: id,
      title: decodeEntities(title),
      author: decodeEntities(author),
      cover,
      description: description
        ? decodeEntities(stripTags(description)).trim()
        : undefined,
      status,
      // 当前站点的完整目录入口是 mzwchapter；详情页只展示最新章节。
      catalogUrl: `${origin}/mzwchapter/${id}.html`,
    };
  },

  async parseCatalog(info: ParsedBookInfo): Promise<ParsedChapter[]> {
    const catalogUrl = /\/mzwchapter\/\d+\.html/i.test(info.catalogUrl)
      ? info.catalogUrl
      : `${ORIGIN}/mzwchapter/${info.sourceBookId}.html`;
    const origin = new URL(catalogUrl).origin;
    const detail = await fetchMingzwHtml(catalogUrl);
    // 目录按每 100 章分段：取完整目录页里的各分段链接，按起始序号排序后逐段抓取。
    const segUrls = Array.from(
      new Set(
        Array.from(
      detail.matchAll(/\/mclist\/(\d+)_(\d+)_(\d+)\.html/g),
          m => ({ url: m[0], start: parseInt(m[2], 10) }),
        )
          .sort((a, b) => a.start - b.start)
          .map(s => s.url),
      ),
    );
    // 兜底：若详情页没有分段链接（章节很少），直接用 /mclist/{id}.html。
    const pages = segUrls.length > 0 ? segUrls : [`/mclist/${info.sourceBookId}.html`];

    const chapters: ParsedChapter[] = [];
    const seen = new Set<string>();
    for (const seg of pages) {
      const html = await fetchMingzwHtml(toAbsolute(origin, seg));
      const re = /<a[^>]+href="([^"]*\/(?:miread|mzwread)\/\d+_\d+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const url = toAbsolute(origin, m[1]);
        if (seen.has(url)) continue;
        const title = decodeEntities(stripTags(m[2])).trim();
        // 只保留章节链接（标题形如“第N章…”），过滤书名/导航等杂链。
        if (!HEADING_RE.test(title)) continue;
        seen.add(url);
        chapters.push({ url, title });
      }
    }
    if (chapters.length === 0) throw new Error('未能解析到章节目录');
    return chapters;
  },

  async parseChapterContent(url: string): Promise<string> {
    const html = await fetchMingzwHtml(url);
    return cleanArticle(html);
  },
};
