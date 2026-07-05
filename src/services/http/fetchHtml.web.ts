/// <reference lib="dom" />
/**
 * 取 HTML（Web / react-native-web）。
 *
 * 浏览器直接请求书源站点会被 CORS 拦截，这里把绝对 URL 改写到同源通用代理
 * /proxy/<host>/<path>，由 webpack devServer（开发）或生产反向代理（deploy/server.js）
 * 按白名单转发到真实站点。通用前缀，新增书源无需改此处，只需在服务端白名单登记域名。
 */

import { decodeBytes } from '../../utils/decodeText';

/** 把 http://host/path 改写为 /proxy/host/path；相对/无主机的 URL 原样返回。 */
function toProxyUrl(url: string): string {
  const m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m) return url;
  return `/proxy/${m[1].toLowerCase()}${m[2] || '/'}`;
}

// 单次请求超时：代理/书源卡住时不至于让阅读器永久停在“加载中”。
const TIMEOUT_MS = 15000;

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(toProxyUrl(url), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return decodeBytes(new Uint8Array(buf));
  } finally {
    clearTimeout(timer);
  }
}
