/**
 * 书籍管理相关的自定义 Hooks
 */

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  booksAtom,
  selectedBookIdAtom,
  currentBookAtom,
  filteredBooksAtom,
  bookSearchQueryAtom,
  chaptersAtom,
  readingHistoryAtom,
} from '../atoms';
import { Book, Chapter, ReadingHistory } from '../types/book';

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
    setBooks((prev) => [...prev, book]);
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
    setBooks((prev) => prev.filter((book) => book.id !== bookId));
    setChapters((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
    setHistory((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
  };
};

/**
 * 更新书籍信息
 */
export const useUpdateBook = () => {
  const setBooks = useSetAtom(booksAtom);
  
  return (bookId: string, updates: Partial<Book>) => {
    setBooks((prev) =>
      prev.map((book) =>
        book.id === bookId ? { ...book, ...updates, updatedAt: Date.now() } : book
      )
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
    position?: number
  ) => {
    setBooks((prev) =>
      prev.map((book) =>
        book.id === bookId
          ? {
              ...book,
              progress,
              currentChapterId: chapterId || book.currentChapterId,
              lastReadAt: Date.now(),
            }
          : book
      )
    );

    if (chapterId !== undefined && position !== undefined) {
      setHistory((prev) => ({
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
    setChapters((prev) => ({
      ...prev,
      [bookId]: chapters,
    }));
  };
};

/**
 * 获取书籍的章节列表
 */
export const useBookChapters = (bookId: string | null) => {
  const chapters = useAtomValue(chaptersAtom);
  if (!bookId) return [];
  return chapters[bookId] || [];
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
