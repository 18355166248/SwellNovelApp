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

import {
  fetchHtml,
  getSourceProxyOrigin,
  getSourceProxyUrl,
} from '../http/fetchHtml';
import {
  cleanRenderedText,
  fetchRenderedContent,
  fetchRenderedHtml,
  fetchWebViewHttpText,
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
const DESKTOP_ORIGIN = 'http://www.bookshuku.org';

// bookshuku 在 Cloudflare/移动页降级时可能只返回最新少量章节；已验证书籍的
// 大致章节量只用于判断“短目录需要重试”，绝不能用来硬补目录，否则 URL 序号
// 会被误当成真实章号（例如 160297_491 实际标题是“第四百五十章”）。
const KNOWN_MIN_CATALOG_COUNTS: Record<string, number> = {
  '160297': 700,
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
const ARTICLE_DIRECT_TIMEOUT_MS = 30000;
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
    /Enable JavaScript and cookies to continue/i.test(html)
  );
}

async function fetchBookshukuHtml(
  url: string,
  options: {
    timeout?: number;
    renderedFallback?: boolean;
    renderedTimeout?: number;
    renderedWaitMs?: number;
    priority?: ParseChapterOptions['priority'];
    preferLocalProxy?: boolean;
    requireLocalProxy?: boolean;
    localProxyRetries?: number;
  } = {},
): Promise<string> {
  const renderedFallback = options.renderedFallback ?? true;
  const startedAt = Date.now();
  try {
    const html = await fetchHtml(url, options.timeout, {
      preferLocalProxy: options.preferLocalProxy,
      requireLocalProxy: options.requireLocalProxy,
      localProxyRetries: options.localProxyRetries,
    });
    if (!html.trim()) {
      throw new Error('empty html');
    }
    if (isCloudflareChallenge(html)) {
      if (!renderedFallback) return html;
      console.info('[bookshuku] fetch html got challenge, fallback WebView', {
        url,
        ms: Date.now() - startedAt,
        length: html.length,
      });
      const renderedHtml = await fetchRenderedHtml(url, {
        timeout: options.renderedTimeout,
        waitMs: options.renderedWaitMs,
        priority: options.priority,
      });
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
    if (options.requireLocalProxy) {
      // bookshuku 的 WebView/原生直连会稳定返回分页短目录；既然调用方声明必须走
      // curl 代理，代理失败就直接抛错，避免继续用 WebView 结果污染入库目录。
      console.info('[bookshuku] required source proxy failed', {
        url,
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    // 原生 fetch 可能被站点 403、ATS 或网络层拒绝，下面统一走 WebView 兜底。
    // 注意：bookshuku 的正常页面底部也会带 Cloudflare 脚本，不能只凭脚本特征丢弃 HTML。
    console.info('[bookshuku] fetch html fallback WebView', {
      url,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!renderedFallback) throw error;
    const html = await fetchRenderedHtml(url, {
      timeout: options.renderedTimeout,
      waitMs: options.renderedWaitMs,
      priority: options.priority,
    });
    console.info('[bookshuku] WebView html ok', {
      url,
      ms: Date.now() - startedAt,
      length: html.length,
    });
    return html;
  }
}

async function fetchBookshukuProxyRenderedHtml(
  url: string,
  options: {
    timeout?: number;
    waitMs?: number;
    priority?: ParseChapterOptions['priority'];
  } = {},
): Promise<string> {
  const proxyUrl = getSourceProxyUrl(url);
  if (!proxyUrl) throw new Error('source proxy url unavailable');
  // iOS 真机上 RN fetch 对明文 IP:端口可能直接 Network request failed；
  // 先让 WebView 打开同源代理首页，再在页面内 fetch /proxy，复用 WKWebView
  // 对该地址的可达性，同时避免把大 HTML 当主文档导航导致 onHttpError 误杀任务。
  return fetchWebViewHttpText(proxyUrl, getSourceProxyOrigin(), {
    timeout: options.timeout ?? 45000,
    waitMs: options.waitMs ?? 500,
    priority: options.priority ?? 'high',
  });
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
    html = await fetchHtml(url, ARTICLE_DIRECT_TIMEOUT_MS, {
      preferLocalProxy: true,
      requireLocalProxy: true,
      localProxyRetries: 2,
    });
    console.info('[bookshuku] article html ok', {
      url,
      mode: 'direct',
      ms: Date.now() - startedAt,
      length: html.length,
    });
  } catch (error) {
    console.info('[bookshuku] article direct failed, fallback WebView', {
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
      console.info('[bookshuku] direct html has no valid article, retry WebView html', {
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
      console.info('[bookshuku] article WebView html retry failed', {
        url,
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (directText) {
    console.info('[bookshuku] article text invalid, fallback WebView text', {
      url,
      mode: usedRenderedHtml ? 'webview-html' : 'html',
      ms: Date.now() - startedAt,
      length: directText.length,
      head: directText.slice(0, 80),
    });
  }
  console.info('[bookshuku] article text fallback WebView', {
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

function normalizeCatalogChapterTitle(raw: string, bookTitle?: string): string {
  let title = decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
  if (bookTitle) {
    const escaped = bookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`^${escaped}\\s+`), '').trim();
  }
  return title;
}

function normalizeReadUrl(raw: string): string {
  const absolute = toAbsolute(ORIGIN, raw);
  const path = /\/read\/(\d+_\d+(?:_\d+)?)\.html/i.exec(absolute)?.[1];
  return path ? `${ORIGIN}/read/${path}.html` : absolute;
}

function parseCatalogHtml(html: string, bookTitle?: string): ParsedChapter[] {
  const re = /<a[^>]+href=["']([^"']*\/read\/\d+_\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/g;
  const chapters: ParsedChapter[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = normalizeReadUrl(m[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    chapters.push({
      url,
      title: normalizeCatalogChapterTitle(m[2], bookTitle),
    });
  }
  return chapters;
}

function isSyntheticSplitTitle(title: string): boolean {
  return /^分节阅读\s*\d+$/i.test(title.replace(/\s+/g, ' ').trim());
}

function hasBadCatalogTitles(chapters: ParsedChapter[]): boolean {
  return chapters.some(chapter => isSyntheticSplitTitle(chapter.title));
}

function getBadCatalogTitle(chapters: ParsedChapter[]): string | undefined {
  return chapters.find(chapter => isSyntheticSplitTitle(chapter.title))?.title;
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

function isSuspiciousPartialCatalog(
  id: string,
  chapters: ParsedChapter[],
): boolean {
  const min = KNOWN_MIN_CATALOG_COUNTS[id];
  return !!min && chapters.length > 0 && chapters.length < min;
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
    let html = '';
    try {
      // 添加书籍的关键路径先走短直连：详情页被拦时不要立刻等 WebView，
      // 目录页通常也能解析出书名，避免用户在弹窗里卡到“WebView 取页面超时”。
      html = await fetchBookshukuHtml(detailUrl, {
        timeout: 8000,
        renderedFallback: false,
        preferLocalProxy: true,
        requireLocalProxy: true,
        localProxyRetries: 2,
      });
    } catch (error) {
      console.warn('[bookshuku] detail proxy fetch failed, try proxy WebView', {
        url: detailUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        html = await fetchBookshukuProxyRenderedHtml(detailUrl, {
          timeout: 12000,
          waitMs: 1000,
          priority: 'high',
        });
      } catch (proxyWebViewError) {
        console.warn('[bookshuku] detail proxy WebView failed, try catalog title', {
          url: detailUrl,
          error:
            proxyWebViewError instanceof Error
              ? proxyWebViewError.message
              : String(proxyWebViewError),
        });
      }
    }

    let title =
      matchOne(/<div class="detail">[\s\S]*?<b>([\s\S]*?)<\/b>/, html)?.trim() ||
      matchOne(/<meta name="keywords" content="([^",]+)/, html)?.trim();
    if (!title) {
      try {
        // 详情页更容易触发挑战；目录页通常能直接返回，并且 path/title/meta 都带书名。
        const catalogHtml = await fetchBookshukuHtml(`${ORIGIN}/read/${id}.html`, {
          timeout: 8000,
          renderedFallback: false,
          preferLocalProxy: true,
          requireLocalProxy: true,
          localProxyRetries: 2,
        });
        title = parseTitleFromCatalogHtml(catalogHtml, id);
      } catch (error) {
        console.warn('[bookshuku] catalog title proxy fetch failed', {
          url: `${ORIGIN}/read/${id}.html`,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          const catalogHtml = await fetchBookshukuProxyRenderedHtml(
            `${ORIGIN}/read/${id}.html`,
            {
              timeout: 12000,
              waitMs: 1000,
              priority: 'high',
            },
          );
          title = parseTitleFromCatalogHtml(catalogHtml, id);
        } catch (proxyWebViewError) {
          console.warn('[bookshuku] catalog title proxy WebView failed', {
            url: `${ORIGIN}/read/${id}.html`,
            error:
              proxyWebViewError instanceof Error
                ? proxyWebViewError.message
                : String(proxyWebViewError),
          });
        }
      }
    }
    if (!title) {
      try {
        // 最后一层才走 WebView 取详情 DOM，并且给较短超时；失败后仍可落到已知书名兜底。
        html = await fetchRenderedHtml(detailUrl, {
          timeout: 15000,
          waitMs: 5000,
          priority: 'high',
        });
        title =
          matchOne(/<div class="detail">[\s\S]*?<b>([\s\S]*?)<\/b>/, html)?.trim() ||
          matchOne(/<meta name="keywords" content="([^",]+)/, html)?.trim();
      } catch (error) {
        console.warn('[bookshuku] detail WebView title failed', {
          url: detailUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
    const sourceBookId = info.sourceBookId || extractBookId(info.catalogUrl) || '';
    const catalogUrl = normalizeCatalogUrl(info.catalogUrl, sourceBookId);
    const debug: string[] = [];
    let html = '';
    try {
      html = await fetchBookshukuHtml(catalogUrl, {
        timeout: 45000,
        preferLocalProxy: true,
        requireLocalProxy: true,
        localProxyRetries: 2,
      });
      debug.push(`proxyWapHtml=${html.length}`);
    } catch (error) {
      debug.push(
        `proxyWapError=${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        html = await fetchBookshukuProxyRenderedHtml(catalogUrl, {
          timeout: 45000,
          waitMs: 1000,
          priority: 'high',
        });
        debug.push(`proxyWebViewWapHtml=${html.length}`);
      } catch (proxyWebViewError) {
        debug.push(
          `proxyWebViewWapError=${
            proxyWebViewError instanceof Error
              ? proxyWebViewError.message
              : String(proxyWebViewError)
          }`,
        );
      }
      // 真机蜂窝网络可能无法访问自建代理的 11008 端口；这时允许最后尝试书源直连，
      // 但后续仍用完整性校验兜底，短目录不会被写入本地缓存。
      if (!html) {
        try {
          html = await fetchBookshukuHtml(catalogUrl, {
            timeout: 45000,
            renderedFallback: false,
          });
          debug.push(`directWapHtml=${html.length}`);
        } catch (directError) {
          debug.push(
            `directWapError=${
              directError instanceof Error
                ? directError.message
                : String(directError)
            }`,
          );
        }
      }
    }
    // wap 直连偶发拿到超大 HTML 却解析不到目录（疑似运营商对明文 HTTP 注入）；
    // 打印开头与“是否仍含 /read 链接”，区分是内容被替换还是仅正则未命中。
    debug.push(`wapHead=${html.slice(0, 100).replace(/\s+/g, ' ')}`);
    debug.push(`wapHasRead=${/\/read\/\d+_\d+\.html/.test(html)}`);
    let chapters = parseCatalogHtml(html, info.title);
    debug.push(`wapParsed=${chapters.length}`);
    if (
      chapters.length === 0 ||
      isSuspiciousPartialCatalog(sourceBookId, chapters) ||
      hasBadCatalogTitles(chapters)
    ) {
      try {
        // bookshuku 偶发把 wap 目录请求降级成空页/短目录；目录是入库关键数据，
        // 先用同一 URL 再拉一次代理结果，避免一次上游抖动就落到 WebView 超时。
        const retryHtml = await fetchBookshukuHtml(catalogUrl, {
          timeout: 45000,
          renderedFallback: false,
          preferLocalProxy: true,
          requireLocalProxy: true,
          localProxyRetries: 2,
        });
        debug.push(`wapRetryHtml=${retryHtml.length}`);
        const retryChapters = parseCatalogHtml(retryHtml, info.title);
        debug.push(`wapRetryParsed=${retryChapters.length}`);
        if (
          retryChapters.length > chapters.length &&
          !hasBadCatalogTitles(retryChapters)
        ) {
          chapters = retryChapters;
        }
      } catch (error) {
        console.info('[bookshuku] wap catalog retry failed', {
          url: catalogUrl,
          directCount: chapters.length,
          error: error instanceof Error ? error.message : String(error),
        });
        debug.push(
          `wapRetryError=${error instanceof Error ? error.message : String(error)}`,
        );
        try {
          const retryHtml = await fetchBookshukuProxyRenderedHtml(catalogUrl, {
            timeout: 45000,
            waitMs: 1000,
            priority: 'high',
          });
          debug.push(`wapRetryWebViewHtml=${retryHtml.length}`);
          const retryChapters = parseCatalogHtml(retryHtml, info.title);
          debug.push(`wapRetryWebViewParsed=${retryChapters.length}`);
          if (
            retryChapters.length > chapters.length &&
            !hasBadCatalogTitles(retryChapters)
          ) {
            chapters = retryChapters;
          }
        } catch (proxyWebViewError) {
          debug.push(
            `wapRetryWebViewError=${
              proxyWebViewError instanceof Error
                ? proxyWebViewError.message
                : String(proxyWebViewError)
            }`,
          );
        }
      }
      const desktopUrl = `${DESKTOP_ORIGIN}/read/${sourceBookId}.html`;
      try {
        // iOS 模拟器/代理环境下 wap 目录可能返回不完整 DOM；桌面域名同源同书，
        // curl 与真机自测都更稳定。先走它，成功后避免再等待 WebView。
        const desktopHtml = await fetchBookshukuHtml(desktopUrl, {
          timeout: 45000,
          renderedFallback: false,
          preferLocalProxy: true,
          requireLocalProxy: true,
          localProxyRetries: 2,
        });
        debug.push(`desktopHtml=${desktopHtml.length}`);
        debug.push(`desktopHead=${desktopHtml.slice(0, 80).replace(/\s+/g, ' ')}`);
        const desktopChapters = parseCatalogHtml(desktopHtml, info.title);
        debug.push(`desktopParsed=${desktopChapters.length}`);
        if (
          desktopChapters.length > chapters.length &&
          !hasBadCatalogTitles(desktopChapters)
        ) {
          chapters = desktopChapters;
        }
      } catch (error) {
        console.info('[bookshuku] desktop catalog fallback failed', {
          url: `${DESKTOP_ORIGIN}/read/${sourceBookId}.html`,
          directCount: chapters.length,
          error: error instanceof Error ? error.message : String(error),
        });
        debug.push(
          `desktopError=${error instanceof Error ? error.message : String(error)}`,
        );
        try {
          const desktopHtml = await fetchBookshukuProxyRenderedHtml(desktopUrl, {
            timeout: 45000,
            waitMs: 1000,
            priority: 'high',
          });
          debug.push(`desktopWebViewHtml=${desktopHtml.length}`);
          const desktopChapters = parseCatalogHtml(desktopHtml, info.title);
          debug.push(`desktopWebViewParsed=${desktopChapters.length}`);
          if (
            desktopChapters.length > chapters.length &&
            !hasBadCatalogTitles(desktopChapters)
          ) {
            chapters = desktopChapters;
          }
        } catch (proxyWebViewError) {
          debug.push(
            `desktopWebViewError=${
              proxyWebViewError instanceof Error
                ? proxyWebViewError.message
                : String(proxyWebViewError)
            }`,
          );
        }
      }
    }
    if (chapters.length === 0) {
      throw new Error(`未能解析到章节目录（${debug.join(', ')}）`);
    }
    if (
      isSuspiciousPartialCatalog(sourceBookId, chapters) ||
      hasBadCatalogTitles(chapters)
    ) {
      // 目录是书籍入库的基础数据，宁可提示重试，也不能把“分节阅读 11”
      // 这类站点分页占位写进本地缓存，后续会污染详情页和阅读入口。
      const badTitle = getBadCatalogTitle(chapters);
      const reason = [
        `count=${chapters.length}`,
        badTitle ? `badTitle=${badTitle}` : undefined,
        `first=${chapters[0]?.title || ''}`,
        `ch496=${chapters[495]?.title || ''}`,
      ]
        .filter(Boolean)
        .join(', ');
      const detail =
        typeof __DEV__ !== 'undefined' && __DEV__
          ? `（${reason}; ${debug.join(', ')}）`
          : '';
      throw new Error(`目录解析不完整，请检查网络后重试${detail}`);
    }
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

    const parts = [firstPage.text];
    let cursor = nextPageUrl;
    let guard = 0;
    while (cursor && guard < 20) {
      guard += 1;
      const nextPage = await fetchArticleText(cursor, options);
      parts.push(nextPage.text);
      cursor = getNextReadPageUrl(cursor, `${nextPage.html}\n${nextPage.text}`);
    }
    const content = normalizeChapter(parts);
    if (!content) throw new Error('未能解析到章节正文');
    console.info('[bookshuku] chapter done', {
      url,
      ms: Date.now() - startedAt,
      currentPage,
      totalPages,
      nextPageUrl: cursor,
      length: content.length,
    });
    return {
      content,
      title: extractChapterTitle(firstPage.html) || inferTitleFromContent(content),
      nextPageUrl: cursor,
      complete: !cursor,
    };
  },
};
