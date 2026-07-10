import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Chapter } from '../../store/types/book';
import { LibraryMeta } from '../../utils/libraryStorage';

const BACKUP_FORMAT_VERSION = 1;
const MANIFEST_ENTRY = 'manifest.json';
const LIBRARY_ENTRY = 'library.json';

export interface BackupManifest {
  format: 'swell-novel-backup';
  version: number;
  createdAt: number;
  entries: Record<string, string>;
}

export interface RestoredLibraryBackup {
  meta: LibraryMeta;
  chapters: Record<string, Chapter[]>;
  createdAt: number;
}

const checksum = (bytes: Uint8Array): string => {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    // eslint-disable-next-line no-bitwise
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  // eslint-disable-next-line no-bitwise
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const chapterEntry = (bookId: string) =>
  `chapters/${encodeURIComponent(bookId)}.json`;

const parseJson = <T>(bytes: Uint8Array, label: string): T => {
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch {
    throw new Error(`备份中的 ${label} 无法读取`);
  }
};

export function createLibraryBackup(
  meta: LibraryMeta,
  chapters: Record<string, Chapter[]>,
  createdAt = Date.now(),
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [LIBRARY_ENTRY]: strToU8(JSON.stringify(meta)),
  };

  for (const [bookId, content] of Object.entries(chapters)) {
    files[chapterEntry(bookId)] = strToU8(JSON.stringify(content));
  }

  const manifest: BackupManifest = {
    format: 'swell-novel-backup',
    version: BACKUP_FORMAT_VERSION,
    createdAt,
    entries: Object.fromEntries(
      Object.entries(files).map(([path, bytes]) => [path, checksum(bytes)]),
    ),
  };
  files[MANIFEST_ENTRY] = strToU8(JSON.stringify(manifest));

  return zipSync(files, { level: 6 });
}

export function readLibraryBackup(archive: Uint8Array): RestoredLibraryBackup {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive);
  } catch {
    throw new Error('无法打开备份文件，请确认文件完整且来自轻读');
  }

  const manifestBytes = files[MANIFEST_ENTRY];
  if (!manifestBytes) {
    throw new Error('备份文件缺少 manifest.json');
  }
  const manifest = parseJson<BackupManifest>(manifestBytes, 'manifest.json');
  if (
    manifest.format !== 'swell-novel-backup' ||
    manifest.version !== BACKUP_FORMAT_VERSION ||
    !manifest.entries
  ) {
    throw new Error('不支持的备份文件版本');
  }

  for (const [path, expectedChecksum] of Object.entries(manifest.entries)) {
    const bytes = files[path];
    if (!bytes || checksum(bytes) !== expectedChecksum) {
      throw new Error(`备份校验失败：${path}`);
    }
  }

  const libraryBytes = files[LIBRARY_ENTRY];
  if (!libraryBytes) {
    throw new Error('备份文件缺少书库数据');
  }
  const meta = parseJson<LibraryMeta>(libraryBytes, 'library.json');
  if (meta.version !== 1 || !Array.isArray(meta.books)) {
    throw new Error('备份中的书库数据格式不正确');
  }

  const chapters: Record<string, Chapter[]> = {};
  for (const book of meta.books) {
    const path = chapterEntry(book.id);
    if (!files[path]) continue;
    const content = parseJson<Chapter[]>(files[path], path);
    if (!Array.isArray(content)) {
      throw new Error(`备份中的章节数据格式不正确：${book.title}`);
    }
    chapters[book.id] = content;
  }

  return { meta, chapters, createdAt: manifest.createdAt };
}

export const backupFileName = (createdAt = new Date()): string => {
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
  return `qingdu-backup-${stamp}.swellbackup`;
};
