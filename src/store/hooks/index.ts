/**
 * 统一导出所有自定义 Hooks
 */

// 书籍相关
export {
  useBooks,
  useAllBooks,
  useCurrentBook,
  useSelectBook,
  useAddBook,
  useRemoveBook,
  useUpdateBook,
  useUpdateReadingProgress,
  useSetChapters,
  useBookChapters,
  useBookSearch,
} from './useBooks';

// 阅读器相关
export {
  useReaderSettings,
  useUpdateReaderSettings,
  useResetReaderSettings,
  useReaderState,
  useUpdateReaderState,
  useToggleToolbar,
  useSetToolbarVisible,
  useCurrentChapterContent,
  useSetChapterContent,
  useCurrentChapterIndex,
  useSetChapterIndex,
  useIsLoadingChapter,
  useSetLoadingChapter,
} from './useReader';

// 设置相关
export {
  useAppSettings,
  useUpdateAppSettings,
  useToggleTheme,
  useSetTheme,
  useIsDarkMode,
  useToggleNotifications,
  useSetNotificationsEnabled,
} from './useSettings';
