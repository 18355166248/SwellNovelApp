/**
 * 把原始字节按最可能的中文编码解码为字符串。
 *
 * 国内小说 TXT 绝大多数是 UTF-8 或 GBK/GB18030，少量 UTF-16。原来导入固定按
 * UTF-8 解码，GBK 文件会整本乱码。这里按「BOM → 严格 UTF-8 → 回退 GB18030」
 * 顺序判定，尽量零依赖、零崩溃。
 *
 * 注意：Web(Chrome/Safari) 的 TextDecoder 原生支持 gb18030；React Native
 * 的 Hermes 可能没有 TextDecoder，因此 UTF-8 / UTF-16 同时保留字节解码路径。
 * 不支持的 GBK 不静默生成乱码书，交给导入入口提示转为 UTF-8。
 */

function tryDecode(
  bytes: Uint8Array,
  encoding: string,
  fatal: boolean,
): string | null {
  if (typeof TextDecoder === 'undefined')
    return decodeUnicode(bytes, encoding, fatal);
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return decodeUnicode(bytes, encoding, fatal);
  }
}

function decodeUnicode(
  bytes: Uint8Array,
  encoding: string,
  fatal: boolean,
): string | null {
  const output: string[] = [];
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const little = encoding === 'utf-16le';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const unit = little
        ? bytes[i] | (bytes[i + 1] << 8)
        : (bytes[i] << 8) | bytes[i + 1];
      if (i === 0 && unit === 0xfeff) continue;
      output.push(String.fromCharCode(unit));
    }
    if (bytes.length % 2) output.push('\ufffd');
    return output.join('');
  }
  if (encoding !== 'utf-8') return null;
  // Hermes 缺少 TextDecoder 时仍按 Unicode 标准检查续字节、过长编码和代理区。
  // 逐码点输出，避免长篇 TXT 使用展开参数造成调用栈溢出。
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i];
    const length =
      first < 0x80
        ? 1
        : first >= 0xc2 && first <= 0xdf
        ? 2
        : first >= 0xe0 && first <= 0xef
        ? 3
        : first >= 0xf0 && first <= 0xf4
        ? 4
        : 0;
    let point = length === 1 ? first : first & (0x7f >> length);
    let valid = length > 0 && i + length <= bytes.length;
    for (let j = 1; valid && j < length; j++) {
      const next = bytes[i + j];
      valid = next >= 0x80 && next <= 0xbf;
      point = point * 64 + (next & 0x3f);
    }
    valid =
      valid &&
      !(length === 3 && point < 0x800) &&
      !(length === 4 && point < 0x10000) &&
      point <= 0x10ffff &&
      !(point >= 0xd800 && point <= 0xdfff);
    if (!valid) {
      if (fatal) return null;
      output.push('\ufffd');
      i++;
    } else {
      output.push(String.fromCodePoint(point));
      i += length;
    }
  }
  return output.join('');
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

  // 错误编码不能作为“导入成功”写入书架，明确提示用户转换编码。
  throw new Error('当前设备无法识别 TXT 编码，请将文件转换为 UTF-8 后重试');
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
