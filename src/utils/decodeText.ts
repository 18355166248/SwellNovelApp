/**
 * 把原始字节按最可能的中文编码解码为字符串。
 *
 * 国内小说 TXT 绝大多数是 UTF-8 或 GBK/GB18030，少量 UTF-16。原来导入固定按
 * UTF-8 解码，GBK 文件会整本乱码。这里按「BOM → 严格 UTF-8 → 回退 GB18030」
 * 顺序判定，尽量零依赖、零崩溃。
 *
 * 注意：Web(Chrome/Safari) 的 TextDecoder 原生支持 gb18030；React Native
 * 的 Hermes 若不支持 gb18030，会在 try/catch 里回退到非严格 UTF-8（不崩，但仍可能乱码），
 * 需要时再引入 gb18030 polyfill。
 */

function tryDecode(
  bytes: Uint8Array,
  encoding: string,
  fatal: boolean,
): string | null {
  if (typeof TextDecoder === 'undefined') return null;
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeBytes(bytes: Uint8Array): string {
  // 1) BOM 判定
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return tryDecode(bytes.subarray(3), 'utf-8', false) ?? '';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return tryDecode(bytes, 'utf-16le', false) ?? '';
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return tryDecode(bytes, 'utf-16be', false) ?? '';
  }

  // 2) 无 BOM：先按严格 UTF-8 试解码，一旦遇到非法序列即判定不是 UTF-8。
  const asUtf8 = tryDecode(bytes, 'utf-8', true);
  if (asUtf8 != null) return asUtf8;

  // 3) 回退 GB18030（向下兼容 GBK / GB2312）。
  const asGb = tryDecode(bytes, 'gb18030', false);
  if (asGb != null) return asGb;

  // 4) 兜底：非严格 UTF-8，尽量不崩。
  return tryDecode(bytes, 'utf-8', false) ?? '';
}

/** base64 → 字节数组（原生端 RNFS 读出的是 base64，需先还原字节再解码）。 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const lookup = new Uint8Array(256);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = lookup[clean.charCodeAt(i)];
    const e1 = lookup[clean.charCodeAt(i + 1)];
    const e2 = lookup[clean.charCodeAt(i + 2)];
    const e3 = lookup[clean.charCodeAt(i + 3)];
    if (p < byteLen) bytes[p++] = (e0 << 2) | (e1 >> 4);
    if (p < byteLen) bytes[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (p < byteLen) bytes[p++] = ((e2 & 3) << 6) | e3;
  }
  return bytes;
}
