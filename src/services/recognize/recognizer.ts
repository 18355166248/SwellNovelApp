/**
 * 网页小说识别器：在内置浏览器（WebView）里读**已渲染的 DOM**，把当前页面识别成
 * 书籍详情/目录，提取书名、作者、封面、章节列表。
 *
 * 与传统书源（RN 内 fetch HTML + 正则）不同：这里的脚本注入到页面内运行，读的是
 * 浏览器渲染后的结果，因此天然规避 CORS、Cloudflare JS 挑战、以及 JS 动态渲染。
 * 通用启发式：命中一批“第N章”式锚点即判为目录页；不依赖具体站点结构，未知站也能认。
 */

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

/**
 * 已知站点的详情页本身不展示章节，需要先换算到目录页再执行通用识别。
 * 只转换同站、可从路径确定书号的路由，避免根据页面文案猜测并跳到广告链接。
 */
export function getRecognitionTargetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (/(^|\.)xuanhuange\.info$/i.test(parsed.hostname)) {
      const match = /^\/info-(\d+)\/?$/i.exec(parsed.pathname);
      if (match) {
        return `${parsed.protocol}//${parsed.host}/wapbook-${match[1]}/`;
      }
    }
  } catch {
    // 地址栏会负责提示非法 URL；识别器保持原值，避免生成不可控地址。
  }
  return url;
}

/**
 * 注入页面执行的识别脚本（纯字符串，DOM-only）。结果经 window.ReactNativeWebView
 * .postMessage 回传。末尾的 `true;` 是 iOS injectedJavaScript 的要求。
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
    var seen = {}, chapters = [], pageSeen = {}, pageUrls = [];
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var t = (a.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!t || t.length > 40 || !reChap.test(t)) continue;
      var href = a.href;
      if (!href || href.indexOf('javascript:') === 0) continue;
      if (seen[href]) continue;
      seen[href] = 1;
      chapters.push({ title: t, url: href });
    }
    // 常见小说站把目录拆成“1 2 3 … 下一页”形式。先定位“下一页”所在的分页栏，
    // 再只取同一栏内的页码，避免把页面其它位置的广告/推荐数字链接误当目录页。
    function pagerText(v){ return /^[0-9]{1,3}$/.test(v) || /^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(v); }
    var pagerRoot = null;
    for (var n = 0; n < as.length && !pagerRoot; n++) {
      var nt = (as[n].textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^(下一页|下页|尾页|末页)$/.test(nt)) continue;
      var parent = as[n].parentElement, depth = 0;
      while (parent && depth < 5) {
        var links = parent.querySelectorAll('a[href]'), candidates = 0;
        for (var q = 0; q < links.length; q++) {
          var qt = (links[q].textContent || '').replace(/\s+/g, ' ').trim();
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
        var basePath = location.pathname.replace(/\/$/, '');
        var path = target.pathname.replace(/\/$/, '');
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
      var pt = (pa.textContent || '').replace(/\s+/g, ' ').trim();
      var ph = pa.href;
      if (!ph || ph === location.href || pageSeen[ph] || !pagerText(pt) || !relatedPagerLink(ph)) continue;
      pageSeen[ph] = 1;
      pageUrls.push(ph);
    }
    // 玄幻阁等站点仅渲染“下一页/尾页”，但会在文案中给出总页数（第 1/27 页）。
    // 从这两个分页链接的 URL 模板补齐中间页，避免只导入第一页或末页。
    var pageText = document.body ? (document.body.innerText || '') : '';
    var pageInfo = pageText.match(/第\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*页/);
    var currentPage = pageInfo ? parseInt(pageInfo[1], 10) : 0;
    var totalPages = pageInfo ? parseInt(pageInfo[2], 10) : 0;
    var templateLink = null;
    for (var r = 0; r < as.length; r++) {
      var rt = (as[r].textContent || '').replace(/\\s+/g, ' ').trim();
      if (!/^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(rt) || !as[r].href) continue;
      try {
        var ru = new URL(as[r].href, location.href);
        var rm = /^(.*[_-])\\d+(\\/?)$/.exec(ru.pathname);
        if (ru.host === location.host && rm) { templateLink = { origin: ru.origin, prefix: rm[1], suffix: rm[2] }; break; }
      } catch(ignore) {}
    }
    if (templateLink && totalPages > 1 && totalPages <= 200) {
      for (var pn = 1; pn <= totalPages; pn++) {
        var generated = templateLink.origin + templateLink.prefix + pn + templateLink.suffix;
        if (pn === currentPage || generated === location.href || pageSeen[generated]) continue;
        pageSeen[generated] = 1;
        pageUrls.push(generated);
      }
    }
    function meta(sel){ var m = document.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; }
    var title = meta('meta[property="og:novel:book_name"]') || meta('meta[property="og:title"]');
    if (!title) { var h = document.querySelector('h1'); title = h ? (h.textContent || '').trim() : ''; }
    if (!title) title = (document.title || '').split(/[-_|]/)[0].trim();
    var author = meta('meta[property="og:novel:author"]') || meta('meta[name="author"]');
    if (!author) { var bt = document.body.innerText || ''; var am = bt.match(/作者[：:\\s]*([^\\n\\r，,。]{1,20})/); author = am ? am[1].trim() : ''; }
    var cover = meta('meta[property="og:image"]');
    var payload = {
      type: '${RECOGNIZE_MESSAGE}', ok: true,
      isDetail: chapters.length >= ${MIN_CHAPTERS},
      url: location.href, host: location.host,
      requestId: requestId,
      title: title, author: author, cover: cover,
      chapters: chapters.slice(0, 5000), pageUrls: pageUrls.slice(0, 100)
    };
    post(payload);
  } catch (e) {
    post({ type: '${RECOGNIZE_MESSAGE}', requestId: requestId, ok: false, error: String(e), chapters: [] });
  }
})(); true;`;

const CHAPTER_TITLE_RE = /第\s*[0-9零一二三四五六七八九十百千两]+\s*[章节回卷]/;

function resolveHref(base: string, href: string): string {
  const value = href.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const origin = /^(https?:\/\/[^/]+)/i.exec(base)?.[1];
  if (!origin) return value;
  if (value.startsWith('//')) return `${base.split(':')[0]}:${value}`;
  if (value.startsWith('/')) return `${origin}${value}`;
  const directory = base.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return `${directory}${value}`;
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
  while ((match = re.exec(html)) !== null) {
    const title = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length > 80 || !CHAPTER_TITLE_RE.test(title)) continue;
    const url = resolveHref(baseUrl, match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    chapters.push({ title, url });
  }
  return chapters;
}

/** 从目录 HTML 的“第 N/总页数 页”和翻页 URL 模板补齐所有分页地址。 */
export function parseRecognizedPageUrlsHtml(html: string, baseUrl: string): string[] {
  const anchors = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const pageInfo = /第\s*(\d+)\s*\/\s*(\d+)\s*页/.exec(html.replace(/<[^>]+>/g, ' '));
  const currentPage = Number(pageInfo?.[1] || 1);
  const totalPages = Number(pageInfo?.[2] || 0);
  if (!Number.isInteger(totalPages) || totalPages <= 1 || totalPages > 200) return [];

  let template: { origin: string; prefix: string; suffix: string } | null = null;
  let match: RegExpExecArray | null;
  while ((match = anchors.exec(html)) !== null) {
    const text = htmlText(match[2]);
    if (!/^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(text)) continue;
    try {
      const target = new URL(resolveHref(baseUrl, match[1]));
      const pathMatch = /^(.*[_-])\d+(\/?)$/.exec(target.pathname);
      if (pathMatch) {
        template = { origin: target.origin, prefix: pathMatch[1], suffix: pathMatch[2] };
        break;
      }
    } catch {
      // 非标准 href 无法作为分页模板。
    }
  }
  if (!template) return [];
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(page => page !== currentPage)
    .map(page => `${template!.origin}${template!.prefix}${page}${template!.suffix}`);
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
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '';
  const title =
    htmlMeta(html, 'og:novel:book_name') ||
    htmlMeta(html, 'og:title') ||
    htmlText(h1) ||
    htmlText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
      .split(/[-_|]/)[0]
      .trim();
  const author =
    htmlMeta(html, 'og:novel:author') ||
    htmlMeta(html, 'author') ||
    htmlText(/作者[：:\s]*([^<\n\r，,。]{1,20})/i.exec(html)?.[1] || '');
  const cover = htmlMeta(html, 'og:image');
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // URL 已由地址栏校验；此处仅为兜底，目录仍可按相对地址解析。
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

  const chapters = [...book.chapters];
  const seen = new Set(chapters.map(chapter => chapter.url));
  for (let index = 0; index < pages.length; index += 1) {
    const pageUrl = pages[index];
    let pageChapters: RecognizedChapter[] = [];
    let lastError = '';
    // 免费站目录页会偶发先返回广告页/空 DOM；单次失败不能让已解析的十几页目录白费。
    // 重试之间留出短暂间隔，让 WebView 完成上一次跳转和 Cookie 写入后再请求同一页。
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      onProgress?.(index + 1, pages.length, attempt);
      try {
        const html = await fetchPageHtml(pageUrl);
        pageChapters = parseRecognizedChaptersHtml(html, pageUrl);
        if (pageChapters.length > 0) break;
        lastError = '未识别到章节';
      } catch (error) {
        lastError = error instanceof Error ? error.message : '页面加载失败';
      }
      if (attempt < 3) {
        await new Promise<void>(resolve => setTimeout(resolve, attempt * 600));
      }
    }
    if (pageChapters.length === 0) {
      throw new Error(`目录第 ${index + 2} 页加载失败（已重试 3 次）：${lastError}`);
    }
    pageChapters.forEach(chapter => {
      if (!seen.has(chapter.url)) {
        seen.add(chapter.url);
        chapters.push(chapter);
      }
    });
  }
  return { ...book, chapters, pageUrls: [] };
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
