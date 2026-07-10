/// <reference lib="dom" />
/**
 * 取 HTML（Web / react-native-web）。
 *
 * 浏览器直接请求书源站点会被 CORS 拦截，这里把绝对 URL 改写到同源通用代理
 * /proxy/<host>/<path>，由 webpack devServer（开发）或生产反向代理（deploy/server.js）
 * 按白名单转发到真实站点。通用前缀，新增书源无需改此处，只需在服务端白名单登记域名。
 */

import { decodeBytes } from '../../utils/decodeText';

/** 把 scheme://host/path 改写为 /proxy/scheme/host/path；相对/无主机的 URL 原样返回。
 *  保留原始 scheme：https 站点直连 https，避免服务端 curl 走 http→https 重定向时出错。 */
function toProxyUrl(url: string): string {
  const m = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m) return url;
  return `/proxy/${m[1].toLowerCase()}/${m[2].toLowerCase()}${m[3] || '/'}`;
}

/** Web 始终使用当前站点的同源 /proxy，避免引用原生端公网代理配置。 */
export function getSourceProxyUrl(url: string): string | null {
  const proxyUrl = toProxyUrl(url);
  return proxyUrl === url && /^(https?):\/\//i.test(url) ? null : proxyUrl;
}

export function getSourceProxyOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

// 单次请求超时：代理/书源卡住时不至于让阅读器永久停在“加载中”。
const TIMEOUT_MS = 15000;

export async function fetchHtml(
  url: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(toProxyUrl(url), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return decodeBytes(new Uint8Array(buf));
  } finally {
    clearTimeout(timer);
  }
}
