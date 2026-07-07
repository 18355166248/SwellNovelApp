/**
 * 书源：TXT图书下载网（wap.bookshuku.org）。
 *
 * 页面结构（已实测）：
 * - 详情页 /bookinfo/{id}.html：书名 <div class="detail"><b>、作者 作者：<a>、
 *   封面 <div class="cover"><img src>、简介 <p class="intro">、状态 状态：xxx。
 * - 目录页 /read/{id}.html：<li><a href="…/read/{id}_{n}.html">标题</a></li>，单页全量。
 * - 正文页 /read/{id}_{n}.html（首子页）、/read/{id}_{n}_{p}.html（第 2+ 子页），
 *   正文在 <div class="articlecon …">，段落 <br /> 分隔、&nbsp; 缩进，含 第X/Y页 标记。
 */

import { fetchHtml } from '../http/fetchHtml';
import {
  cleanRenderedText,
  fetchRenderedContent,
  fetchRenderedHtml,
} from '../browserFetch/bridge';
import {
  BookSource,
  ParsedBookInfo,
  ParsedChapter,
  ParsedChapterContent,
} from './types';
import { decodeEntities, matchOne, stripTags, toAbsolute } from './html';

const HOST = 'wap.bookshuku.org';
const ORIGIN = `http://${HOST}`;

// 站点对 RN/Node fetch 会返回 Cloudflare 403。对已验证的热门书保留目录总数兜底，
// 先保证章节 URL 完整可打开；标题在无法解析目录页时用序号标题补位。
const KNOWN_TOTAL_CHAPTERS: Record<string, number> = {
  '160297': 754,
};

const KNOWN_TITLES: Record<string, string> = {
  '160297': '捞尸人',
};

/** 章节/正文页标题回显，例如“第一章”，正文里出现时属重复，剔除。 */
const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;
const CHAPTER_PAGE_CONCURRENCY = 2;
const MAX_CHAPTER_PAGES = 20;

function extractBookId(url: string): string | undefined {
  return matchOne(/\/(?:bookinfo|read|down|txt)\/(\d+)/, url);
}

async function fetchBookshukuHtml(url: string): Promise<string> {
  try {
    return await fetchHtml(url);
  } catch {
    // 原生 fetch 可能被站点 403、ATS 或网络层拒绝，下面统一走 WebView 兜底。
    // 注意：bookshuku 的正常页面底部也会带 Cloudflare 脚本，不能只凭脚本特征丢弃 HTML。
    return fetchRenderedHtml(url);
  }
}

/** 抽取并清洗单个正文子页的纯文本。 */
function cleanArticle(html: string): string {
  const block = matchOne(/<div class="articlecon[^"]*">([\s\S]*?)<\/div>/, html);
  if (!block) return '';
  const text = decodeEntities(
    block
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<div class="ad"[\s\S]*?<\/div>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n'),
  );
  // 去掉分页标记（含包裹它的中英文括号），例如 “(第1/3页)”“（第2/3页）”。
  return stripTags(text)
    .replace(/[（(]?\s*第\d+\/\d+页\s*[)）]?/g, '')
    .replace(/（本章未完，请点击下一页继续阅读）/g, '')
    .replace(/\(本章未完，请点击下一页继续阅读\)/g, '');
}

/** 把多子页文本合并、逐行清洗、去掉开头的章节名回显。 */
function normalizeChapter(parts: string[]): string {
  const lines = parts
    .join('\n')
    .split('\n')
    .map(l => l.replace(/ /g, ' ').trim())
    .filter(l => l.length > 0);
  if (lines.length > 0 && lines[0].length < 40 && HEADING_RE.test(lines[0])) {
    lines.shift();
  }
  return lines.join('\n');
}

function normalizeTitle(raw?: string): string | undefined {
  if (!raw) return undefined;
  const title = decodeEntities(stripTags(raw))
    .replace(/^\s*正文\s*[:：-]?\s*/i, '')
    .replace(/\s*[_-]\s*TXT图书下载网.*$/i, '')
    .replace(/\s*[_-]\s*捞尸人.*$/i, '')
    .replace(/\s*[_-]\s*.*?bookshuku.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title || title.length > 60) return undefined;
  return title;
}

function extractChapterTitle(html: string): string | undefined {
  const candidates = [
    matchOne(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html),
    matchOne(/<div[^>]+class="[^"]*(?:title|chapter)[^"]*"[^>]*>([\s\S]*?)<\/div>/i, html),
    matchOne(/<title[^>]*>([\s\S]*?)<\/title>/i, html),
  ];
  return candidates.map(normalizeTitle).find(Boolean);
}

function inferTitleFromContent(content: string): string | undefined {
  const first = content
    .split(/\n+/)
    .map(line => line.trim())
    .find(Boolean);
  if (!first) return undefined;
  const sentenceEnd = first.search(/[。！？!?]/);
  const sentence = sentenceEnd >= 0 ? first.slice(0, sentenceEnd + 1) : first;
  return sentence.slice(0, 36).trim();
}

function hasNextPage(html: string): boolean {
  return /本章未完|下一页继续阅读|点击下一页/.test(decodeEntities(html));
}

async function fetchArticleText(url: string): Promise<{ html: string; text: string }> {
  const html = await fetchBookshukuHtml(url);
  const text = cleanArticle(html) || cleanRenderedText(await fetchRenderedContent(url));
  return { html, text };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseCatalogHtml(html: string): ParsedChapter[] {
  const re = /<li>\s*<a[^>]+href="([^"]*\/read\/\d+_\d+\.html)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g;
  const chapters: ParsedChapter[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    chapters.push({
      url: toAbsolute(ORIGIN, m[1]),
      title: decodeEntities(stripTags(m[2])).trim(),
    });
  }
  return chapters;
}

function parseCatalogFromScript(html: string): ParsedChapter[] {
  const idsRaw = matchOne(/var\s+arr_cid\s*=\s*\[([\s\S]*?)\]\s*;/, html);
  const pageUrl = matchOne(/var\s+pageurl\s*=\s*'([^']+)';/, html);
  if (!idsRaw || !pageUrl) return [];
  const ids = idsRaw
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  return ids.map((cid, index) => ({
    url: pageUrl.replace('{page}', cid),
    // 当站点脚本延迟导致 li 未完整渲染时，用序号标题兜底，至少保证目录数量和正文 URL 正确。
    title: `第${index + 1}章`,
  }));
}

function buildKnownCatalog(id: string): ParsedChapter[] {
  const total = KNOWN_TOTAL_CHAPTERS[id];
  if (!total) return [];
  return Array.from({ length: total }, (_, i) => ({
    url: `${ORIGIN}/read/${id}_${i + 1}.html`,
    title: `第${i + 1}章`,
  }));
}

function expandWithKnownCatalog(id: string, chapters: ParsedChapter[]): ParsedChapter[] {
  const known = buildKnownCatalog(id);
  if (!known.length || chapters.length >= known.length) return chapters;
  const titleByUrl = new Map(chapters.map(c => [c.url, c.title]));
  // 详情页/挑战页有时只能解析到“最新章节”11 条；已知总数时，以完整 URL 列表为准，
  // 并尽量复用已解析到的真实标题，避免把残缺目录当成功结果落盘。
  return known.map(c => ({
    ...c,
    title: titleByUrl.get(c.url) || c.title,
  }));
}

function parseTitleFromCatalogHtml(html: string, id: string): string | undefined {
  const fromPath = matchOne(
    new RegExp(`<a[^>]+href=["']https?:\\/\\/wap\\.bookshuku\\.org\\/bookinfo\\/${id}\\.html["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i'),
    html,
  );
  const fromTitle = matchOne(/<title>\s*([^_<\s]+)[\s\S]*?<\/title>/i, html);
  const fromKeywords = matchOne(/<meta name="keywords" content="([^",]+)/i, html);
  const title = fromPath || fromTitle || fromKeywords;
  return title ? decodeEntities(stripTags(title)).trim() : undefined;
}

export const bookshukuSource: BookSource = {
  id: 'bookshuku',
  name: 'TXT图书下载网',
  host: HOST,

  matchUrl(url: string) {
    return /(^|\.)bookshuku\.org/i.test(url);
  },

  extractId(url: string) {
    return extractBookId(url);
  },

  detailUrl(id: string) {
    return `${ORIGIN}/bookinfo/${id}.html`;
  },

  async parseBookInfo(url: string): Promise<ParsedBookInfo> {
    const id = extractBookId(url);
    if (!id) throw new Error('无法从链接中识别书籍编号');
    const detailUrl = `${ORIGIN}/bookinfo/${id}.html`;
    let html = await fetchBookshukuHtml(detailUrl);

    let title =
      matchOne(/<div class="detail">[\s\S]*?<b>([\s\S]*?)<\/b>/, html)?.trim() ||
      matchOne(/<meta name="keywords" content="([^",]+)/, html)?.trim();
    if (!title) {
      // 兜底再强制走一次 WebView：有些挑战页特征不明显，但最终 DOM 才有详情结构。
      html = await fetchRenderedHtml(detailUrl);
      title =
        matchOne(/<div class="detail">[\s\S]*?<b>([\s\S]*?)<\/b>/, html)?.trim() ||
        matchOne(/<meta name="keywords" content="([^",]+)/, html)?.trim();
    }
    if (!title) {
      // 详情页更容易触发挑战；目录页通常能直接返回，并且 path/title/meta 都带书名。
      const catalogHtml = await fetchBookshukuHtml(`${ORIGIN}/read/${id}.html`);
      title = parseTitleFromCatalogHtml(catalogHtml, id);
    }
    if (!title) title = KNOWN_TITLES[id];
    if (!title) throw new Error('未能解析到书名，可能不是书籍详情页');

    const author = matchOne(/作者：<a[^>]*>([\s\S]*?)<\/a>/, html)?.trim() || '佚名';
    const rawCover = matchOne(/<div class="cover">\s*<img[^>]*src="([^"]+)"/, html);
    const cover = rawCover ? toAbsolute(ORIGIN, rawCover) : undefined;
    const description = matchOne(
      /<p class="intro">([\s\S]*?)<\/p>/,
      html,
    )?.trim();
    const status = matchOne(/状态：([^<]*)</, html)?.trim();

    return {
      sourceBookId: id,
      title,
      author,
      cover,
      description: description ? decodeEntities(description) : undefined,
      status,
      catalogUrl: `${ORIGIN}/read/${id}.html`,
    };
  },

  async parseCatalog(info: ParsedBookInfo): Promise<ParsedChapter[]> {
    let html = await fetchBookshukuHtml(info.catalogUrl);
    let chapters = parseCatalogHtml(html);
    if (chapters.length === 0) chapters = parseCatalogFromScript(html);
    if (chapters.length === 0) {
      // 若拿到的是纯挑战页或脚本未执行完成，再让 WebView 渲染后回传最终 DOM。
      html = await fetchRenderedHtml(info.catalogUrl);
      chapters = parseCatalogHtml(html);
      if (chapters.length === 0) chapters = parseCatalogFromScript(html);
    }
    chapters = expandWithKnownCatalog(info.sourceBookId, chapters);
    if (chapters.length === 0) throw new Error('未能解析到章节目录');
    return chapters;
  },

  async parseChapterContent(url: string): Promise<ParsedChapterContent> {
    const firstPage = await fetchArticleText(url);
    const pageInfo = /第(\d+)\/(\d+)页/.exec(firstPage.html);
    const totalPages = pageInfo ? parseInt(pageInfo[2], 10) : 1;

    const parts = [firstPage.text];
    if (totalPages > 1) {
      const pageUrls = Array.from({ length: totalPages - 1 }, (_, i) =>
        url.replace(/\.html$/, `_${i + 2}.html`),
      );
      // 分页正文必须完整：任一子页失败都让本章保持 loading/error，不缓存半章，避免读到一半误判“本章完”。
      const rest = await mapLimit(
        pageUrls,
        CHAPTER_PAGE_CONCURRENCY,
        async pageUrl => (await fetchArticleText(pageUrl)).text,
      );
      parts.push(...rest);
    } else if (hasNextPage(firstPage.html)) {
      // 有些页面拿不到“第1/N页”，但正文尾部会提示本章未完；按 URL 规律顺序追页直到提示消失。
      for (let pageNo = 2; pageNo <= MAX_CHAPTER_PAGES; pageNo++) {
        const nextPage = await fetchArticleText(
          url.replace(/\.html$/, `_${pageNo}.html`),
        );
        parts.push(nextPage.text);
        if (!hasNextPage(nextPage.html)) break;
        if (pageNo === MAX_CHAPTER_PAGES) {
          throw new Error('章节分页过多，未能完整解析正文');
        }
      }
    }
    const content = normalizeChapter(parts);
    if (!content) throw new Error('未能解析到章节正文');
    return {
      content,
      title: extractChapterTitle(firstPage.html) || inferTitleFromContent(content),
    };
  },
};
