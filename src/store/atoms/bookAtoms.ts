/**
 * 书籍管理相关的原子状态
 */

import { atom } from 'jotai';
import { Book, Chapter, Bookmark, ReadingHistory } from '../types/book';

// 书籍列表
export const booksAtom = atom<Book[]>([]);

// 当前选中的书籍 ID
export const selectedBookIdAtom = atom<string | null>(null);

// 书籍详情（按 ID 索引）
export const bookDetailsAtom = atom<Record<string, Book>>({});

// 章节列表（按书籍 ID 索引）
export const chaptersAtom = atom<Record<string, Chapter[]>>({});

// 当前书籍的章节
export const currentChaptersAtom = atom<Chapter[]>((get) => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return [];
  const chapters = get(chaptersAtom);
  return chapters[bookId] || [];
});

// 书签列表（按书籍 ID 索引）
export const bookmarksAtom = atom<Record<string, Bookmark[]>>({});

// 阅读历史
export const readingHistoryAtom = atom<Record<string, ReadingHistory>>({});

// 当前书籍的阅读历史
export const currentBookHistoryAtom = atom<ReadingHistory | null>((get) => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return null;
  const history = get(readingHistoryAtom);
  return history[bookId] || null;
});

// 当前书籍
export const currentBookAtom = atom<Book | null>((get) => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return null;
  const books = get(booksAtom);
  return books.find((book) => book.id === bookId) || null;
});

// 书籍搜索关键词
export const bookSearchQueryAtom = atom<string>('');

// 筛选后的书籍列表
export const filteredBooksAtom = atom<Book[]>((get) => {
  const books = get(booksAtom);
  const query = get(bookSearchQueryAtom).toLowerCase().trim();

  if (!query) return books;

  return books.filter(
    (book) =>
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query)
  );
});
