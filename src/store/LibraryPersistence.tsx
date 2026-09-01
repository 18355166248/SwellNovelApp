/**
 * 书库持久化桥接组件。
 *
 * 只负责启动时恢复快照，以及 meta（书籍/进度/书签/设置）的高频轻量落盘。
 * 章节正文改为按书分文件、在导入/删书时由对应 hook 直接落盘，翻页更新进度
 * 不再触发任何正文写入，避免整本 10MB 正文被反复序列化导致卡顿。
 */

import React from 'react';
import { useAtom } from 'jotai';
import {
  bookmarksAtom,
  booksAtom,
  chaptersAtom,
  libraryHydrationAttemptReadAtom,
  libraryHydrationErrorAtom,
  libraryHydratedAtom,
  readerSettingsAtom,
  readingHistoryAtom,
  readingStatsAtom,
  profileAppearanceAtom,
  searchHistoryAtom,
} from './atoms';
import { loadLibrarySnapshot, saveLibraryMeta } from '../utils/libraryStorage';

const SAVE_DEBOUNCE_MS = 500;

export function LibraryPersistence() {
  const [books, setBooks] = useAtom(booksAtom);
  const setChapters = useAtom(chaptersAtom)[1];
  const [readingHistory, setReadingHistory] = useAtom(readingHistoryAtom);
  const [bookmarks, setBookmarks] = useAtom(bookmarksAtom);
  const [readerSettings, setReaderSettings] = useAtom(readerSettingsAtom);
  const [searchHistory, setSearchHistory] = useAtom(searchHistoryAtom);
  const [readingStats, setReadingStats] = useAtom(readingStatsAtom);
  const [profileAppearance, setProfileAppearance] = useAtom(
    profileAppearanceAtom,
  );
  const setLibraryHydrated = useAtom(libraryHydratedAtom)[1];
  const hydrationAttempt = useAtom(libraryHydrationAttemptReadAtom)[0];
  const setHydrationError = useAtom(libraryHydrationErrorAtom)[1];
  const hydratedRef = React.useRef(false);
  const metaTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setLibraryHydrated(false);
    setHydrationError(null);

    loadLibrarySnapshot()
      .then(snapshot => {
        if (cancelled) return;

        if (snapshot) {
          // 先恢复本地快照再开放保存，避免首次启动把旧书库覆盖成空状态。
          // 章节此处仍为空对象，等打开具体书籍时再按需懒加载。
          setBooks(snapshot.books);
          setChapters(snapshot.chapters);
          setReadingHistory(snapshot.readingHistory);
          setBookmarks(snapshot.bookmarks);
          if (snapshot.readerSettings) {
            setReaderSettings(snapshot.readerSettings);
          }
          if (snapshot.searchHistory) {
            setSearchHistory(snapshot.searchHistory);
          }
          if (snapshot.readingStats) {
            setReadingStats(snapshot.readingStats);
          }
          if (snapshot.profileAppearance) {
            setProfileAppearance(snapshot.profileAppearance);
          }
        }
        // snapshot=null 是合法的首次安装，也应开放空书架并允许后续保存。
        hydratedRef.current = true;
        setLibraryHydrated(true);
      })
      .catch(error => {
        console.warn('[LibraryPersistence] load failed', error);
        if (!cancelled) {
          setHydrationError(
            '无法读取本地书架，请重试。你的原始文件不会被删除。',
          );
        }
      });

    return () => {
      cancelled = true;
      if (metaTimerRef.current) {
        clearTimeout(metaTimerRef.current);
      }
    };
  }, [
    hydrationAttempt,
    setBooks,
    setBookmarks,
    setChapters,
    setLibraryHydrated,
    setHydrationError,
    setReaderSettings,
    setReadingHistory,
    setReadingStats,
    setProfileAppearance,
    setSearchHistory,
  ]);

  // 轻量 meta：书籍、阅读进度、书签、设置高频变更，防抖后单独落盘。
  React.useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (metaTimerRef.current) {
      clearTimeout(metaTimerRef.current);
    }

    metaTimerRef.current = setTimeout(() => {
      saveLibraryMeta({
        version: 1,
        readerSettingsVersion: 2,
        books,
        readingHistory,
        bookmarks,
        readerSettings,
        searchHistory,
        readingStats,
        profileAppearance,
      }).catch(error => {
        console.warn('[LibraryPersistence] save meta failed', error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, [
    bookmarks,
    books,
    readerSettings,
    readingHistory,
    readingStats,
    profileAppearance,
    searchHistory,
  ]);

  return null;
}
