/**
 * 书籍管理相关的原子状态
 */

import { atom } from 'jotai';
import { Book, Chapter, Bookmark, ReadingHistory } from '../types/book';

// 书籍列表（含回收站中的书，删除与还原都在这份列表上改标记）
export const booksAtom = atom<Book[]>([]);

/** 书架可见的书：回收站中的书对绝大多数界面都应当不存在。 */
export const activeBooksAtom = atom<Book[]>(get =>
  get(booksAtom).filter(book => !book.deletedAt),
);

/** 回收站列表，最近删除的排在前面。 */
export const deletedBooksAtom = atom<Book[]>(get =>
  get(booksAtom)
    .filter(book => !!book.deletedAt)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)),
);

/** LibraryPersistence 完成磁盘快照恢复后才允许导出或恢复备份。 */
export const libraryHydratedAtom = atom<boolean>(false);
/** 启动恢复失败时保留可展示状态，避免把读取失败伪装成“空书架”。 */
export const libraryHydrationErrorAtom = atom<string | null>(null);
const libraryHydrationAttemptAtom = atom(0);
/** 由错误页触发一次新的磁盘恢复；实际 IO 仍集中在 LibraryPersistence。 */
export const retryLibraryHydrationAtom = atom(null, (get, set) => {
  set(libraryHydratedAtom, false);
  set(libraryHydrationErrorAtom, null);
  set(libraryHydrationAttemptAtom, get(libraryHydrationAttemptAtom) + 1);
});
export const libraryHydrationAttemptReadAtom = atom(get =>
  get(libraryHydrationAttemptAtom),
);

// 当前选中的书籍 ID
export const selectedBookIdAtom = atom<string | null>(null);

// 书籍详情（按 ID 索引）
export const bookDetailsAtom = atom<Record<string, Book>>({});

// 章节列表（按书籍 ID 索引）
export const chaptersAtom = atom<Record<string, Chapter[]>>({});

// 当前书籍的章节
export const currentChaptersAtom = atom<Chapter[]>(get => {
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
export const currentBookHistoryAtom = atom<ReadingHistory | null>(get => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return null;
  const history = get(readingHistoryAtom);
  return history[bookId] || null;
});

// 当前书籍
export const currentBookAtom = atom<Book | null>(get => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return null;
  const books = get(booksAtom);
  return books.find(book => book.id === bookId) || null;
});

// 书籍搜索关键词
export const bookSearchQueryAtom = atom<string>('');

// 搜索历史（最近在前，持久化）
export const searchHistoryAtom = atom<string[]>([]);

// 筛选后的书籍列表
export const filteredBooksAtom = atom<Book[]>(get => {
  const books = get(activeBooksAtom);
  const query = get(bookSearchQueryAtom).toLowerCase().trim();

  if (!query) return books;

  return books.filter(
    book =>
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query),
  );
});
