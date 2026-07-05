/// <reference lib="dom" />
/**
 * 取 HTML（Web / react-native-web）。
 *
 * 浏览器直接请求书源站点会被 CORS 拦截，这里把绝对 URL 改写到同源代理前缀，
 * 由 webpack devServer（开发）或生产环境的反向代理转发到真实站点。
 * 新增书源时在 PROXY_PREFIX 里登记「主机名 → 代理前缀」即可。
 */

import { decodeBytes } from '../../utils/decodeText';

const PROXY_PREFIX: Record<string, string> = {
  'wap.bookshuku.org': '/proxy/bookshuku',
};

/** 把 http://host/path 改写为 /proxy/xxx/path；未登记的主机原样返回。 */
function toProxyUrl(url: string): string {
  const m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m) return url;
  const prefix = PROXY_PREFIX[m[1].toLowerCase()];
  if (!prefix) return url;
  return `${prefix}${m[2] || '/'}`;
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
