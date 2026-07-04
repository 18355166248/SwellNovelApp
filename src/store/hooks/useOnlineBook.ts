/**
 * 网络书源相关 hooks：添加在线书、按需抓取并缓存章节正文。
 */

import { useStore } from 'jotai';
import { booksAtom, chaptersAtom } from '../atoms';
import { Book, Chapter } from '../types/book';
import { addOnlineBook } from '../../utils/addOnlineBook';
import { getSourceById } from '../../services/source/registry';
import { saveBookChapters } from '../../utils/libraryStorage';

// 懒加载正文后按书防抖落盘：整册 JSON 重写较重，短时间多次翻章合并成一次写入。
const CACHE_DEBOUNCE_MS = 1000;
const cacheTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCache(bookId: string, chapters: Chapter[]) {
  const existing = cacheTimers.get(bookId);
  if (existing) clearTimeout(existing);
  cacheTimers.set(
    bookId,
    setTimeout(() => {
      cacheTimers.delete(bookId);
      saveBookChapters(bookId, chapters).catch(error => {
        console.warn('[useOnlineBook] cache chapters failed', error);
      });
    }, CACHE_DEBOUNCE_MS),
  );
}

/**
 * 添加在线书籍：解析 URL → 入库 → 持久化目录。返回入库的 Book。
 * 已存在同 id 的书则直接复用（避免重复添加，保留已缓存正文）。
 */
export const useAddOnlineBook = () => {
  const store = useStore();

  return async (url: string): Promise<Book> => {
    const { book, chapters } = await addOnlineBook(url);

    const existing = store.get(booksAtom).find(b => b.id === book.id);
    if (existing) return existing;

    store.set(booksAtom, prev => [...prev, book]);
    store.set(chaptersAtom, prev => ({ ...prev, [book.id]: chapters }));
    // 目录（标题 + sourceUrl，无正文）立即落盘，重启后无需重新解析。
    saveBookChapters(book.id, chapters).catch(error => {
      console.warn('[useAddOnlineBook] save catalog failed', error);
    });
    return book;
  };
};

/**
 * 确保某章正文已就绪：已有正文直接返回；否则按书源抓取、回填内存并缓存落盘。
 * 抓取失败会抛错，交由调用方（阅读器）切到 error 态。
 */
export const useEnsureChapterContent = () => {
  const store = useStore();

  return async (bookId: string, index: number): Promise<Chapter | null> => {
    const chapters = store.get(chaptersAtom)[bookId];
    const chapter = chapters?.[index];
    if (!chapter) return null;
    if (chapter.content) return chapter;

    const book = store.get(booksAtom).find(b => b.id === bookId);
    const source = book?.source ? getSourceById(book.source.name) : null;
    if (!source || !chapter.sourceUrl) return chapter; // 非在线书或缺 URL：按空正文处理

    const content = await source.parseChapterContent(chapter.sourceUrl);
    const filled: Chapter = {
      ...chapter,
      content,
      wordCount: content.length,
    };

    let nextForBook: Chapter[] | undefined;
    store.set(chaptersAtom, prev => {
      const list = prev[bookId];
      // 抓取期间列表可能被其它入口替换：以最新引用为准，按 id 精确回填。
      if (!list) return prev;
      const next = list.map(c => (c.id === filled.id ? filled : c));
      nextForBook = next;
      return { ...prev, [bookId]: next };
    });
    if (nextForBook) scheduleCache(bookId, nextForBook);

    return filled;
  };
};
