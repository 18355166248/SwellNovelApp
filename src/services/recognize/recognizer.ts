/**
 * 网页小说识别器：在内置浏览器（WebView）里读**已渲染的 DOM**，把当前页面识别成
 * 书籍详情/目录，提取书名、作者、封面、章节列表。
 *
 * 与传统书源（RN 内 fetch HTML + 正则）不同：这里的脚本注入到页面内运行，读的是
 * 浏览器渲染后的结果，因此天然规避 CORS、Cloudflare JS 挑战、以及 JS 动态渲染。
 * 通用启发式：命中一批“第N章”式锚点即判为目录页；不依赖具体站点结构，未知站也能认。
 */
import {
  findDivBlock,
  removeNonContentElements,
} from '../source/htmlContainers';
export interface RecognizedChapter {
  title: string;
  url: string;
}

export interface RecognizedBook {
  ok: boolean;
  isDetail: boolean;
  url: string;
  host: string;
  title?: string;
  author?: string;
  cover?: string;
  chapters: RecognizedChapter[];
  /** 当前目录页发现的其他分页链接（不含当前页），加入时由 WebView 聚合。 */
  pageUrls?: string[];
  error?: string;
}

/** postMessage 的消息类型标识，供 WebView onMessage 分辨。 */
export const RECOGNIZE_MESSAGE = 'nvl-recognize';

/** 判定为目录页所需的最小章节锚点数，低于此认为不是书籍页。 */
export const MIN_CHAPTERS = 5;
const MAX_CATALOG_PAGES = 200;

// 已知站点优先按同书正文路由识别，不能只靠“第N章”漏掉感言，也不能收进推荐区其他书。
const CATALOG_ROUTES: {
  host: string;
  book: string;
  chapter: string;
}[] = [
  {
    host: '(^|\\.)bookshuku\\.org$',
    book: '/(?:bookinfo|read)/(\\d+)',
    chapter: '^/read/(\\d+)_(\\d+)\\.html$',
  },
  {
    host: '(^|\\.)mingzw\\.net$',
    book: '/(?:mibook|mzwbook|mclist|mzwchapter)/(\\d+)',
    chapter: '^/(?:miread|mzwread)/(?:[^/]*_)?(\\d+)_(\\d+)\\.html$',
  },
  {
    host: '(^|\\.)bqquge\\.org$',
    book: '^/(\\d+)(?:/|$)',
    chapter: '^/(\\d+)/(\\d+)/?$',
  },
];
const MAX_CHAPTER_TITLE_LENGTH = 200;
const NAV_TITLE_RE =
  /^(?:目录|目錄|首页|首頁|上一[章页頁]|下一[章页頁]|返回书页|返回書頁)$/;

/**
 * 注入页面执行的识别脚本（纯字符串，DOM-only）。结果经 window.ReactNativeWebView
 * .postMessage 回传。末尾的 `true;` 是 iOS injectedJavaScript 的要求。
 * 模板字符串中的正则反斜杠需要双写；TS 编译不会检查生成脚本的语法，须运行注入脚本测试。
 */
export const RECOGNIZER_JS = `(function(){
  var requestId = window.__nvlRecognizeRequestId || '';
  var useLocationCallback = window.__nvlRecognizeUseLocation === true;
  try { delete window.__nvlRecognizeRequestId; } catch(ignore) { window.__nvlRecognizeRequestId = ''; }
  try { delete window.__nvlRecognizeUseLocation; } catch(ignore) { window.__nvlRecognizeUseLocation = false; }
  function post(payload){
    var message = JSON.stringify(payload);
    // 手动识别使用应用拦截的自定义 URL 回传。即便站点覆盖消息对象，只要页面脚本可执行，
    // 原生 onShouldStartLoadWithRequest 仍能收到这份目录数据并阻止离开当前页。
    if (useLocationCallback) {
      try {
        window.location.href = 'nvl-recognize://result?data=' + encodeURIComponent(message);
        return;
      } catch(ignore) {}
    }
    // 广告站可能篡改 window.ReactNativeWebView；iOS 直接走 WKWebView handler，
    // 确保目录提取脚本仍能回传 React Native。
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView) {
        window.webkit.messageHandlers.ReactNativeWebView.postMessage(message);
        return;
      }
    } catch(ignore) {}
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(message);
      }
    } catch(ignore) {}
  }
  try {
    var reChap = /第\\s*[0-9零一二三四五六七八九十百千两]+\\s*[章节回卷]/;
    var catalogRoutes = ${JSON.stringify(CATALOG_ROUTES)};
    var navTitle = new RegExp(${JSON.stringify(NAV_TITLE_RE.source)});
    function chapterIdentity(href, title) {
      if (!title || title.length > ${MAX_CHAPTER_TITLE_LENGTH} || navTitle.test(title)) return '';
      try {
        var base = new URL(location.href), target = new URL(href, location.href);
        if (!/^https?:$/.test(target.protocol)) return '';
        for (var r = 0; r < catalogRoutes.length; r++) {
          var rule = catalogRoutes[r], host = new RegExp(rule.host, 'i');
          if (!host.test(base.hostname)) continue;
          var book = new RegExp(rule.book, 'i').exec(base.pathname);
          // 首页/搜索结果没有当前书号，不能退回按章名拼出一本推荐区假书。
          if (!book) return '';
          var chapter = new RegExp(rule.chapter, 'i').exec(target.pathname);
          return host.test(target.hostname) && chapter && chapter[1] === book[1] ? rule.host + ':' + book[1] + ':' + chapter[2] : '';
        }
        return reChap.test(title) ? target.href : '';
      } catch(ignore) { return ''; }
    }
    var seen = {}, chapters = [], pageSeen = {}, pageUrls = [];
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var t = (a.textContent || '').replace(/\\s+/g, ' ').trim();
      var href = a.href;
      var identity = href && chapterIdentity(href, t);
      if (!identity || seen[identity]) continue;
      seen[identity] = 1;
      chapters.push({ title: t, url: href });
    }
    // 常见小说站把目录拆成“1 2 3 … 下一页”形式。先定位“下一页”所在的分页栏，
    // 再只取同一栏内的页码，避免把页面其它位置的广告/推荐数字链接误当目录页。
    function pagerText(v){ return /^[0-9]{1,3}$/.test(v) || /^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(v); }
    var pagerRoot = null;
    for (var n = 0; n < as.length && !pagerRoot; n++) {
      var nt = (as[n].textContent || '').replace(/\\s+/g, ' ').trim();
      if (!/^(下一页|下页|尾页|末页)$/.test(nt)) continue;
      var parent = as[n].parentElement, depth = 0;
      while (parent && depth < 5) {
        var links = parent.querySelectorAll('a[href]'), candidates = 0;
        for (var q = 0; q < links.length; q++) {
          var qt = (links[q].textContent || '').replace(/\\s+/g, ' ').trim();
          if (pagerText(qt)) candidates++;
        }
        if (candidates >= 2) { pagerRoot = parent; break; }
        parent = parent.parentElement; depth++;
      }
    }
    // 即使分页栏缺少独立容器、祖先节点退化成整页，也只能接受当前目录 URL
    // 同路径（query 翻页）或同书号前缀（/book-12-2.html）的链接，排除顶部“首页”。
    function relatedPagerLink(href){
      try {
        var target = new URL(href, location.href);
        var basePath = location.pathname.replace(/\\/$/, '');
        var path = target.pathname.replace(/\\/$/, '');
        return target.host === location.host && (
          path === basePath ||
          path.indexOf(basePath + '-') === 0 ||
          path.indexOf(basePath + '_') === 0 ||
          path.indexOf(basePath + '/') === 0
        );
      } catch(e) { return false; }
    }
    var pagerLinks = pagerRoot ? pagerRoot.querySelectorAll('a[href]') : [];
    for (var p = 0; p < pagerLinks.length; p++) {
      var pa = pagerLinks[p];
      var pt = (pa.textContent || '').replace(/\\s+/g, ' ').trim();
      var ph = pa.href;
      if (!ph || ph === location.href || pageSeen[ph] || !pagerText(pt) || !relatedPagerLink(ph)) continue;
      pageSeen[ph] = 1;
      pageUrls.push(ph);
    }
    // 部分站点仅渲染“下一页/尾页”，但会在文案中给出总页数（第 1/27 页）。
    // 从这两个分页链接的 URL 模板补齐中间页，避免只导入第一页或末页。
    var pageText = document.body ? (document.body.innerText || '') : '';
    var pageInfo = pageText.match(/第\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*页/);
    var currentPage = pageInfo ? parseInt(pageInfo[1], 10) : 0;
    var totalPages = pageInfo ? parseInt(pageInfo[2], 10) : 0;
    // 已声明多页却超出处理范围时不能把当前页当完整目录交给入库。
    if (pageInfo && (currentPage < 1 || currentPage > totalPages || totalPages > ${MAX_CATALOG_PAGES})) {
      throw new Error('目录页数异常或超过支持上限，无法确认完整目录');
    }
    var templateLink = null;
    for (var r = 0; r < as.length; r++) {
      var rt = (as[r].textContent || '').replace(/\\s+/g, ' ').trim();
      if (!/^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(rt) || !as[r].href) continue;
      try {
        var ru = new URL(as[r].href, location.href);
        var rm = /^(.*[_-])(\\d+)(\\/?)$/.exec(ru.pathname);
        // “首页”的目录路径也以书号数字结尾，不能把书号误当页码。
        // 模板必须属于当前目录，且链接页码落在页面声明的范围内。
        var basePath = location.pathname.replace(/\\/$/, '');
        if (ru.host === location.host && rm && Number(rm[2]) >= 1 && Number(rm[2]) <= totalPages &&
          (basePath === rm[1].slice(0, -1) || basePath === rm[1] + currentPage)) {
          templateLink = { origin: ru.origin, prefix: rm[1], suffix: rm[3] }; break;
        }
      } catch(ignore) {}
    }
    if (totalPages > 1 && !templateLink) {
      throw new Error('未找到有效的目录分页链接，无法确认完整目录');
    }
    if (templateLink && totalPages > 1 && totalPages <= ${MAX_CATALOG_PAGES}) {
      // 明确知道总页数时按页码重新生成，不能把先遇到的尾页排在第二页之后。
      pageUrls = []; pageSeen = {};
      for (var pn = 1; pn <= totalPages; pn++) {
        var generated = templateLink.origin + templateLink.prefix + pn + templateLink.suffix;
        if (pn === currentPage || generated === location.href || pageSeen[generated]) continue;
        pageSeen[generated] = 1;
        pageUrls.push(generated);
      }
    }
    function meta(sel){ var m = document.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; }
    var title = meta('meta[property="og:novel:book_name"]') || meta('meta[property="og:title"]');
    // 明智屋当前 h1 是站点 Logo；网页导入也必须读取 novel-name，封面限定本书编号。
    var mingBook = /(^|\\.)mingzw\\.net$/i.test(location.hostname) && /\\/(?:mibook|mzwbook|mclist|mzwchapter)\\/(\\d+)/.exec(location.pathname);
    if (!title && mingBook) { var novelName = document.querySelector('.novel-name'); title = novelName ? (novelName.textContent || '').trim().replace(/^《(.+)》$/, '$1') : ''; }
    if (!title) { var h = document.querySelector('h1'); title = h ? (h.textContent || '').trim() : ''; }
    if (!title) title = (document.title || '').split(/[-_|]/)[0].trim();
    var author = meta('meta[property="og:novel:author"]') || meta('meta[name="author"]');
    if (!author && mingBook) { var authorLink = document.querySelector('a[title^="作者:"]') || document.querySelector('a[title^="作者："]'); author = authorLink ? (authorLink.textContent || '').trim() : ''; }
    if (!author && mingBook) { var labels = document.querySelectorAll('dt'); for (var ai = 0; ai < labels.length; ai++) { if (/^作者\\s*[：:]?$/.test((labels[ai].textContent || '').trim()) && labels[ai].nextElementSibling) { author = (labels[ai].nextElementSibling.textContent || '').trim(); break; } } }
    if (!author) { var bt = document.body.innerText || ''; var am = bt.match(/作者[：:\\s]*([^\\n\\r，,。]{1,20})/); author = am ? am[1].trim() : ''; }
    var cover = meta('meta[property="og:image"]');
    if (!cover && mingBook) { var bookImage = document.querySelector('img[src*="/images/mzwid/' + mingBook[1] + '."]'); cover = bookImage ? bookImage.getAttribute('src') : ''; }
    // 笔趣阁、书库不一定提供 og:image，只读取明确封面容器，不能取整页第一张广告/Logo。
    if (!cover) { var coverImage = document.querySelector('.bookdetail > img') || document.querySelector('.cover > img') || document.querySelector('.book-cover > img') || document.querySelector('#fmimg > img'); cover = coverImage ? (coverImage.getAttribute('data-src') || coverImage.getAttribute('src') || '') : ''; }
    try { var coverUrl = cover ? new URL(cover, location.href) : null; cover = coverUrl && /^https?:$/.test(coverUrl.protocol) ? coverUrl.href : ''; } catch(ignore) { cover = ''; }
    var payload = {
      type: '${RECOGNIZE_MESSAGE}', ok: true,
      isDetail: chapters.length >= ${MIN_CHAPTERS},
      url: location.href, host: location.host,
      requestId: requestId,
      title: title, author: author, cover: cover,
      chapters: chapters.slice(0, 5000), pageUrls: pageUrls.slice(0, ${MAX_CATALOG_PAGES})
    };
    post(payload);
  } catch (e) {
    post({ type: '${RECOGNIZE_MESSAGE}', requestId: requestId, ok: false, error: String(e), chapters: [] });
  }
})(); true;`;

const CHAPTER_TITLE_RE = /第\s*[0-9零一二三四五六七八九十百千两]+\s*[章节回卷]/;

// 章节号是已知站点的稳定身份；镜像域名和 miread/mzwread 别名不能生成重复目录项。
function catalogChapterIdentity(
  baseUrl: string,
  url: string,
  title: string,
): string {
  if (
    !title ||
    title.length > MAX_CHAPTER_TITLE_LENGTH ||
    NAV_TITLE_RE.test(title)
  )
    return '';
  try {
    const base = new URL(baseUrl);
    const target = new URL(url);
    for (const rule of CATALOG_ROUTES) {
      const host = new RegExp(rule.host, 'i');
      if (!host.test(base.hostname)) continue;
      const book = new RegExp(rule.book, 'i').exec(base.pathname);
      // 首页/搜索结果没有当前书号，不能混入推荐区的章节。
      if (!book) return '';
      const chapter = new RegExp(rule.chapter, 'i').exec(target.pathname);
      return host.test(target.hostname) && chapter && chapter[1] === book[1]
        ? `${rule.host}:${book[1]}:${chapter[2]}`
        : '';
    }
    return CHAPTER_TITLE_RE.test(title) ? target.href : '';
  } catch {
    return '';
  }
}

function resolveHref(base: string, href: string): string {
  try {
    // 标准 URL 解析覆盖 ../、?page= 和 HTML 实体，手工拼目录会生成失效章节地址。
    const target = new URL(href.trim().replace(/&amp;/gi, '&'), base);
    return /^https?:$/.test(target.protocol) ? target.href : '';
  } catch {
    return '';
  }
}

/** 从 WebView 回传的单个目录页 HTML 提取章节，供分页目录聚合使用。 */
export function parseRecognizedChaptersHtml(
  html: string,
  baseUrl: string,
): RecognizedChapter[] {
  const chapters: RecognizedChapter[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  // HTML 兜底应与真实 DOM 一致，脚本字符串或注释中的伪锚点不属于目录。
  const cleanHtml = removeNonContentElements(html);
  while ((match = re.exec(cleanHtml)) !== null) {
    const title = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    const url = resolveHref(baseUrl, match[1]);
    const identity = url && catalogChapterIdentity(baseUrl, url, title);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    chapters.push({ title, url });
  }
  return chapters;
}

/** 从目录 HTML 的“第 N/总页数 页”和翻页 URL 模板补齐所有分页地址。 */
export function parseRecognizedPageUrlsHtml(
  html: string,
  baseUrl: string,
): string[] {
  const anchors = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const cleanHtml = removeNonContentElements(html);
  const pageInfo = /第\s*(\d+)\s*\/\s*(\d+)\s*页/.exec(
    cleanHtml.replace(/<[^>]+>/g, ' '),
  );
  const currentPage = Number(pageInfo?.[1] || 1);
  const totalPages = Number(pageInfo?.[2] || 0);
  if (
    pageInfo &&
    (currentPage < 1 ||
      currentPage > totalPages ||
      totalPages > MAX_CATALOG_PAGES)
  ) {
    throw new Error('目录页数异常或超过支持上限，无法确认完整目录');
  }
  if (!Number.isInteger(totalPages) || totalPages <= 1) return [];

  let template: { origin: string; prefix: string; suffix: string } | null =
    null;
  let match: RegExpExecArray | null;
  while ((match = anchors.exec(cleanHtml)) !== null) {
    const text = htmlText(match[2]);
    if (!/^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(text)) continue;
    try {
      const base = new URL(baseUrl);
      const target = new URL(resolveHref(baseUrl, match[1]));
      if (target.origin !== base.origin) continue;
      const pathMatch = /^(.*[_-])(\d+)(\/?)$/.exec(target.pathname);
      // 仅从当前目录的有效分页取模板，避免首页书号或其他书的“下一页”污染整本目录。
      const basePath = base.pathname.replace(/\/$/, '');
      if (
        pathMatch &&
        Number(pathMatch[2]) >= 1 &&
        Number(pathMatch[2]) <= totalPages &&
        (basePath === pathMatch[1].slice(0, -1) ||
          basePath === pathMatch[1] + currentPage)
      ) {
        template = {
          origin: target.origin,
          prefix: pathMatch[1],
          suffix: pathMatch[3],
        };
        break;
      }
    } catch {
      // 非标准 href 无法作为分页模板。
    }
  }
  // 站点声明了多页但无法可靠定位分页时，拒绝发布残目录，交给界面显示可重试失败。
  if (!template) {
    throw new Error('未找到有效的目录分页链接，无法确认完整目录');
  }
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(page => page !== currentPage)
    .map(
      page =>
        `${template!.origin}${template!.prefix}${page}${template!.suffix}`,
    );
}

function htmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlMeta(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    'i',
  );
  return htmlText(re.exec(html)?.[1] || '');
}

/**
 * 当前可见 WebView 未回传识别消息时，改由常驻隐藏 WebView 取到的 HTML 解析目录。
 * 这条兜底链路避开部分广告站阻断顶层 WebView postMessage 的兼容性问题。
 */
export function recognizeBookHtml(html: string, url: string): RecognizedBook {
  const chapters = parseRecognizedChaptersHtml(html, url);
  let host = '';
  let mingBookId = '';
  try {
    const parsed = new URL(url);
    host = parsed.host;
    if (/(^|\.)mingzw\.net$/i.test(parsed.hostname))
      mingBookId =
        /\/(?:mibook|mzwbook|mclist|mzwchapter)\/(\d+)/.exec(
          parsed.pathname,
        )?.[1] || '';
  } catch {
    // URL 已由地址栏校验；此处仅为兜底，目录仍可按相对地址解析。
  }
  // 与 DOM 注入路径保持一致，避免隐藏 WebView 回退后把站名、Logo 当成书籍信息。
  const mingTitle = mingBookId
    ? htmlText(
        /<[^>]+class=["'][^"']*\bnovel-name\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(
          html,
        )?.[1] || '',
      ).replace(/^《(.+)》$/, '$1')
    : '';
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '';
  const title =
    htmlMeta(html, 'og:novel:book_name') ||
    htmlMeta(html, 'og:title') ||
    mingTitle ||
    htmlText(h1) ||
    htmlText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
      .split(/[-_|]/)[0]
      .trim();
  const author =
    htmlMeta(html, 'og:novel:author') ||
    htmlMeta(html, 'author') ||
    (mingBookId
      ? htmlText(
          /作者\s*[：:]\s*(?:<[^>]+>\s*)*<a[^>]*>([^<]+)<\/a>/.exec(
            html,
          )?.[1] || '',
        )
      : '') ||
    htmlText(/作者[：:\s]*([^<\n\r，,。]{1,20})/i.exec(html)?.[1] || '');
  const mingCover = mingBookId
    ? new RegExp(
        `<img[^>]+src=["']([^"']*/images/mzwid/${mingBookId}\\.[^"']+)["']`,
        'i',
      ).exec(html)?.[1]
    : '';
  // 与可见网页采用相同的容器优先级；先去脚本，避免广告字符串伪装成封面节点。
  const cleanHtml = removeNonContentElements(html);
  const coverBlocks = [
    findDivBlock(cleanHtml, 'class', 'bookdetail'),
    findDivBlock(cleanHtml, 'class', 'cover'),
    findDivBlock(cleanHtml, 'class', 'book-cover'),
    findDivBlock(cleanHtml, 'id', 'fmimg'),
  ];
  const containerCover = coverBlocks
    .map(block => {
      const image = /<img\b[^>]*>/i.exec(block?.inner || '')?.[0] || '';
      return htmlText(
        /\bdata-src\s*=\s*["']([^"']+)["']/i.exec(image)?.[1] ||
          /\bsrc\s*=\s*["']([^"']+)["']/i.exec(image)?.[1] ||
          '',
      );
    })
    .find(Boolean);
  const rawCover = htmlMeta(html, 'og:image') || mingCover || containerCover;
  let cover = '';
  try {
    const coverUrl = rawCover ? new URL(rawCover, url) : null;
    if (coverUrl && /^https?:$/.test(coverUrl.protocol)) cover = coverUrl.href;
  } catch {
    // 坏封面地址不能导致整本书识别失败，展示组件会退回定制封面。
  }
  return {
    ok: true,
    isDetail: chapters.length >= MIN_CHAPTERS,
    url,
    host,
    title,
    author,
    cover,
    chapters,
    pageUrls: parseRecognizedPageUrlsHtml(html, url),
  };
}

/**
 * 把当前目录页和其余分页目录合并。必须逐页成功才允许入库，
 * 否则用户会误以为整本书已经加入，实际只读得到第一页章节。
 */
export async function expandRecognizedCatalog(
  book: RecognizedBook,
  fetchPageHtml: (url: string) => Promise<string>,
  onProgress?: (done: number, total: number, attempt?: number) => void,
): Promise<RecognizedBook> {
  const currentUrl = book.url.replace(/#.*$/, '');
  const pages = (book.pageUrls || []).filter(
    (url, index, all) =>
      url.replace(/#.*$/, '') !== currentUrl && all.indexOf(url) === index,
  );
  if (pages.length === 0) return book;

  // DOM 回传的分页链接按页面出现顺序排列，可能是“下一页、尾页、中间页”；
  // 仅在全部 URL 能归属于同一分页模板时排序，也把当前页放回它原本的位置。
  const orderedPages = orderCatalogPages([currentUrl, ...pages]);
  const chapters: RecognizedChapter[] = [];
  const seen = new Set<string>();
  let fetchedPages = 0;
  for (const pageUrl of orderedPages) {
    if (pageUrl === currentUrl) {
      for (const chapter of book.chapters) {
        const identity = catalogChapterIdentity(
          book.url,
          chapter.url,
          chapter.title,
        );
        if (identity && !seen.has(identity)) {
          seen.add(identity);
          chapters.push(chapter);
        }
      }
      continue;
    }
    fetchedPages++;
    let pageChapters: RecognizedChapter[] = [];
    let lastError = '';
    // 免费站目录页会偶发先返回广告页/空 DOM；单次失败不能让已解析的十几页目录白费。
    // 重试之间留出短暂间隔，让 WebView 完成上一次跳转和 Cookie 写入后再请求同一页。
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      onProgress?.(fetchedPages, pages.length, attempt);
      try {
        const html = await fetchPageHtml(pageUrl);
        pageChapters = parseRecognizedChaptersHtml(html, pageUrl);
        if (
          pageChapters.some(
            chapter =>
              !seen.has(
                catalogChapterIdentity(book.url, chapter.url, chapter.title),
              ),
          )
        )
          break;
        pageChapters = [];
        lastError = '未识别到新章节，目录分页可能失效';
      } catch (error) {
        lastError = error instanceof Error ? error.message : '页面加载失败';
      }
      if (attempt < 3) {
        await new Promise<void>(resolve => setTimeout(resolve, attempt * 600));
      }
    }
    if (pageChapters.length === 0) {
      throw new Error(
        `目录分页加载失败（已重试 3 次）：${lastError}（${pageUrl}）`,
      );
    }
    pageChapters.forEach(chapter => {
      const identity = catalogChapterIdentity(
        book.url,
        chapter.url,
        chapter.title,
      );
      if (identity && !seen.has(identity)) {
        seen.add(identity);
        chapters.push(chapter);
      }
    });
  }
  return { ...book, chapters, pageUrls: [] };
}

function orderCatalogPages(urls: string[]): string[] {
  for (const candidate of urls) {
    const template = new URL(candidate);
    const match = /^(.*[_-])(\d+)(\/|\.html?)?$/i.exec(template.pathname);
    if (!match) continue;
    const prefix = match[1];
    const suffix = match[3] || '';
    const firstPath = `${prefix.slice(0, -1)}${suffix}`;
    const numbers = urls.map(url => {
      const parsed = new URL(url);
      if (
        parsed.origin !== template.origin ||
        parsed.search !== template.search
      )
        return null;
      if (parsed.pathname === firstPath) return 1;
      if (
        !parsed.pathname.startsWith(prefix) ||
        !parsed.pathname.endsWith(suffix)
      )
        return null;
      const value = parsed.pathname.slice(
        prefix.length,
        suffix ? -suffix.length : undefined,
      );
      return /^\d+$/.test(value) ? Number(value) : null;
    });
    if (numbers.some(number => number === null)) continue;
    return urls
      .map((url, index) => ({ url, number: numbers[index]! }))
      .sort((a, b) => a.number - b.number)
      .map(item => item.url);
  }
  return urls;
}

/** 把地址栏输入解析成要加载的 URL：像网址则直连，否则走 Bing 搜索。 */
export function inputToUrl(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  // 含点且无空格视为域名/网址，补 https://
  if (/^[^\s]+\.[^\s]+$/.test(s) && !/\s/.test(s)) return `https://${s}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`;
}
