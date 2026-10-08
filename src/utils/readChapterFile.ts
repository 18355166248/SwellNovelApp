import RNFS from 'react-native-fs';
import type { Chapter } from '../store/types/book';
import { throwIfAborted } from './abort';
import { base64ToBytes, decodeUtf8Bytes } from './decodeText';
import { JsonObjectArrayParser } from './jsonObjectArrayParser';

const READ_CHUNK_BYTES = 32 * 1024;

/** 找出块尾尚未读完的 UTF-8 字符；中文和扩展字符可能跨越原生按字节读取的边界。 */
function completeUtf8End(bytes: Uint8Array): number {
  let start = bytes.length - 1;
  while (start >= 0 && bytes[start] >= 0x80 && bytes[start] <= 0xbf) start--;
  if (start < 0) return bytes.length;
  const first = bytes[start];
  const length =
    first >= 0xf0 && first <= 0xf4
      ? 4
      : first >= 0xe0 && first <= 0xef
      ? 3
      : first >= 0xc2 && first <= 0xdf
      ? 2
      : 1;
  return bytes.length - start < length ? start : bytes.length;
}

export async function readChapterFile(
  path: string,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  throwIfAborted(signal);
  const stat = await RNFS.stat(path);
  throwIfAborted(signal);
  const size = Number(stat.size);
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('无法读取章节文件大小');
  const parser = new JsonObjectArrayParser<Chapter>();
  let position = 0;
  let tail = new Uint8Array(0);
  while (position < size) {
    throwIfAborted(signal);
    // RNFS 的 utf8 模式会在返回 Promise 前同步解码整本 Base64，取消检查来不及执行。
    // 只读取小块 Base64，自己解码并逐章解析，每块之间让出 JS 线程处理返回和 Tab 点击。
    const encoded = await RNFS.read(
      path,
      Math.min(READ_CHUNK_BYTES, size - position),
      position,
      'base64',
    );
    throwIfAborted(signal);
    const chunk = base64ToBytes(encoded);
    if (!chunk.length || chunk.length > size - position)
      throw new Error('章节文件读取不完整');
    position += chunk.length;
    const bytes = new Uint8Array(tail.length + chunk.length);
    bytes.set(tail);
    bytes.set(chunk, tail.length);
    const end = completeUtf8End(bytes);
    parser.push(decodeUtf8Bytes(bytes.subarray(0, end)));
    tail = bytes.slice(end);
    // 仅串 Promise 微任务仍会挡住触摸事件，必须真正让出一次事件循环。
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throwIfAborted(signal);
  if (tail.length) throw new Error('章节文件 UTF-8 字符不完整');
  return parser.finish();
}
