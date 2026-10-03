/**
 * 书库持久化桥接组件。
 *
 * 只负责启动时恢复快照，以及 meta（书籍/进度/书签/设置）的高频轻量落盘。
 * 章节正文改为按书分文件、在导入/删书时由对应 hook 直接落盘，翻页更新进度
 * 不再触发任何正文写入，避免整本 10MB 正文被反复序列化导致卡顿。
 */

import React from 'react';
import { AppState, Platform } from 'react-native';
import { useAtom, useStore } from 'jotai';
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
  const store = useStore();
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
  const appStateRef = React.useRef(AppState.currentState);
  const metaTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushMeta = React.useCallback(() => {
    if (metaTimerRef.current) {
      clearTimeout(metaTimerRef.current);
      metaTimerRef.current = null;
    }
    if (!hydratedRef.current) return;
    // 退出/后台事件可能发生在 React 提交前，直接读取 store，不能保存上一帧的进度。
    saveLibraryMeta({
      version: 1,
      readerSettingsVersion: 2,
      books: store.get(booksAtom),
      readingHistory: store.get(readingHistoryAtom),
      bookmarks: store.get(bookmarksAtom),
      readerSettings: store.get(readerSettingsAtom),
      searchHistory: store.get(searchHistoryAtom),
      readingStats: store.get(readingStatsAtom),
      profileAppearance: store.get(profileAppearanceAtom),
    }).catch(error => {
      console.warn('[LibraryPersistence] save meta failed', error);
    });
  }, [store]);

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

  React.useEffect(() => {
    // 系统会暂停后台计时器；隐藏页面或切后台时立即提交，避免最后 500ms 的入库/进度丢失。
    const subscription = AppState.addEventListener('change', state => {
      appStateRef.current = state;
      if (state === 'background' || state === 'inactive') flushMeta();
    });
    const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushMeta();
    };
    const flushIfHidden = () => {
      if (
        appStateRef.current === 'background' ||
        appStateRef.current === 'inactive' ||
        (isWeb && document.visibilityState === 'hidden')
      )
        flushMeta();
    };
    // 阅读器的后台监听通常后于本组件执行；直接订阅它结算后的 atom，
    // 不依赖后台 React 再提交一帧，确保最后的滚动位置/时长也能发起落盘。
    const unsubscribeMeta = [
      store.sub(booksAtom, flushIfHidden),
      store.sub(readingHistoryAtom, flushIfHidden),
      store.sub(bookmarksAtom, flushIfHidden),
      store.sub(readerSettingsAtom, flushIfHidden),
      store.sub(searchHistoryAtom, flushIfHidden),
      store.sub(readingStatsAtom, flushIfHidden),
      store.sub(profileAppearanceAtom, flushIfHidden),
    ];
    if (isWeb) {
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', flushMeta);
    }
    return () => {
      subscription.remove();
      unsubscribeMeta.forEach(unsubscribe => unsubscribe());
      if (isWeb) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', flushMeta);
      }
      flushMeta();
    };
  }, [flushMeta, store]);

  // 轻量 meta：书籍、阅读进度、书签、设置高频变更，防抖后单独落盘。
  React.useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (metaTimerRef.current) {
      clearTimeout(metaTimerRef.current);
    }

    if (
      appStateRef.current === 'background' ||
      appStateRef.current === 'inactive' ||
      (Platform.OS === 'web' &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden')
    ) {
      // 阅读器也会在后台事件里结算时长；这些后续变更同样立即保存，不能再启动防抖计时器。
      flushMeta();
    } else {
      metaTimerRef.current = setTimeout(flushMeta, SAVE_DEBOUNCE_MS);
    }
  }, [
    flushMeta,
    hydrationAttempt,
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
