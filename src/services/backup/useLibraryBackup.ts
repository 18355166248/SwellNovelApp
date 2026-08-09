import { useAtomValue, useSetAtom } from 'jotai';
import {
  bookmarksAtom,
  booksAtom,
  chaptersAtom,
  libraryHydratedAtom,
  readerSettingsAtom,
  readingHistoryAtom,
  readingStatsAtom,
  profileAppearanceAtom,
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
import { normalizeProfileAppearance } from '../../store/types/profile';

export function useLibraryBackup() {
  const hydrated = useAtomValue(libraryHydratedAtom);
  const books = useAtomValue(booksAtom);
  const chaptersInMemory = useAtomValue(chaptersAtom);
  const readingHistory = useAtomValue(readingHistoryAtom);
  const bookmarks = useAtomValue(bookmarksAtom);
  const readerSettings = useAtomValue(readerSettingsAtom);
  const searchHistory = useAtomValue(searchHistoryAtom);
  const readingStats = useAtomValue(readingStatsAtom);
  const profileAppearance = useAtomValue(profileAppearanceAtom);
  const setBooks = useSetAtom(booksAtom);
  const setChapters = useSetAtom(chaptersAtom);
  const setHistory = useSetAtom(readingHistoryAtom);
  const setBookmarks = useSetAtom(bookmarksAtom);
  const setReaderSettings = useSetAtom(readerSettingsAtom);
  const setSearchHistory = useSetAtom(searchHistoryAtom);
  const setReadingStats = useSetAtom(readingStatsAtom);
  const setProfileAppearance = useSetAtom(profileAppearanceAtom);
  const setSelectedBookId = useSetAtom(selectedBookIdAtom);

  const createBackupArchive = async () => {
    const chapters: Record<string, Chapter[]> = {};
    await Promise.all(
      books.map(async book => {
        const content =
          chaptersInMemory[book.id] ?? (await loadBookChapters(book.id));
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
        profileAppearance,
      },
      chapters,
      createdAt,
    );
    return {
      archive,
      fileName: backupFileName(new Date(createdAt)),
      bookCount: books.length,
    };
  };

  const createBackup = async () => {
    const result = await createBackupArchive();
    await saveBackupFile(result.fileName, result.archive);
    return result;
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
    if (backup.meta.readerSettings)
      setReaderSettings(backup.meta.readerSettings);
    setSearchHistory(backup.meta.searchHistory ?? []);
    setReadingStats(backup.meta.readingStats ?? { secondsByDate: {} });
    setProfileAppearance(
      normalizeProfileAppearance(backup.meta.profileAppearance),
    );
    setSelectedBookId(null);
  };

  return {
    hydrated,
    createBackup,
    createBackupArchive,
    selectBackupForRestore,
    restoreBackup,
  };
}
