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
  ParseChapterOptions,
  ParsedBookInfo,
  ParsedChapter,
  ParsedChapterContent,
} from './types';
import { decodeEntities, matchOne, stripTags, toAbsolute } from './html';

const HOST = 'wap.bookshuku.org';
const ORIGIN = `http://${HOST}`;

// bookshuku 在 Cloudflare/移动页降级时可能只返回最新 11 条章节；对已验证书籍保留
// 章节总数兜底，保证目录 URL 完整，真实标题在打开章节后按需修正。
const KNOWN_TOTAL_CHAPTERS: Record<string, number> = {
  '160297': 754,
};

const KNOWN_TITLES: Record<string, string> = {
  '160297': '捞尸人',
};
const BAD_TITLE_CANDIDATES = new Set([
  '恭喜',
  '恭喜!',
  '恭喜！',
  '心动时刻',
  '温馨提醒',
  '漫画主页',
  '外围名媛',
  '约爱社区',
  '👏💦约爱社区',
]);
const ARTICLE_DIRECT_TIMEOUT_MS = 6000;
const ARTICLE_WEBVIEW_TIMEOUT_MS = 22000;
const ARTICLE_WEBVIEW_WAIT_MS = 8000;
const ARTICLE_TEXT_WEBVIEW_TIMEOUT_MS = 12000;
const ARTICLE_TEXT_WEBVIEW_WAIT_MS = 5000;

/** 章节/正文页标题回显，例如“第一章”，正文里出现时属重复，剔除。 */
const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;

function extractBookId(url: string): string | undefined {
  return matchOne(/\/(?:bookinfo|read|down|txt)\/(\d+)/, url);
}

function isCloudflareChallenge(html: string): boolean {
  return (
    /<title>\s*Just a moment/i.test(html) ||
    /Enable JavaScript and cookies to continue/i.test(html) ||
    /\/cdn-cgi\/challenge-platform\//i.test(html)
  );
}

async function fetchBookshukuHtml(url: string): Promise<string> {
  const startedAt = Date.now();
  try {
    const html = await fetchHtml(url);
    if (isCloudflareChallenge(html)) {
      console.warn('[bookshuku] fetch html got challenge, fallback WebView', {
        url,
        ms: Date.now() - startedAt,
        length: html.length,
      });
      const renderedHtml = await fetchRenderedHtml(url);
      console.warn('[bookshuku] WebView html ok after challenge', {
        url,
        ms: Date.now() - startedAt,
        length: renderedHtml.length,
      });
      return renderedHtml;
    }
    console.info('[bookshuku] fetch html ok', {
      url,
      ms: Date.now() - startedAt,
      length: html.length,
    });
    return html;
  } catch (error) {
    // 原生 fetch 可能被站点 403、ATS 或网络层拒绝，下面统一走 WebView 兜底。
    // 注意：bookshuku 的正常页面底部也会带 Cloudflare 脚本，不能只凭脚本特征丢弃 HTML。
    console.warn('[bookshuku] fetch html fallback WebView', {
      url,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    const html = await fetchRenderedHtml(url);
    console.info('[bookshuku] WebView html ok', {
      url,
      ms: Date.now() - startedAt,
      length: html.length,
    });
    return html;
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
    .filter(l => l.length > 0)
    // 站点每个分页正文开头都会重复章节标题，合并多页时要全部剔除。
    .filter(l => !(l.length < 40 && HEADING_RE.test(l)));
  return lines.join('\n');
}

function normalizeTitle(raw?: string): string | undefined {
  if (!raw) return undefined;
  const title = decodeEntities(stripTags(raw))
    .replace(/^\s*正文\s*[:：-]?\s*/i, '')
    .replace(/[>»›]+/g, ' ')
    .replace(/\s*[_-]\s*全文阅读.*$/i, '')
    .replace(/\s*[_-]\s*分节阅读.*$/i, '')
    .replace(/\s*[_-]\s*TXT图书下载网.*$/i, '')
    .replace(/\s*[_-]\s*捞尸人.*$/i, '')
    .replace(/\s*[_-]\s*.*?bookshuku.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title || title.length > 60) return undefined;
  if (Object.values(KNOWN_TITLES).includes(title)) return undefined;
  if (BAD_TITLE_CANDIDATES.has(title)) return undefined;
  if (/^(目录|首页|上一章|下一章|返回书页)$/.test(title)) return undefined;
  return title;
}

function normalizeReadTopTitle(raw?: string): string | undefined {
  const title = normalizeTitle(raw);
  if (!title) return undefined;
  const parts = title
    .split(/\s+/)
    .filter(part => part && !Object.values(KNOWN_TITLES).includes(part));
  const candidate = parts.find(part => /第.+章|分节阅读/.test(part)) || parts[0];
  return normalizeTitle(candidate);
}

function extractChapterTitle(html: string): string | undefined {
  const candidates = [
    normalizeReadTopTitle(
      matchOne(/<li[^>]+class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/li>/i, html),
    ),
    matchOne(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html),
    matchOne(/<div[^>]+class="[^"]*(?:title|chapter)[^"]*"[^>]*>([\s\S]*?)<\/div>/i, html),
    matchOne(/<title[^>]*>([\s\S]*?)<\/title>/i, html),
  ];
  return candidates
    .map(candidate =>
      typeof candidate === 'string' ? normalizeTitle(candidate) : candidate,
    )
    .find(Boolean);
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

function isBlockedContent(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return (
    /请在浏览器中打开/.test(text) ||
    /当前环境无法直接下载/.test(text) ||
    /点击右上角.*按钮/.test(text) ||
    /复制链接到浏览器/.test(text) ||
    /Just a moment/i.test(text) ||
    /Enable JavaScript and cookies/i.test(text) ||
    /外围名媛|福利姬|自慰|口交|成人视频|性感女性|访问权限|立即下载/.test(normalized) ||
    /👁️/.test(text)
  );
}

function isInvalidArticleText(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  // WebView 偶尔会命中页面广告卡片而非正文；这类内容短且带成人广告词，
  // 不能写入缓存，否则阅读器会把广告当作章节正文。
  return compact.length < 200 || isBlockedContent(text);
}

function getReadPageUrl(url: string, pageNo: number): string | undefined {
  const match = url.match(/^(.*\/read\/\d+_\d+)(?:_\d+)?\.html(?:[?#].*)?$/);
  if (!match) return undefined;
  return pageNo <= 1 ? `${match[1]}.html` : `${match[1]}_${pageNo}.html`;
}

function getReadPageNo(url: string): number {
  const match = url.match(/\/read\/\d+_\d+_(\d+)\.html(?:[?#].*)?$/);
  return match ? parseInt(match[1], 10) || 1 : 1;
}

function getNextReadPageUrl(url: string, html: string): string | undefined {
  const pageInfo = /第(\d+)\/(\d+)页/.exec(html);
  if (pageInfo) {
    const current = parseInt(pageInfo[1], 10);
    const total = parseInt(pageInfo[2], 10);
    if (Number.isFinite(current) && Number.isFinite(total) && current < total) {
      return getReadPageUrl(url, current + 1);
    }
    return undefined;
  }
  const linkedNext = matchOne(
    /<a[^>]+href="([^"]+)"[^>]*>\s*(?:下一页|下一页继续阅读|点击下一页)[\s\S]*?<\/a>/i,
    html,
  );
  if (linkedNext) return toAbsolute(ORIGIN, linkedNext);
  if (!hasNextPage(html)) return undefined;
  return getReadPageUrl(url, getReadPageNo(url) + 1);
}

async function fetchArticleText(
  url: string,
  options: ParseChapterOptions = {},
): Promise<{ html: string; text: string; usedRenderedText: boolean }> {
  const startedAt = Date.now();
  let html: string;
  let usedRenderedHtml = false;
  try {
    // 正文页先做一次短直连：大多数成功页 1~2 秒能拿到，失败再走 WebView。
    // 这样不会每次点击章节都先占用隐藏 WebView 等完整挑战流程。
    html = await fetchHtml(url, ARTICLE_DIRECT_TIMEOUT_MS);
    console.info('[bookshuku] article html ok', {
      url,
      mode: 'direct',
      ms: Date.now() - startedAt,
      length: html.length,
    });
  } catch (error) {
    console.warn('[bookshuku] article direct failed, fallback WebView', {
      url,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    html = await fetchRenderedHtml(url, {
      timeout: ARTICLE_WEBVIEW_TIMEOUT_MS,
      waitMs: ARTICLE_WEBVIEW_WAIT_MS,
      priority: options.priority ?? 'normal',
    });
    usedRenderedHtml = true;
  }
  let directText = cleanArticle(html);
  if (directText && !isInvalidArticleText(directText)) {
    console.info('[bookshuku] article text ok', {
      url,
      mode: usedRenderedHtml ? 'webview-html' : 'html',
      ms: Date.now() - startedAt,
      length: directText.length,
    });
    return { html, text: directText, usedRenderedText: usedRenderedHtml };
  }
  if (!usedRenderedHtml) {
    try {
      console.warn('[bookshuku] direct html has no valid article, retry WebView html', {
        url,
        ms: Date.now() - startedAt,
        length: html.length,
        challenge: isCloudflareChallenge(html),
      });
      html = await fetchRenderedHtml(url, {
        timeout: ARTICLE_WEBVIEW_TIMEOUT_MS,
        waitMs: ARTICLE_WEBVIEW_WAIT_MS,
        priority: options.priority ?? 'normal',
      });
      usedRenderedHtml = true;
      directText = cleanArticle(html);
      if (directText && !isInvalidArticleText(directText)) {
        console.info('[bookshuku] article text ok', {
          url,
          mode: 'webview-html',
          ms: Date.now() - startedAt,
          length: directText.length,
        });
        return { html, text: directText, usedRenderedText: true };
      }
    } catch (error) {
      console.warn('[bookshuku] article WebView html retry failed', {
        url,
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (directText) {
    console.warn('[bookshuku] article text invalid, fallback WebView text', {
      url,
      mode: usedRenderedHtml ? 'webview-html' : 'html',
      ms: Date.now() - startedAt,
      length: directText.length,
      head: directText.slice(0, 80),
    });
  }
  console.warn('[bookshuku] article text fallback WebView', {
    url,
    ms: Date.now() - startedAt,
  });
  const renderedText = cleanRenderedText(
    await fetchRenderedContent(url, {
      timeout: ARTICLE_TEXT_WEBVIEW_TIMEOUT_MS,
      waitMs: ARTICLE_TEXT_WEBVIEW_WAIT_MS,
      priority: options.priority ?? 'normal',
    }),
  );
  if (isInvalidArticleText(renderedText)) {
    console.warn('[bookshuku] article text blocked page', {
      url,
      ms: Date.now() - startedAt,
      length: renderedText.length,
      head: renderedText.slice(0, 80),
    });
    throw new Error('书源返回无效页面，未拿到章节正文');
  }
  console.info('[bookshuku] article text ok', {
    url,
    mode: 'rendered',
    ms: Date.now() - startedAt,
    length: renderedText.length,
  });
  return { html, text: renderedText, usedRenderedText: true };
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

function normalizeCatalogUrl(url: string, id: string): string {
  if (/\/read\/\d+\.html/i.test(url)) return url;
  return `${ORIGIN}/read/${id}.html`;
}

function buildKnownCatalog(id: string): ParsedChapter[] {
  const total = KNOWN_TOTAL_CHAPTERS[id];
  if (!total) return [];
  return Array.from({ length: total }, (_, index) => ({
    url: `${ORIGIN}/read/${id}_${index + 1}.html`,
    title: `第${index + 1}章`,
  }));
}

function expandWithKnownCatalog(id: string, chapters: ParsedChapter[]): ParsedChapter[] {
  const known = buildKnownCatalog(id);
  if (!known.length || chapters.length >= known.length) return chapters;
  const titleByUrl = new Map(chapters.map(chapter => [chapter.url, chapter.title]));
  // 页面只吐“最新章节”时，不能把 11 条当完整目录；以已知 URL 序列补齐，
  // 命中的真实标题保留，其余用第 N 章占位，打开章节后再按正文页修正标题。
  return known.map(chapter => ({
    ...chapter,
    title: titleByUrl.get(chapter.url) || chapter.title,
  }));
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
    const catalogUrl = normalizeCatalogUrl(info.catalogUrl, info.sourceBookId);
    let html = await fetchBookshukuHtml(catalogUrl);
    let chapters = parseCatalogHtml(html);
    if (chapters.length === 0) chapters = parseCatalogFromScript(html);
    if (chapters.length === 0) {
      // 若拿到的是纯挑战页或脚本未执行完成，再让 WebView 渲染后回传最终 DOM。
      html = await fetchRenderedHtml(catalogUrl);
      chapters = parseCatalogHtml(html);
      if (chapters.length === 0) chapters = parseCatalogFromScript(html);
    }
    chapters = expandWithKnownCatalog(info.sourceBookId, chapters);
    if (chapters.length === 0) throw new Error('未能解析到章节目录');
    return chapters;
  },

  async parseChapterContent(
    url: string,
    options?: ParseChapterOptions,
  ): Promise<ParsedChapterContent> {
    const startedAt = Date.now();
    console.info('[bookshuku] chapter start', { url });
    const firstPage = await fetchArticleText(url, options);
    const pageInfo = /第(\d+)\/(\d+)页/.exec(firstPage.html);
    const currentPage = pageInfo ? parseInt(pageInfo[1], 10) : getReadPageNo(url);
    const totalPages = pageInfo ? parseInt(pageInfo[2], 10) : undefined;
    const nextPageUrl = getNextReadPageUrl(
      url,
      `${firstPage.html}\n${firstPage.text}`,
    );
    console.info('[bookshuku] chapter first page', {
      url,
      currentPage,
      totalPages,
      nextPageUrl,
      rendered: firstPage.usedRenderedText,
      length: firstPage.text.length,
    });

    // 分页章只解析当前子页；下一子页 URL 随章节缓存保存，阅读器翻到章尾时再续拉，
    // 避免一次性抓完整章导致等待过长，且任一子页失败拖垮当前页阅读。
    const content = normalizeChapter([firstPage.text]);
    if (!content) throw new Error('未能解析到章节正文');
    console.info('[bookshuku] chapter done', {
      url,
      ms: Date.now() - startedAt,
      currentPage,
      totalPages,
      nextPageUrl,
      length: content.length,
    });
    return {
      content,
      title: extractChapterTitle(firstPage.html) || inferTitleFromContent(content),
      nextPageUrl,
      complete: !nextPageUrl,
    };
  },
};
