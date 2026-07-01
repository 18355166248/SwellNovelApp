/// <reference lib="dom" />
/**
 * Web 端（手机 / 桌面浏览器）的 TXT 文件选取与读取。
 * 用 <input type="file"> + FileReader 替代原生的 DocumentPicker / react-native-fs。
 */

export interface PickedTxt {
  name: string;
  content: string;
}

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
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ name: file.name.replace(/\.txt$/i, ''), content: String(reader.result || '') });
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    };

    document.body.appendChild(input);
    input.click();
  });
}
