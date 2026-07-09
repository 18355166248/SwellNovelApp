/**
 * Web 端“渲染抓取”桥。
 *
 * 原生端通过隐藏 WebView 等页面 JS 跑完后回传 HTML/正文；Web 端没有这个
 * WebView 宿主，继续复用原生队列会一直等到超时。浏览器版已经有同源代理，
 * 因此这里把兜底抓取降级为代理 fetch，并用 DOMParser 做一次正文提取。
 */

import { fetchHtml } from '../http/fetchHtml';
import { decodeEntities, stripTags } from '../source/html';

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

export function registerBrowserFetcher(): void {
  // Web 端不挂载隐藏 WebView，保留 API 形状避免平台分支泄漏到调用方。
}

export function unregisterBrowserFetcher(): void {
  // noop
}

export async function fetchRenderedHtml(
  url: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  const timeout =
    typeof options === 'number' ? options : options.timeout ?? 15000;
  return fetchHtml(url, timeout);
}

export async function fetchWebViewHttpText(
  url: string,
  _bridgeUrl: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  return fetchRenderedHtml(url, options);
}

export async function fetchRenderedContent(
  url: string,
  options: BrowserFetchOptions | number = {},
): Promise<string> {
  const html = await fetchRenderedHtml(url, options);
  return extractTextFromHtml(html);
}

function extractTextFromHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const selectors = [
      '#chaptercontent',
      '#content',
      '.content',
      '#booktext',
      '#booktxt',
      '#nr1',
      '#nr',
      '.read-content',
      '.article-content',
      '.txtnav',
      '.neirong',
      '.articlecon',
      '.chapter-content',
      '#htmlContent',
      '#BookText',
      '.RreadContent',
      '#TXT',
      '.txt',
      'article',
    ];
    let best: Element | null = null;
    let bestLen = 0;
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const len = (el?.textContent || '').trim().length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
    if (!best || bestLen < 100) {
      for (const el of Array.from(doc.querySelectorAll('div,article,section'))) {
        const len = (el.textContent || '').trim().length;
        if (
          len > 200 &&
          len > bestLen &&
          el.querySelectorAll('div,article,section').length < 8
        ) {
          best = el;
          bestLen = len;
        }
      }
    }
    return best ? best.textContent || '' : doc.body?.textContent || '';
  }

  const block =
    /<div class="articlecon[^"]*">([\s\S]*?)<\/div>/i.exec(html)?.[1] ||
    /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ||
    html;
  return stripTags(
    decodeEntities(
      block
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n'),
    ),
  );
}

export function extractorJs(id: string): string {
  return `/* web fallback does not inject scripts: ${id} */`;
}

export function htmlExtractorJs(id: string): string {
  return `/* web fallback does not inject scripts: ${id} */`;
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
