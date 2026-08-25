/**
 * 隐藏 WebView 取正文桥（逻辑层，平台无关，无 react-native-webview 依赖）。
 *
 * 内置浏览器识别入库的书（source 为站点 host、无注册 BookSource）读正文时走这里：
 * 调用方 await fetchRenderedContent(章节URL) → 由常驻隐藏 WebView（components/
 * WebViewFetcher，仅原生）导航到该 URL、跑完 CF/JS、注入抽正文脚本、回传纯文本。
 * WebView 一次只处理一个任务，内部排队序列化。Web 端无 WebView 挂载，调用会超时拒绝
 * （浏览器识别源本就只在原生产生，故 Web 不会用到）。
 */

import { HEADING_RE } from '../source/contentGuards';
import { devInfo } from '../../utils/devLog';

/** 抽正文脚本回传的消息类型。 */
export const CONTENT_MESSAGE = 'nvl-content';
export type BrowserFetchPriority = 'high' | 'normal' | 'low';

export interface FetchJob {
  id: string;
  url: string;
  script: (id: string) => string;
  waitMs: number;
  timeoutMs: number;
  timeoutMessage: string;
  priority: BrowserFetchPriority;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

export interface BrowserFetchOptions {
  timeout?: number;
  waitMs?: number;
  priority?: BrowserFetchPriority;
}

export interface RenderedChapterPage {
  content: string;
  nextPageUrl?: string;
}

interface RenderedChapterPagePayload extends RenderedChapterPage {
  nextPageLabel?: string;
}

type Enqueue = (job: FetchJob) => void;

let enqueueImpl: Enqueue | null = null;
const buffer: FetchJob[] = []; // WebView 尚未挂载前的缓冲

/** 由 WebViewFetcher 挂载时注册其入队函数；把挂载前缓冲的任务补投。 */
export function registerBrowserFetcher(fn: Enqueue): void {
  enqueueImpl = fn;
  while (buffer.length) fn(buffer.shift()!);
}

export function unregisterBrowserFetcher(): void {
  enqueueImpl = null;
}

let seq = 0;

/** 取某 URL 渲染后的正文纯文本。超时/失败会 reject，交由阅读器切 error 态。 */
export function fetchRenderedContent(
  url: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  const normalized =
    typeof options === 'number' ? { timeout: options } : options;
  return fetchRendered(
    url,
    extractorJs,
    normalized.waitMs ?? 6000,
    normalized.timeout ?? 25000,
    'WebView 取正文超时',
    normalized.priority ?? 'normal',
  );
}

/**
 * 抓取浏览器识别来源的一个章节网页，同时读取页面明确标注的“下一页”。
 * 这里只识别章节内部分页，不把“下一章”当作续页，避免跨章内容被错误拼接。
 */
export async function fetchRenderedChapterPage(
  url: string,
  options: BrowserFetchOptions | number = {},
): Promise<RenderedChapterPage> {
  const normalized =
    typeof options === 'number' ? { timeout: options } : options;
  const payload = await fetchRendered(
    url,
    chapterPageExtractorJs,
    normalized.waitMs ?? 6000,
    normalized.timeout ?? 25000,
    'WebView 取章节分页超时',
    normalized.priority ?? 'normal',
  );
  return parseRenderedChapterPagePayload(payload, url);
}

export function parseRenderedChapterPagePayload(
  raw: string,
  currentUrl: string,
): RenderedChapterPage {
  const parsed = JSON.parse(raw) as RenderedChapterPagePayload;
  if (!parsed || typeof parsed.content !== 'string') {
    throw new Error('网页章节解析结果无效');
  }
  return {
    content: parsed.content,
    nextPageUrl: validateNextPageUrl(
      currentUrl,
      parsed.nextPageUrl,
      parsed.nextPageLabel,
    ),
  };
}

function validateNextPageUrl(
  currentUrl: string,
  candidate?: string,
  label?: string,
): string | undefined {
  const normalizedLabel = (label || '')
    .replace(/\s+/g, '')
    .replace(/[>»›→]+$/g, '');
  if (!/^(下一页|下一頁|下页|下頁)(继续阅读)?$/.test(normalizedLabel)) {
    return undefined;
  }
  try {
    const current = new URL(currentUrl);
    const next = new URL(candidate || '', current);
    current.hash = '';
    next.hash = '';
    if (!/^https?:$/.test(next.protocol) || next.origin !== current.origin) {
      return undefined;
    }
    return next.href !== current.href ? next.href : undefined;
  } catch {
    return undefined;
  }
}

/** 取某 URL 经 WebView 执行 JS/挑战后的完整 HTML，用于详情页/目录页解析兜底。 */
export function fetchRenderedHtml(
  url: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  const normalized =
    typeof options === 'number' ? { timeout: options } : options;
  return fetchRendered(
    url,
    htmlExtractorJs,
    normalized.waitMs ?? 12000,
    normalized.timeout ?? 45000,
    'WebView 取页面超时',
    normalized.priority ?? 'normal',
  );
}

/**
 * 在 WebView 已加载的同源桥页里发起 fetch，再把文本回传给 RN。
 * 用于 iOS 真机对 HTTP IP:端口主导航或 RN fetch 不稳定时，仍复用 Safari/WKWebView
 * 可访问该地址的能力；调用方应传入与目标 URL 同源的 bridgeUrl，避免 CORS。
 */
export function fetchWebViewHttpText(
  url: string,
  bridgeUrl: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  const normalized =
    typeof options === 'number' ? { timeout: options } : options;
  return fetchRendered(
    bridgeUrl,
    id => httpFetchExtractorJs(id, url),
    normalized.waitMs ?? 500,
    normalized.timeout ?? 45000,
    'WebView 网络请求超时',
    normalized.priority ?? 'normal',
  );
}

function fetchRendered(
  url: string,
  script: (id: string) => string,
  waitMs: number,
  timeout: number,
  timeoutMessage: string,
  priority: BrowserFetchPriority,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = `c${++seq}`;
    const timer = setTimeout(
      () => {
        console.warn('[browserFetch] timeout', { id, url, timeout });
        reject(new Error(timeoutMessage));
      },
      timeout,
    );
    const job: FetchJob = {
      id,
      url,
      script,
      waitMs,
      timeoutMs: timeout,
      timeoutMessage,
      priority,
      resolve: t => {
        clearTimeout(timer);
        devInfo('[browserFetch] done', { id, url, length: t.length });
        resolve(t);
      },
      reject: e => {
        clearTimeout(timer);
        console.warn('[browserFetch] failed', { id, url, error: e.message });
        reject(e);
      },
    };
    devInfo('[browserFetch] enqueue', {
      id,
      url,
      waitMs,
      timeout,
      priority,
    });
    if (enqueueImpl) enqueueImpl(job);
    else {
      buffer.push(job);
      devInfo('[browserFetch] buffered', { id, buffered: buffer.length });
    }
  });
}

/**
 * 注入页面执行的通用抽正文脚本：优先命中常见正文容器选择器，取不到再退回“正文最长、
 * 嵌套块最少”的元素；返回其 innerText。末尾 `true;` 为 iOS injectedJavaScript 要求。
 */
export function extractorJs(id: string): string {
  return `(function(){
    function post(payload){
      var message=JSON.stringify(payload);
      try {
        if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView){
          window.webkit.messageHandlers.ReactNativeWebView.postMessage(message); return;
        }
      } catch(ignore) {}
      try { window.ReactNativeWebView.postMessage(message); } catch(ignore) {}
    }
    try {
      var sels=['#chaptercontent','#content','.content','#booktext','#booktxt','#nr1','#nr','.read-content','.article-content','.txtnav','.neirong','.articlecon','.chapter-content','#htmlContent','#BookText','.RreadContent','#TXT','.txt','article'];
      function tlen(el){ return (el && el.innerText ? el.innerText.length : 0); }
      var best=null, bestLen=0, i;
      for(i=0;i<sels.length;i++){ var el=document.querySelector(sels[i]); var l=tlen(el); if(l>bestLen){best=el;bestLen=l;} }
      if(!best || bestLen<100){
        var nodes=document.querySelectorAll('div,article,section'), j;
        for(j=0;j<nodes.length;j++){
          var n=nodes[j], nl=tlen(n);
          if(nl>200 && nl>bestLen && n.querySelectorAll('div,article,section').length<8){ best=n; bestLen=nl; }
        }
      }
      var text = best ? (best.innerText||'') : '';
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:true, text:text });
    } catch(e){
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:false, error:String(e) });
    }
  })(); true;`.replace(/__ID__/g, id);
}

/** 与正文抽取使用同一容器规则，并额外回传严格匹配的章节“下一页”链接。 */
export function chapterPageExtractorJs(id: string): string {
  return `(function(){
    function post(payload){
      var message=JSON.stringify(payload);
      try {
        if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView){
          window.webkit.messageHandlers.ReactNativeWebView.postMessage(message); return;
        }
      } catch(ignore) {}
      try { window.ReactNativeWebView.postMessage(message); } catch(ignore) {}
    }
    try {
      var sels=['#chaptercontent','#content','.content','#booktext','#booktxt','#nr1','#nr','.read-content','.article-content','.txtnav','.neirong','.articlecon','.chapter-content','#htmlContent','#BookText','.RreadContent','#TXT','.txt','article'];
      function tlen(el){ return (el && el.innerText ? el.innerText.length : 0); }
      var best=null, bestLen=0, i;
      for(i=0;i<sels.length;i++){ var el=document.querySelector(sels[i]); var l=tlen(el); if(l>bestLen){best=el;bestLen=l;} }
      if(!best || bestLen<100){
        var nodes=document.querySelectorAll('div,article,section'), j;
        for(j=0;j<nodes.length;j++){
          var n=nodes[j], nl=tlen(n);
          if(nl>200 && nl>bestLen && n.querySelectorAll('div,article,section').length<8){ best=n; bestLen=nl; }
        }
      }
      var nextUrl='', nextLabel='', links=document.querySelectorAll('a[href]'), k;
      for(k=0;k<links.length;k++){
        var a=links[k];
        var label=(a.innerText||a.textContent||a.getAttribute('title')||a.getAttribute('aria-label')||'').replace(/\\s+/g,'').replace(/[>»›→]+$/g,'');
        if(/^(下一页|下一頁|下页|下頁)(继续阅读)?$/.test(label)){
          nextUrl=a.href||a.getAttribute('href')||''; nextLabel=label; break;
        }
      }
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:true, text:JSON.stringify({content:best?(best.innerText||''):'',nextPageUrl:nextUrl,nextPageLabel:nextLabel}) });
    } catch(e){
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:false, error:String(e) });
    }
  })(); true;`.replace(/__ID__/g, id);
}

/**
 * 注入页面执行的 HTML 抽取脚本。用于直接 fetch 被 Cloudflare/明文策略等拦住时，
 * 让 WebView 先完成页面脚本和 cookie 流程，再把最终 DOM 交回书源解析器。
 */
export function htmlExtractorJs(id: string): string {
  return `(function(){
    function post(payload){
      var message=JSON.stringify(payload);
      try {
        if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView){
          window.webkit.messageHandlers.ReactNativeWebView.postMessage(message); return;
        }
      } catch(ignore) {}
      try { window.ReactNativeWebView.postMessage(message); } catch(ignore) {}
    }
    try {
      var html = document.documentElement ? document.documentElement.outerHTML : '';
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:true, text:html });
    } catch(e){
      post({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:false, error:String(e) });
    }
  })(); true;`.replace(/__ID__/g, id);
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function httpFetchExtractorJs(id: string, url: string): string {
  return `(function(){
    var target=${jsString(url)};
    function done(ok, text, error){
      var message=JSON.stringify({
        type:'${CONTENT_MESSAGE}',
        id:'__ID__',
        ok:ok,
        text:text||'',
        error:error||''
      });
      try {
        if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView){
          window.webkit.messageHandlers.ReactNativeWebView.postMessage(message); return;
        }
      } catch(ignore) {}
      try { window.ReactNativeWebView.postMessage(message); } catch(ignore) {}
    }
    try {
      fetch(target, {
        cache:'no-store',
        headers:{ 'Cache-Control':'no-cache', 'Pragma':'no-cache' }
      }).then(function(res){
        if(!res.ok){ throw new Error('HTTP '+res.status); }
        return res.text();
      }).then(function(text){
        done(true, text, '');
      }).catch(function(e){
        done(false, '', String(e && e.message ? e.message : e));
      });
    } catch(e){
      done(false, '', String(e && e.message ? e.message : e));
    }
  })(); true;`.replace(/__ID__/g, id);
}

/** 清洗抽到的正文：去空行、去开头的章节标题回显。 */
export function cleanRenderedText(raw: string, title?: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.replace(/ /g, ' ').trim())
    .filter(l => l.length > 0);
  const t = (title || '').trim();
  while (
    lines.length &&
    ((t && lines[0] === t) ||
      (lines[0].length < 30 && HEADING_RE.test(lines[0])))
  ) {
    lines.shift();
  }
  return lines.join('\n');
}
