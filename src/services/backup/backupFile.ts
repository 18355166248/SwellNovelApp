import { fromByteArray, toByteArray } from 'base64-js';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  saveDocuments,
} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

export interface PickedBackupFile {
  name: string;
  bytes: Uint8Array;
}

const BACKUP_MIME = 'application/vnd.swellnovel.backup+zip';

export async function saveBackupFile(name: string, bytes: Uint8Array) {
  const directory = `${RNFS.CachesDirectoryPath}/library-backups`;
  const path = `${directory}/${name}`;
  await RNFS.mkdir(directory);
  await RNFS.writeFile(path, fromByteArray(bytes), 'base64');
  const [result] = await saveDocuments({
    sourceUris: [`file://${path}`],
    fileName: name,
    mimeType: BACKUP_MIME,
    copy: true,
  });
  if (result?.error) {
    throw new Error(result.error);
  }
}

export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  try {
    const [picked] = await pick({
      allowMultiSelection: false,
      type: [BACKUP_MIME, 'application/zip'],
    });
    if (!picked?.uri) return null;
    const name = picked.name || '轻读备份.swellbackup';
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName: name }],
      destination: 'cachesDirectory',
    });
    if (copy.status !== 'success') {
      throw new Error(copy.copyError || '无法读取备份文件');
    }
    const path = decodeURIComponent(copy.localUri.replace('file://', ''));
    const base64 = await RNFS.readFile(path, 'base64');
    return { name, bytes: toByteArray(base64) };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw error;
  }
}
