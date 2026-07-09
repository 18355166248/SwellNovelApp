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
  requireLocalProxy?: boolean;
  localProxyRetries?: number;
};

// 代理转发源：书源站点用 TLS/JA3 指纹识别客户端——curl（服务端代理）能拿到完整
// 单页目录，而 iOS 原生 fetch/WebView 会被降级成 JS 分页目录（每页约 10 章、标题为
// “分节阅读 N”占位），三条 fallback 全都拿不全。因此真机也必须经服务端 curl 代理。
// 开发走本机 server.js；生产/真机走公网部署的同一份 server.js。
const DEV_PROXY_ORIGIN = 'http://127.0.0.1:3000';
const PROD_PROXY_ORIGIN = 'http://101.43.11.224:11008';

/** 判断 url 是否指向我们自己的 /proxy 端点（本机或公网），这类响应已是 UTF-8 明文。 */
function isProxyUrl(url: string): boolean {
  return (
    url.startsWith(`${DEV_PROXY_ORIGIN}/proxy/`) ||
    url.startsWith(`${PROD_PROXY_ORIGIN}/proxy/`)
  );
}

function toProxyUrl(url: string, origin: string): string | null {
  const m = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(m[2])) return null;
  const path = m[3] || '/';
  const sep = path.includes('?') ? '&' : '?';
  // 追加时间戳避免复用旧的短目录/压缩响应，把“分节阅读 N”之类占位目录再次写进缓存。
  return `${origin}/proxy/${m[1].toLowerCase()}/${m[2].toLowerCase()}${path}${sep}__nvl_proxy_ts=${Date.now()}`;
}

export function getSourceProxyUrl(url: string): string | null {
  const proxyOrigin =
    typeof __DEV__ !== 'undefined' && __DEV__
      ? DEV_PROXY_ORIGIN
      : PROD_PROXY_ORIGIN;
  return toProxyUrl(url, proxyOrigin);
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
  const proxyUrl = getSourceProxyUrl(url);
  if (options.preferLocalProxy && proxyUrl) {
    const retries = Math.max(1, options.localProxyRetries ?? 1);
    let lastProxyError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await fetchHtmlDirect(proxyUrl, timeoutMs);
      } catch (error) {
        lastProxyError = error;
        console.info('[fetchHtml] source proxy failed', {
          url,
          attempt,
          retries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.info('[fetchHtml] source proxy exhausted', {
      url,
      error:
        lastProxyError instanceof Error
          ? lastProxyError.message
          : String(lastProxyError),
    });
    if (options.requireLocalProxy) {
      // bookshuku 的直连“成功”经常是降级短目录，代理不可用时必须显式失败，
      // 否则会把 10 来章的坏目录写进本地缓存，后续 Release 包持续复用。
      throw new Error(
        `source proxy exhausted: ${
          lastProxyError instanceof Error
            ? lastProxyError.message
            : String(lastProxyError)
        }`,
      );
    }
  }
  try {
    return await fetchHtmlDirect(url, timeoutMs);
  } catch (error) {
    if (!proxyUrl) throw error;
    console.info('[fetchHtml] direct failed, try source proxy', {
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
        // 书源站点默认对 gzip 请求返回压缩响应；RN iOS 直连时经 base64 桥接的
        // arrayBuffer 偶发拿到未解压/被截断的 gzip 字节，decodeBytes 会解出乱码
        // HTML，导致目录只解析出零星几章（release 真机不走本地代理时尤为明显）。
        // 显式声明 identity 让服务器直接返回明文，避免这条路径。
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (isProxyUrl(url)) {
      // 代理已经用 curl 取回并按 UTF-8 明文输出；RN iOS 的 arrayBuffer
      // 对这类大 HTML 偶发拿到不可解析内容，直接走 text() 更贴近浏览器端行为。
      const html = await res.text();
      if (!html.trim()) throw new Error('empty html');
      if (isChallengeHtml(html)) throw new Error('challenge html');
      return html;
    }

    // React Native 的 fetch 支持 arrayBuffer；个别环境缺失时回退 base64/text。
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // 即便请求了 identity，个别 CDN/运营商仍可能回压缩体；gzip 魔数开头的字节
      // 强解会得到乱码 HTML，会被误当成“部分目录”写入缓存。这里直接抛错，交给
      // 上层 desktop/WebView 兜底重新取，避免污染目录。
      if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        throw new Error('gzip response not decoded');
      }
      const html = decodeBytes(bytes);
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
