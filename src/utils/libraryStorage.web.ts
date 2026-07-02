/**
 * 书库持久化：Web 端使用 localStorage，保持和原生端相同的快照结构。
 */

import { Book, Bookmark, Chapter, ReadingHistory } from '../store/types/book';
import { ReaderSettings } from '../store/types/reader';

export interface LibrarySnapshot {
  version: 1;
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
    readerSettings: snapshot.readerSettings,
  };
};

export const saveLibrarySnapshot = async (snapshot: LibrarySnapshot) => {
  window.localStorage.setItem(LIBRARY_STATE_KEY, JSON.stringify(snapshot));
};
