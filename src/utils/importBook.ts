/**
 * 原生端（iOS / Android）的 TXT 文件选取与读取。
 * Web 端由同目录的 importBook.web.ts 覆盖实现。
 */

import {
  errorCodes,
  isErrorWithCode,
  pick,
  types as DocTypes,
} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

export interface PickedTxt {
  name: string;
  content: string;
}

export async function pickTxtFile(): Promise<PickedTxt | null> {
  try {
    // @react-native-documents/picker v12 使用命名导出的 pick，旧版 default 函数调用会在点击导入时直接报错。
    const results = await pick({
      allowMultiSelection: false,
      type: [DocTypes?.plainText || 'public.plain-text'],
    });
    const picked = Array.isArray(results) ? results[0] : results;
    if (!picked) return null;
    const path = picked.uri;
    if (!path) return null;
    const content = await RNFS.readFile(
      decodeURIComponent(path.replace('file://', '')),
      'utf8',
    );
    return { name: (picked.name || '本地TXT').replace(/\.txt$/i, ''), content };
  } catch (e: any) {
    if (
      isErrorWithCode(e) &&
      e.code === errorCodes.OPERATION_CANCELED
    ) {
      return null;
    }
    throw e;
  }
}
