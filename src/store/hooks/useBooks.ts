/**
 * 书籍管理相关的自定义 Hooks
 */

import { useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  activeBooksAtom,
  booksAtom,
  deletedBooksAtom,
  selectedBookIdAtom,
  currentBookAtom,
  currentBookHistoryAtom,
  filteredBooksAtom,
  bookSearchQueryAtom,
  chaptersAtom,
  readingHistoryAtom,
  bookmarksAtom,
} from '../atoms';
import { togglePlainBookmark, upsertExcerpt } from '../../utils/bookmarks';
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
 * 获取书架上的书籍列表（不含回收站）。
 * 回收站里的书对书架、搜索去重、统计、追更都应当视为不存在。
 */
export const useAllBooks = () => {
  return useAtomValue(activeBooksAtom);
};

/** 回收站列表，最近删除的排在前面。 */
export const useDeletedBooks = () => {
  return useAtomValue(deletedBooksAtom);
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
    setBooks(prev => {
      // 同一本书可能还在回收站里（在线书的 id 由书源与书号推出，是稳定的）。
      // 这时按还原处理：保留原有阅读进度，而不是并排放两条同 id 记录。
      const existing = prev.find(item => item.id === book.id);
      if (!existing) return [...prev, book];
      return prev.map(item =>
        item.id === book.id
          ? { ...item, ...book, progress: item.progress, deletedAt: undefined }
          : item,
      );
    });
  };
};

/**
 * 把书籍移入回收站。
 *
 * 只打一个 deletedAt 标记：章节缓存、阅读进度、书签摘抄都原样留着，还原后能接着
 * 上次的位置读。真正的清除交给 usePurgeBooks，由回收站页面显式触发。
 */
export const useRemoveBook = () => {
  const setBooks = useSetAtom(booksAtom);

  return (bookId: string) => {
    const deletedAt = Date.now();
    setBooks(prev =>
      prev.map(book => (book.id === bookId ? { ...book, deletedAt } : book)),
    );
  };
};

/** 从回收站还原：清掉标记即可，关联数据从未被删除。 */
export const useRestoreBook = () => {
  const setBooks = useSetAtom(booksAtom);

  return (bookId: string) => {
    setBooks(prev =>
      prev.map(book =>
        book.id === bookId ? { ...book, deletedAt: undefined } : book,
      ),
    );
  };
};

/**
 * 永久删除：连同章节缓存、阅读进度、书签一并清除，并删掉磁盘上的正文文件。
 * 这是唯一不可撤销的路径，只应由回收站的「彻底删除 / 清空」触发。
 */
export const usePurgeBooks = () => {
  const setBooks = useSetAtom(booksAtom);
  const setChapters = useSetAtom(chaptersAtom);
  const setHistory = useSetAtom(readingHistoryAtom);
  const setBookmarks = useSetAtom(bookmarksAtom);

  return (bookIds: string[]) => {
    if (bookIds.length === 0) return;
    const targets = new Set(bookIds);
    setBooks(prev => prev.filter(book => !targets.has(book.id)));
    const dropTargets = <T,>(prev: Record<string, T>): Record<string, T> => {
      const next = { ...prev };
      targets.forEach(bookId => delete next[bookId]);
      return next;
    };
    setChapters(dropTargets);
    setHistory(dropTargets);
    setBookmarks(dropTargets);
    bookIds.forEach(bookId => {
      deleteBookChapters(bookId).catch(error => {
        console.warn('[usePurgeBooks] delete chapters failed', error);
      });
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
              // 首次完成后固定时间；重读导致进度变化时仍保留原完成记录。
              finishedAt:
                progress >= 100 ? book.finishedAt ?? Date.now() : book.finishedAt,
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
      return {
        ...prev,
        [bookId]: togglePlainBookmark(list, bookId, chapterId, position),
      };
    });
  };
};

/** 保存正文摘抄；同一位置再次保存时更新内容与笔记，避免产生重复条目。 */
export const useSaveExcerpt = () => {
  const setBookmarks = useSetAtom(bookmarksAtom);
  return (
    bookId: string,
    chapterId: string,
    position: number,
    excerpt: string,
    note?: string,
  ) => {
    const normalizedExcerpt = excerpt.trim();
    if (!normalizedExcerpt) return;
    setBookmarks(prev => {
      const list = prev[bookId] || [];
      return {
        ...prev,
        [bookId]: upsertExcerpt(
          list,
          bookId,
          chapterId,
          position,
          normalizedExcerpt,
          note,
        ),
      };
    });
  };
};

/** 按 id 删除书签或摘抄，供列表长按删除使用。 */
export const useRemoveBookmark = () => {
  const setBookmarks = useSetAtom(bookmarksAtom);
  return (bookId: string, bookmarkId: string) => {
    setBookmarks(prev => ({
      ...prev,
      [bookId]: (prev[bookId] || []).filter(item => item.id !== bookmarkId),
    }));
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
