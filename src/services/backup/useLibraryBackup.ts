import { useAtomValue, useSetAtom } from 'jotai';
import {
  bookmarksAtom,
  booksAtom,
  chaptersAtom,
  libraryHydratedAtom,
  readerSettingsAtom,
  readingHistoryAtom,
  readingStatsAtom,
  searchHistoryAtom,
  selectedBookIdAtom,
} from '../../store/atoms';
import {
  loadBookChapters,
  replaceLibraryFromBackup,
} from '../../utils/libraryStorage';
import { pickBackupFile, saveBackupFile } from './backupFile';
import {
  backupFileName,
  createLibraryBackup,
  readLibraryBackup,
  RestoredLibraryBackup,
} from './libraryBackup';
import { Chapter } from '../../store/types/book';

export function useLibraryBackup() {
  const hydrated = useAtomValue(libraryHydratedAtom);
  const books = useAtomValue(booksAtom);
  const chaptersInMemory = useAtomValue(chaptersAtom);
  const readingHistory = useAtomValue(readingHistoryAtom);
  const bookmarks = useAtomValue(bookmarksAtom);
  const readerSettings = useAtomValue(readerSettingsAtom);
  const searchHistory = useAtomValue(searchHistoryAtom);
  const readingStats = useAtomValue(readingStatsAtom);
  const setBooks = useSetAtom(booksAtom);
  const setChapters = useSetAtom(chaptersAtom);
  const setHistory = useSetAtom(readingHistoryAtom);
  const setBookmarks = useSetAtom(bookmarksAtom);
  const setReaderSettings = useSetAtom(readerSettingsAtom);
  const setSearchHistory = useSetAtom(searchHistoryAtom);
  const setReadingStats = useSetAtom(readingStatsAtom);
  const setSelectedBookId = useSetAtom(selectedBookIdAtom);

  const createBackup = async () => {
    const chapters: Record<string, Chapter[]> = {};
    await Promise.all(
      books.map(async book => {
        const content = chaptersInMemory[book.id] ?? (await loadBookChapters(book.id));
        if (content) chapters[book.id] = content;
      }),
    );
    const createdAt = Date.now();
    const archive = createLibraryBackup(
      {
        version: 1,
        readerSettingsVersion: 2,
        books,
        readingHistory,
        bookmarks,
        readerSettings,
        searchHistory,
        readingStats,
      },
      chapters,
      createdAt,
    );
    await saveBackupFile(backupFileName(new Date(createdAt)), archive);
    return { bookCount: books.length };
  };

  const selectBackupForRestore = async (): Promise<{
    name: string;
    backup: RestoredLibraryBackup;
  } | null> => {
    const file = await pickBackupFile();
    if (!file) return null;
    return { name: file.name, backup: readLibraryBackup(file.bytes) };
  };

  const restoreBackup = async (backup: RestoredLibraryBackup) => {
    await replaceLibraryFromBackup(backup.meta, backup.chapters);
    setBooks(backup.meta.books);
    setChapters({});
    setHistory(backup.meta.readingHistory ?? {});
    setBookmarks(backup.meta.bookmarks ?? {});
    if (backup.meta.readerSettings) setReaderSettings(backup.meta.readerSettings);
    setSearchHistory(backup.meta.searchHistory ?? []);
    setReadingStats(backup.meta.readingStats ?? { secondsByDate: {} });
    setSelectedBookId(null);
  };

  return { hydrated, createBackup, selectBackupForRestore, restoreBackup };
}
