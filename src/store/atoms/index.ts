/**
 * 统一导出所有 atoms
 */

// 书籍相关
export {
  booksAtom,
  selectedBookIdAtom,
  bookDetailsAtom,
  chaptersAtom,
  currentChaptersAtom,
  bookmarksAtom,
  readingHistoryAtom,
  currentBookHistoryAtom,
  currentBookAtom,
  bookSearchQueryAtom,
  filteredBooksAtom,
} from './bookAtoms';

// 阅读器相关
export {
  readerSettingsAtom,
  readerStateAtom,
  currentChapterContentAtom,
  currentChapterIndexAtom,
  isLoadingChapterAtom,
} from './readerAtoms';

// 设置相关
export {
  appSettingsAtom,
  isDarkModeAtom,
} from './settingsAtoms';
