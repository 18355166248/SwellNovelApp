/**
 * 统一导出所有自定义 Hooks
 */

// 书籍相关
export {
  useBooks,
  useAllBooks,
  useCurrentBook,
  useCurrentBookHistory,
  useSelectBook,
  useAddBook,
  useRemoveBook,
  useUpdateBook,
  useUpdateReadingProgress,
  useSetChapters,
  useBookChapters,
  useBookSearch,
  useBookmarks,
  useToggleBookmark,
} from './useBooks';

// 阅读器相关
export {
  useReaderSettings,
  useReaderDisplay,
  useSetReaderTheme,
  useAdjustFontSize,
  useSetLineHeightIndex,
  useSetPageMode,
  useSetBrightness,
  useSetFullscreenPref,
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

export { useOpenChapter } from './useOpenChapter';

// 网络书源相关
export {
  useAddOnlineBook,
  useEnsureChapterContent,
  useCacheWholeBook,
  useCheckBookUpdate,
} from './useOnlineBook';

// 阅读统计
export { useAddReadingTime, useReadingStats } from './useStats';

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
