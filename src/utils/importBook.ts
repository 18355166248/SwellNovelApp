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
import { base64ToBytes, decodeBytes } from './decodeText';

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
    // 读原始字节（base64）再按编码探测解码，兼容 UTF-8 / GBK / GB18030 / UTF-16，
    // 避免 GBK 中文 TXT 被固定 utf8 解码成乱码。
    const base64 = await RNFS.readFile(
      decodeURIComponent(path.replace('file://', '')),
      'base64',
    );
    const content = decodeBytes(base64ToBytes(base64));
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
