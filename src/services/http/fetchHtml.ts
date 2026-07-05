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

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': MOBILE_UA },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // React Native 的 fetch 支持 arrayBuffer；个别环境缺失时回退 base64/text。
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      return decodeBytes(new Uint8Array(buf));
    }
    const anyRes = res as unknown as { base64?: () => Promise<string> };
    if (typeof anyRes.base64 === 'function') {
      return decodeBytes(base64ToBytes(await anyRes.base64()));
    }
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}
