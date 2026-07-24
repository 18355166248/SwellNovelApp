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
 * 注入页面执行的识别脚本（纯字符串，DOM-only）。结果经 window.ReactNativeWebView
 * .postMessage 回传。末尾的 `true;` 是 iOS injectedJavaScript 的要求。
 */
export const RECOGNIZER_JS = `(function(){
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
    // 常见小说站把目录拆成“1 2 3 … 下一页”形式。只收集短数字/翻页文案，
    // 不把“第 N 章”正文链接误当分页；实际章节仍由上面的规则单独识别。
    for (var p = 0; p < as.length; p++) {
      var pa = as[p];
      var pt = (pa.textContent || '').replace(/\s+/g, ' ').trim();
      var ph = pa.href;
      if (!ph || ph === location.href || pageSeen[ph]) continue;
      if (!(/^[0-9]{1,3}$/.test(pt) || /^(上一页|下一页|上页|下页|首页|尾页|末页)$/.test(pt))) continue;
      pageSeen[ph] = 1;
      pageUrls.push(ph);
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
      title: title, author: author, cover: cover,
      chapters: chapters.slice(0, 5000), pageUrls: pageUrls.slice(0, 100)
    };
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${RECOGNIZE_MESSAGE}', ok: false, error: String(e), chapters: [] }));
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

/**
 * 把当前目录页和其余分页目录合并。必须逐页成功才允许入库，
 * 否则用户会误以为整本书已经加入，实际只读得到第一页章节。
 */
export async function expandRecognizedCatalog(
  book: RecognizedBook,
  fetchPageHtml: (url: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
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
    onProgress?.(index + 1, pages.length);
    let html: string;
    try {
      html = await fetchPageHtml(pageUrl);
    } catch (error) {
      const detail = error instanceof Error ? `：${error.message}` : '';
      throw new Error(`目录第 ${index + 2} 页加载失败${detail}`);
    }
    const pageChapters = parseRecognizedChaptersHtml(html, pageUrl);
    if (pageChapters.length === 0) {
      throw new Error(`目录第 ${index + 2} 页未识别到章节`);
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
