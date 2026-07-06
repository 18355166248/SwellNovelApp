/**
 * 隐藏 WebView 取正文桥（逻辑层，平台无关，无 react-native-webview 依赖）。
 *
 * 内置浏览器识别入库的书（source 为站点 host、无注册 BookSource）读正文时走这里：
 * 调用方 await fetchRenderedContent(章节URL) → 由常驻隐藏 WebView（components/
 * WebViewFetcher，仅原生）导航到该 URL、跑完 CF/JS、注入抽正文脚本、回传纯文本。
 * WebView 一次只处理一个任务，内部排队序列化。Web 端无 WebView 挂载，调用会超时拒绝
 * （浏览器识别源本就只在原生产生，故 Web 不会用到）。
 */

/** 抽正文脚本回传的消息类型。 */
export const CONTENT_MESSAGE = 'nvl-content';

export interface FetchJob {
  id: string;
  url: string;
  script: (id: string) => string;
  waitMs: number;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
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
  timeout = 25000,
): Promise<string> {
  return fetchRendered(url, extractorJs, 6000, timeout, 'WebView 取正文超时');
}

/** 取某 URL 经 WebView 执行 JS/挑战后的完整 HTML，用于详情页/目录页解析兜底。 */
export function fetchRenderedHtml(
  url: string,
  timeout = 45000,
): Promise<string> {
  return fetchRendered(url, htmlExtractorJs, 12000, timeout, 'WebView 取页面超时');
}

function fetchRendered(
  url: string,
  script: (id: string) => string,
  waitMs: number,
  timeout: number,
  timeoutMessage: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = `c${++seq}`;
    const timer = setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeout,
    );
    const job: FetchJob = {
      id,
      url,
      script,
      waitMs,
      resolve: t => {
        clearTimeout(timer);
        resolve(t);
      },
      reject: e => {
        clearTimeout(timer);
        reject(e);
      },
    };
    if (enqueueImpl) enqueueImpl(job);
    else buffer.push(job);
  });
}

/**
 * 注入页面执行的通用抽正文脚本：优先命中常见正文容器选择器，取不到再退回“正文最长、
 * 嵌套块最少”的元素；返回其 innerText。末尾 `true;` 为 iOS injectedJavaScript 要求。
 */
export function extractorJs(id: string): string {
  return `(function(){
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
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:true, text:text }));
    } catch(e){
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:false, error:String(e) }));
    }
  })(); true;`.replace(/__ID__/g, id);
}

/**
 * 注入页面执行的 HTML 抽取脚本。用于直接 fetch 被 Cloudflare/明文策略等拦住时，
 * 让 WebView 先完成页面脚本和 cookie 流程，再把最终 DOM 交回书源解析器。
 */
export function htmlExtractorJs(id: string): string {
  return `(function(){
    try {
      var html = document.documentElement ? document.documentElement.outerHTML : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:true, text:html }));
    } catch(e){
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'${CONTENT_MESSAGE}', id:'__ID__', ok:false, error:String(e) }));
    }
  })(); true;`.replace(/__ID__/g, id);
}

/** 清洗抽到的正文：去空行、去开头的章节标题回显。 */
export function cleanRenderedText(raw: string, title?: string): string {
  const heading = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.replace(/ /g, ' ').trim())
    .filter(l => l.length > 0);
  const t = (title || '').trim();
  while (
    lines.length &&
    ((t && lines[0] === t) || (lines[0].length < 30 && heading.test(lines[0])))
  ) {
    lines.shift();
  }
  return lines.join('\n');
}
