/// <reference lib="dom" />

export interface PickedBackupFile {
  name: string;
  bytes: Uint8Array;
}

export async function saveBackupFile(name: string, bytes: Uint8Array) {
  const payload = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([payload], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function pickBackupFile(): Promise<PickedBackupFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    let settled = false;
    const onWindowFocus = () => {
      // 内嵌浏览器可能先触发 focus、后触发文件的 change；留出短暂时间，
      // 避免把“已选文件”误判成取消。仍未选中时再收口 loading 状态。
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 500);
    };
    const finish = (result: PickedBackupFile | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
      reject(error);
    };
    input.type = 'file';
    input.accept = '.swellbackup,.zip,application/zip';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file
        .arrayBuffer()
        .then(buffer =>
          finish({ name: file.name, bytes: new Uint8Array(buffer) }),
        )
        .catch(fail);
    };
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}
