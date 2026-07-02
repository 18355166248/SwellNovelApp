/**
 * 书库持久化：原生端写入应用 Documents 目录，避免重启后导入书籍丢失。
 */

import RNFS from 'react-native-fs';
import { Book, Bookmark, Chapter, ReadingHistory } from '../store/types/book';
import { ReaderSettings } from '../store/types/reader';

export interface LibrarySnapshot {
  version: 1;
  readerSettingsVersion?: 2;
  books: Book[];
  chapters: Record<string, Chapter[]>;
  readingHistory: Record<string, ReadingHistory>;
  bookmarks: Record<string, Bookmark[]>;
  readerSettings?: ReaderSettings;
}

const LIBRARY_STATE_PATH = `${RNFS.DocumentDirectoryPath}/library-state-v1.json`;

export const loadLibrarySnapshot = async (): Promise<LibrarySnapshot | null> => {
  const exists = await RNFS.exists(LIBRARY_STATE_PATH);
  if (!exists) {
    return null;
  }

  const raw = await RNFS.readFile(LIBRARY_STATE_PATH, 'utf8');
  const snapshot = JSON.parse(raw) as Partial<LibrarySnapshot>;

  if (snapshot.version !== 1) {
    return null;
  }

  return {
    version: 1,
    books: snapshot.books ?? [],
    chapters: snapshot.chapters ?? {},
    readingHistory: snapshot.readingHistory ?? {},
    bookmarks: snapshot.bookmarks ?? {},
    readerSettings: snapshot.readerSettings
      ? {
          ...snapshot.readerSettings,
          // v1 早期默认值是上下滚动。没有明确设置版本时迁移到新的默认左右翻页，之后用户选择会正常持久化。
          pageMode:
            snapshot.readerSettingsVersion === 2
              ? snapshot.readerSettings.pageMode
              : 'page',
        }
      : undefined,
  };
};

export const saveLibrarySnapshot = async (snapshot: LibrarySnapshot) => {
  await RNFS.writeFile(
    LIBRARY_STATE_PATH,
    JSON.stringify(snapshot),
    'utf8'
  );
};
