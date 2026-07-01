/**
 * 原生端（iOS / Android）的 TXT 文件选取与读取。
 * Web 端由同目录的 importBook.web.ts 覆盖实现。
 */

import DocPicker, { types as DocTypes, isCancel as isDocCancel } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

export interface PickedTxt {
  name: string;
  content: string;
}

export async function pickTxtFile(): Promise<PickedTxt | null> {
  try {
    const results = await (DocPicker as any)({
      allowMultiSelection: false,
      types: [DocTypes?.plainText || 'public.plain-text'],
      copyTo: 'cachesDirectory',
    });
    const picked = Array.isArray(results) ? results[0] : results;
    if (!picked) return null;
    const path = picked.fileCopyUri || picked.uri;
    if (!path) return null;
    const content = await RNFS.readFile(path.replace('file://', ''), 'utf8');
    return { name: (picked.name || '本地TXT').replace(/\.txt$/i, ''), content };
  } catch (e: any) {
    if (typeof isDocCancel === 'function' && isDocCancel(e)) return null;
    throw e;
  }
}
