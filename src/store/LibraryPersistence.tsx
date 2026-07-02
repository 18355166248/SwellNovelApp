/**
 * 书库持久化桥接组件。
 */

import React from 'react';
import { useAtom } from 'jotai';
import {
  bookmarksAtom,
  booksAtom,
  chaptersAtom,
  readerSettingsAtom,
  readingHistoryAtom,
} from './atoms';
import {
  loadLibrarySnapshot,
  saveLibrarySnapshot,
} from '../utils/libraryStorage';

const SAVE_DEBOUNCE_MS = 500;

export function LibraryPersistence() {
  const [books, setBooks] = useAtom(booksAtom);
  const [chapters, setChapters] = useAtom(chaptersAtom);
  const [readingHistory, setReadingHistory] = useAtom(readingHistoryAtom);
  const [bookmarks, setBookmarks] = useAtom(bookmarksAtom);
  const [readerSettings, setReaderSettings] = useAtom(readerSettingsAtom);
  const hydratedRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    loadLibrarySnapshot()
      .then((snapshot) => {
        if (!snapshot || cancelled) {
          return;
        }

        // 先恢复本地快照再开放保存，避免首次启动把旧书库覆盖成空状态。
        setBooks(snapshot.books);
        setChapters(snapshot.chapters);
        setReadingHistory(snapshot.readingHistory);
        setBookmarks(snapshot.bookmarks);
        if (snapshot.readerSettings) {
          setReaderSettings(snapshot.readerSettings);
        }
      })
      .catch((error) => {
        console.warn('[LibraryPersistence] load failed', error);
      })
      .finally(() => {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    setBooks,
    setBookmarks,
    setChapters,
    setReaderSettings,
    setReadingHistory,
  ]);

  React.useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 阅读进度会高频更新，轻量防抖能减少大章节 JSON 的重复写入。
    saveTimerRef.current = setTimeout(() => {
      saveLibrarySnapshot({
        version: 1,
        books,
        chapters,
        readingHistory,
        bookmarks,
        readerSettings,
      }).catch((error) => {
        console.warn('[LibraryPersistence] save failed', error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, [bookmarks, books, chapters, readerSettings, readingHistory]);

  return null;
}
