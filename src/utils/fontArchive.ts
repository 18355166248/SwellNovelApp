import { fromByteArray, toByteArray } from 'base64-js';
import { unzipSync } from 'fflate';

/** 从字体 ZIP 的 Base64 数据中只解出指定条目，并返回可交给 RNFS 写入的 Base64。 */
export function extractZipEntryAsBase64(
  archiveBase64: string,
  entry: string,
): string {
  const files = unzipSync(toByteArray(archiveBase64), {
    filter: file => file.name === entry,
  });
  const fontBytes = files[entry];
  if (!fontBytes?.length) {
    throw new Error(`字体压缩包缺少 ${entry}`);
  }
  return fromByteArray(fontBytes);
}
