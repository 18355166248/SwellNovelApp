import { fromByteArray, toByteArray } from 'base64-js';
import { unzipSync } from 'fflate';

/** 从 ZIP 字节中只解出指定条目；原生和 Web 共用同一套校验。 */
export function extractZipEntry(
  archiveBytes: Uint8Array,
  entry: string,
): Uint8Array {
  const files = unzipSync(archiveBytes, {
    filter: file => file.name === entry,
  });
  const fontBytes = files[entry];
  if (!fontBytes?.length) {
    throw new Error(`字体压缩包缺少 ${entry}`);
  }
  return fontBytes;
}

/** 从字体 ZIP 的 Base64 数据中只解出指定条目，并返回可交给 RNFS 写入的 Base64。 */
export function extractZipEntryAsBase64(
  archiveBase64: string,
  entry: string,
): string {
  return fromByteArray(extractZipEntry(toByteArray(archiveBase64), entry));
}
