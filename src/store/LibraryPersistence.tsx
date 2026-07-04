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
  readerSettingsAtom,
  readingHistoryAtom,
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
  const hydratedRef = React.useRef(false);
  const metaTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    loadLibrarySnapshot()
      .then(snapshot => {
        if (!snapshot || cancelled) {
          return;
        }

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
      })
      .catch(error => {
        console.warn('[LibraryPersistence] load failed', error);
      })
      .finally(() => {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      if (metaTimerRef.current) {
        clearTimeout(metaTimerRef.current);
      }
    };
  }, [
    setBooks,
    setBookmarks,
    setChapters,
    setReaderSettings,
    setReadingHistory,
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
      }).catch(error => {
        console.warn('[LibraryPersistence] save meta failed', error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, [bookmarks, books, readerSettings, readingHistory, searchHistory]);

  return null;
}
