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

export interface CacheProgress {
  done: number;
  total: number;
  cancelled?: boolean; // 被 signal 中断时为 true（done < total 属正常停止而非失败）
}

/**
 * 缓存整本在线书：串行抓取所有缺正文的章节并落盘，供离线阅读。已缓存的跳过。
 * onProgress 回报进度；单章失败不中断，最终返回实际完成数（done < total 即部分失败）。
 * 串行是刻意的：并发抓取容易触发书源限流/封禁。
 *
 * 传入 signal 可中断：每章开始前检查，已中断则落盘当前进度后返回 { cancelled: true }。
 * 用于用户离开详情页或主动停止，避免后台继续消耗流量/请求配额。
 */
export const useCacheWholeBook = () => {
  const store = useStore();

  return async (
    bookId: string,
    onProgress?: (p: CacheProgress) => void,
    signal?: AbortSignal,
  ): Promise<CacheProgress> => {
    const book = store.get(booksAtom).find(b => b.id === bookId);
    const source = book?.source ? getSourceById(book.source.name) : null;
    const initial = store.get(chaptersAtom)[bookId];
    if (!source || !initial) return { done: 0, total: 0 };

    const total = initial.length;
    let done = initial.filter(c => c.content).length;
    onProgress?.({ done, total });

    // 每抓够若干章就落一次盘：整本 700+ 章耗时较长，中途关闭/断网也能保住已抓进度。
    const FLUSH_EVERY = 20;
    let sinceFlush = 0;
    const flush = async () => {
      const list = store.get(chaptersAtom)[bookId];
      if (list) {
        await saveBookChapters(bookId, list).catch(error => {
          console.warn('[useCacheWholeBook] save failed', error);
        });
      }
      sinceFlush = 0;
    };

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        if (sinceFlush > 0) await flush();
        return { done, total, cancelled: true };
      }
      const ch = store.get(chaptersAtom)[bookId]?.[i];
      if (!ch || ch.content || !ch.sourceUrl) continue;
      try {
        const content = await source.parseChapterContent(ch.sourceUrl);
        const filled: Chapter = { ...ch, content, wordCount: content.length };
        store.set(chaptersAtom, prev => {
          const list = prev[bookId];
          if (!list) return prev;
          return { ...prev, [bookId]: list.map(c => (c.id === filled.id ? filled : c)) };
        });
        done += 1;
        sinceFlush += 1;
        onProgress?.({ done, total });
        if (sinceFlush >= FLUSH_EVERY) await flush();
      } catch {
        // 单章失败静默跳过，继续抓下一章。
      }
    }

    if (sinceFlush > 0) await flush();
    return { done, total };
  };
};

/**
 * 检查在线书更新：重拉目录，把超出现有数量的新章节追加进来（正文留空，阅读时懒加载）。
 * 返回新增章节数。假定书源目录按顺序追加新章（连载站点常态）；不处理中途插入/重排。
 */
export const useCheckBookUpdate = () => {
  const store = useStore();

  return async (bookId: string): Promise<number> => {
    const book = store.get(booksAtom).find(b => b.id === bookId);
    const source = book?.source ? getSourceById(book.source.name) : null;
    if (!source || !book?.source) return 0;

    const metas = await source.parseCatalog({
      sourceBookId: '',
      title: book.title,
      author: book.author,
      catalogUrl: book.source.bookUrl,
    });
    const existing = store.get(chaptersAtom)[bookId] ?? [];
    if (metas.length <= existing.length) return 0;

    const added: Chapter[] = metas.slice(existing.length).map((m, i) => ({
      id: `${bookId}-${existing.length + i}`,
      bookId,
      title: m.title,
      content: '',
      order: existing.length + i,
      sourceUrl: m.url,
    }));
    const next = [...existing, ...added];

    store.set(chaptersAtom, prev => ({ ...prev, [bookId]: next }));
    store.set(booksAtom, prev =>
      prev.map(b =>
        b.id === bookId
          ? { ...b, totalChapters: next.length, updatedAt: Date.now() }
          : b,
      ),
    );
    await saveBookChapters(bookId, next).catch(error => {
      console.warn('[useCheckBookUpdate] save failed', error);
    });
    return added.length;
  };
};
