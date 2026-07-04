/**
 * 书籍管理相关的自定义 Hooks
 */

import { useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  booksAtom,
  selectedBookIdAtom,
  currentBookAtom,
  currentBookHistoryAtom,
  filteredBooksAtom,
  bookSearchQueryAtom,
  chaptersAtom,
  readingHistoryAtom,
  bookmarksAtom,
} from '../atoms';
import { Book, Chapter } from '../types/book';
import {
  deleteBookChapters,
  loadBookChapters,
  saveBookChapters,
} from '../../utils/libraryStorage';

/**
 * 获取所有书籍
 */
export const useBooks = () => {
  return useAtomValue(filteredBooksAtom);
};

/**
 * 获取原始书籍列表（不过滤）
 */
export const useAllBooks = () => {
  return useAtomValue(booksAtom);
};

/**
 * 获取当前选中的书籍
 */
export const useCurrentBook = () => {
  return useAtomValue(currentBookAtom);
};

/**
 * 获取当前选中书籍的阅读历史（含页内偏移 position），用于续读定位。
 */
export const useCurrentBookHistory = () => {
  return useAtomValue(currentBookHistoryAtom);
};

/**
 * 设置选中的书籍
 */
export const useSelectBook = () => {
  const setSelectedBookId = useSetAtom(selectedBookIdAtom);
  return (bookId: string | null) => {
    setSelectedBookId(bookId);
  };
};

/**
 * 添加书籍
 */
export const useAddBook = () => {
  const setBooks = useSetAtom(booksAtom);
  return (book: Book) => {
    setBooks(prev => [...prev, book]);
  };
};

/**
 * 删除书籍
 */
export const useRemoveBook = () => {
  const setBooks = useSetAtom(booksAtom);
  const setChapters = useSetAtom(chaptersAtom);
  const setHistory = useSetAtom(readingHistoryAtom);

  return (bookId: string) => {
    setBooks(prev => prev.filter(book => book.id !== bookId));
    setChapters(prev => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
    setHistory(prev => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
    // 同步删除该书的章节正文文件。
    deleteBookChapters(bookId).catch(error => {
      console.warn('[useRemoveBook] delete chapters failed', error);
    });
  };
};

/**
 * 更新书籍信息
 */
export const useUpdateBook = () => {
  const setBooks = useSetAtom(booksAtom);

  return (bookId: string, updates: Partial<Book>) => {
    setBooks(prev =>
      prev.map(book =>
        book.id === bookId
          ? { ...book, ...updates, updatedAt: Date.now() }
          : book,
      ),
    );
  };
};

/**
 * 更新阅读进度
 */
export const useUpdateReadingProgress = () => {
  const setBooks = useSetAtom(booksAtom);
  const setHistory = useSetAtom(readingHistoryAtom);

  return (
    bookId: string,
    progress: number,
    chapterId?: string,
    position?: number,
  ) => {
    setBooks(prev =>
      prev.map(book =>
        book.id === bookId
          ? {
              ...book,
              progress,
              currentChapterId: chapterId || book.currentChapterId,
              lastReadAt: Date.now(),
            }
          : book,
      ),
    );

    if (chapterId !== undefined && position !== undefined) {
      setHistory(prev => ({
        ...prev,
        [bookId]: {
          bookId,
          chapterId,
          position,
          updatedAt: Date.now(),
        },
      }));
    }
  };
};

/**
 * 设置章节列表
 */
export const useSetChapters = () => {
  const setChapters = useSetAtom(chaptersAtom);

  return (bookId: string, chapters: Chapter[]) => {
    setChapters(prev => ({
      ...prev,
      [bookId]: chapters,
    }));
    // 章节按书分文件直接落盘：只在导入/替换时写一次，避免翻页时重复序列化正文。
    saveBookChapters(bookId, chapters).catch(error => {
      console.warn('[useSetChapters] save chapters failed', error);
    });
  };
};

/**
 * 获取书籍的章节列表；内存中没有时从磁盘按需懒加载。
 */
export const useBookChapters = (bookId: string | null) => {
  const [chaptersMap, setChaptersMap] = useAtom(chaptersAtom);

  useEffect(() => {
    if (!bookId || chaptersMap[bookId]) {
      return;
    }
    let cancelled = false;
    loadBookChapters(bookId)
      .then(loaded => {
        if (cancelled || !loaded) {
          return;
        }
        // 已被其它入口填充时不覆盖，避免竞态。
        setChaptersMap(prev =>
          prev[bookId] ? prev : { ...prev, [bookId]: loaded },
        );
      })
      .catch(error => {
        console.warn('[useBookChapters] load chapters failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chaptersMap, setChaptersMap]);

  if (!bookId) return [];
  return chaptersMap[bookId] || [];
};

/**
 * 获取某本书的书签列表
 */
export const useBookmarks = (bookId: string | null) => {
  const bookmarks = useAtomValue(bookmarksAtom);
  if (!bookId) return [];
  return bookmarks[bookId] || [];
};

/**
 * 在当前章节位置添加/移除书签
 */
export const useToggleBookmark = () => {
  const setBookmarks = useSetAtom(bookmarksAtom);

  return (bookId: string, chapterId: string, position = 0) => {
    setBookmarks(prev => {
      const list = prev[bookId] || [];
      const existing = list.find(b => b.chapterId === chapterId);
      if (existing) {
        return {
          ...prev,
          [bookId]: list.filter(b => b.chapterId !== chapterId),
        };
      }
      return {
        ...prev,
        [bookId]: [
          ...list,
          {
            id: `${bookId}-${chapterId}-${Date.now()}`,
            bookId,
            chapterId,
            position,
            createdAt: Date.now(),
          },
        ],
      };
    });
  };
};

/**
 * 书籍搜索
 */
export const useBookSearch = () => {
  const [query, setQuery] = useAtom(bookSearchQueryAtom);
  const filteredBooks = useAtomValue(filteredBooksAtom);

  return {
    query,
    setQuery,
    results: filteredBooks,
  };
};
