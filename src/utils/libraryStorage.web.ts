/**
 * 书库持久化：Web 端使用 localStorage，保持和原生端相同的快照结构。
 */

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

const LIBRARY_STATE_KEY = 'swell-novel-library-state-v1';

export const loadLibrarySnapshot = async (): Promise<LibrarySnapshot | null> => {
  const raw = window.localStorage.getItem(LIBRARY_STATE_KEY);
  if (!raw) {
    return null;
  }

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
  window.localStorage.setItem(LIBRARY_STATE_KEY, JSON.stringify(snapshot));
};
