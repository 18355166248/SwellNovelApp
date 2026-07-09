/**
 * 取 HTML（原生 iOS / Android）。
 *
 * 原生 fetch 无 CORS 限制，可直接请求书源站点。按原始字节 + 编码探测解码，
 * 兼容 UTF-8 / GBK 等中文站点（复用 utils/decodeText）。Web 端由 fetchHtml.web.ts
 * 覆盖：改写到同源代理前缀绕过浏览器跨域限制。
 */

import { base64ToBytes, decodeBytes } from '../../utils/decodeText';

// 移动端 UA：部分书源对 UA 敏感，模拟手机浏览器更稳。
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

// 单次请求超时：书源/搜索站卡住时不至于让阅读器永久停在“加载中”，
// 超时后 abort 抛错，交由调用方切到 error 态并提供重试。
const TIMEOUT_MS = 15000;

type FetchHtmlOptions = {
  preferLocalProxy?: boolean;
  localProxyRetries?: number;
};

function toLocalProxyUrl(url: string): string | null {
  const m = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(m[2])) return null;
  const path = m[3] || '/';
  const sep = path.includes('?') ? '&' : '?';
  // 本地代理用于绕过书源 TLS/Cloudflare 拦截；追加时间戳避免 iOS 模拟器复用
  // 旧的短目录/压缩响应，把“分节阅读 N”之类占位目录再次写进缓存。
  return `http://127.0.0.1:3000/proxy/${m[1].toLowerCase()}/${m[2].toLowerCase()}${path}${sep}__nvl_proxy_ts=${Date.now()}`;
}

function isChallengeHtml(html: string): boolean {
  return (
    /<title>\s*Just a moment/i.test(html) ||
    /Enable JavaScript and cookies to continue/i.test(html)
  );
}

export async function fetchHtml(
  url: string,
  timeoutMs: number = TIMEOUT_MS,
  options: FetchHtmlOptions = {},
): Promise<string> {
  const proxyUrl = typeof __DEV__ !== 'undefined' && __DEV__
    ? toLocalProxyUrl(url)
    : null;
  if (options.preferLocalProxy && proxyUrl) {
    const retries = Math.max(1, options.localProxyRetries ?? 1);
    let lastProxyError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await fetchHtmlDirect(proxyUrl, timeoutMs);
      } catch (error) {
        lastProxyError = error;
        console.info('[fetchHtml] local proxy failed', {
          url,
          attempt,
          retries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.info('[fetchHtml] local proxy exhausted, try direct', {
      url,
      error:
        lastProxyError instanceof Error
          ? lastProxyError.message
          : String(lastProxyError),
    });
  }
  try {
    return await fetchHtmlDirect(url, timeoutMs);
  } catch (error) {
    if (!proxyUrl) throw error;
    console.info('[fetchHtml] direct failed, try local proxy', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return fetchHtmlDirect(proxyUrl, timeoutMs);
  }
}

async function fetchHtmlDirect(
  url: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      // iOS/Android 底层对 User-Agent header 大小写处理不完全一致；
      // 两种写法同时给，尽量避免书源把 RN 默认 UA 当成爬虫返回 403。
      headers: {
        'User-Agent': MOBILE_UA,
        'user-agent': MOBILE_UA,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (/^http:\/\/127\.0\.0\.1:3000\/proxy\//i.test(url)) {
      // 本地代理已经用 curl 取回并按 UTF-8 明文输出；RN iOS 的 arrayBuffer
      // 对这类大 HTML 偶发拿到不可解析内容，直接走 text() 更贴近浏览器端行为。
      const html = await res.text();
      if (!html.trim()) throw new Error('empty html');
      if (isChallengeHtml(html)) throw new Error('challenge html');
      return html;
    }

    // React Native 的 fetch 支持 arrayBuffer；个别环境缺失时回退 base64/text。
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      const html = decodeBytes(new Uint8Array(buf));
      if (!html.trim()) throw new Error('empty html');
      if (isChallengeHtml(html)) throw new Error('challenge html');
      return html;
    }
    const anyRes = res as unknown as { base64?: () => Promise<string> };
    if (typeof anyRes.base64 === 'function') {
      const html = decodeBytes(base64ToBytes(await anyRes.base64()));
      if (!html.trim()) throw new Error('empty html');
      if (isChallengeHtml(html)) throw new Error('challenge html');
      return html;
    }
    const html = await res.text();
    if (!html.trim()) throw new Error('empty html');
    if (isChallengeHtml(html)) throw new Error('challenge html');
    return html;
  } finally {
    clearTimeout(timer);
  }
}
