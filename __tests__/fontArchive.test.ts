import { fromByteArray } from 'base64-js';
import { strToU8, zipSync } from 'fflate';
import { extractZipEntryAsBase64 } from '../src/utils/fontArchive';

describe('extractZipEntryAsBase64', () => {
  const entry = 'fonts/Reader-Regular.ttf';
  const fontBytes = strToU8('font-data');
  const archiveBase64 = fromByteArray(
    zipSync({
      [entry]: fontBytes,
      'README.txt': strToU8('ignored'),
    }),
  );

  it('只返回指定字体条目的 Base64', () => {
    expect(extractZipEntryAsBase64(archiveBase64, entry)).toBe(
      fromByteArray(fontBytes),
    );
  });

  it('压缩包缺少目标字体时明确失败', () => {
    expect(() =>
      extractZipEntryAsBase64(archiveBase64, 'missing.ttf'),
    ).toThrow('字体压缩包缺少 missing.ttf');
  });
});
