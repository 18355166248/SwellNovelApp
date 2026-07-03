/// <reference lib="dom" />
/**
 * Web 端（手机 / 桌面浏览器）的 TXT 文件选取与读取。
 * 用 <input type="file"> + FileReader 替代原生的 DocumentPicker / react-native-fs。
 */

export interface PickedTxt {
  name: string;
  content: string;
}

import { decodeBytes } from './decodeText';

export function pickTxtFile(): Promise<PickedTxt | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      // 读原始字节再按编码探测解码，兼容 UTF-8 / GBK / GB18030 / UTF-16。
      file
        .arrayBuffer()
        .then(buf => {
          resolve({
            name: file.name.replace(/\.txt$/i, ''),
            content: decodeBytes(new Uint8Array(buf)),
          });
        })
        .catch(reject);
    };

    document.body.appendChild(input);
    input.click();
  });
}
