/**
 * 网络书源相关 hooks：添加在线书、按需抓取并缓存章节正文。
 */

import { useStore } from 'jotai';
import { booksAtom, chaptersAtom } from '../atoms';
import { Book, Chapter } from '../types/book';
import { addOnlineBook } from '../../utils/addOnlineBook';
import { getSourceById } from '../../services/source/registry';
import type { ParsedChapterContent } from '../../services/source/types';
import { saveBookChapters } from '../../utils/libraryStorage';
import type { RecognizedBook } from '../../services/recognize/recognizer';
import {
  fetchRenderedContent,
  cleanRenderedText,
} from '../../services/browserFetch/bridge';

// 懒加载正文后按书防抖落盘：整册 JSON 重写较重，短时间多次翻章合并成一次写入。
const CACHE_DEBOUNCE_MS = 1000;
export const BOOKSHUKU_CONTENT_VERSION = 8;
const KNOWN_BOOK_TITLES = ['捞尸人'];
const BAD_CHAPTER_TITLES = new Set([
  '恭喜',
  '恭喜!',
  '恭喜！',
  '心动时刻',
  '温馨提醒',
  '漫画主页',
  '外围名媛',
  '约爱社区',
  '👏💦约爱社区',
]);
const ENSURE_CHAPTER_TIMEOUT_MS = 45000;
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

function unpackChapterContent(result: ParsedChapterContent): {
  content: string;
  title?: string;
  nextPageUrl?: string;
  complete?: boolean;
} {
  return typeof result === 'string' ? { content: result } : result;
}

function isBlockedBookshukuText(content: string): boolean {
  const normalized = content.replace(/\s+/g, '');
  return (
    /请在浏览器中打开/.test(content) ||
    /当前环境无法直接下载/.test(content) ||
    /点击右上角.*按钮/.test(content) ||
    /复制链接到浏览器/.test(content) ||
    /Just a moment/i.test(content) ||
    /Enable JavaScript and cookies/i.test(content) ||
    /外围名媛|福利姬|自慰|口交|成人视频|性感女性|访问权限|立即下载|约爱社区/.test(normalized) ||
    /👁️/.test(content) ||
    normalized.length < 200
  );
}

function titleWithoutChapterPrefix(title: string): string {
  return title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadChapterTitle(title: string): boolean {
  const normalized = title.replace(/[>»›]+/g, ' ').replace(/\s+/g, ' ').trim();
  const suffix = titleWithoutChapterPrefix(normalized);
  return BAD_CHAPTER_TITLES.has(normalized) || BAD_CHAPTER_TITLES.has(suffix);
}

function isFallbackChapterTitle(title: string): boolean {
  const normalized = title.replace(/[>»›]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    // bookshuku 的目录页经常只有阿拉伯数字占位标题；页面 <title> 返回的
    // “第四百五十章”这类中文数字章名反而是真实标题，不能在这里误判成兜底名。
    /^第\s*\d+\s*章$/.test(title) ||
    /^分节阅读\s*\d+$/.test(title) ||
    isBadChapterTitle(normalized) ||
    KNOWN_BOOK_TITLES.some(
      bookTitle =>
        normalized === bookTitle ||
        new RegExp(`^第\\s*\\d+\\s*章\\s+${bookTitle}$`).test(normalized),
    )
  );
}

function titleFromFirstSentence(content: string): string | undefined {
  const firstLine = content
    .split(/\n+/)
    .map(line => line.trim())
    .find(Boolean);
  if (!firstLine) return undefined;
  const sentenceEnd = firstLine.search(/[。！？!?]/);
  const title =
    sentenceEnd >= 0 ? firstLine.slice(0, sentenceEnd + 1) : firstLine;
  return sanitizeChapterTitleCandidate(title.slice(0, 36));
}

function numberPrefix(chapter: Chapter): string {
  return `第${chapter.order + 1}章`;
}

function withChapterNumber(chapter: Chapter, title: string): string {
  const normalized = sanitizeChapterTitleCandidate(title);
  if (!normalized) return numberPrefix(chapter);
  const chapterHeading =
    /^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/.exec(
      normalized,
    )?.[0];
  if (chapterHeading) {
    return normalized.replace(/\s+/g, ' ').trim();
  }
  return `${numberPrefix(chapter)} ${normalized}`;
}

function sanitizeChapterTitleCandidate(title?: string): string | undefined {
  if (!title) return undefined;
  const normalized = title
    .replace(/[>»›]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > 40) return undefined;
  if (KNOWN_BOOK_TITLES.includes(normalized)) return undefined;
  if (isBadChapterTitle(normalized)) return undefined;
  if (/^(目录|首页|上一章|下一章|返回书页)$/.test(normalized)) return undefined;
  return normalized;
}

function resolveChapterTitle(
  chapter: Chapter,
  parsedTitle: string | undefined,
  content: string,
): string {
  if (!isFallbackChapterTitle(chapter.title)) {
    return withChapterNumber(chapter, chapter.title);
  }
  // 目录兜底名（第N章/分节阅读N）只在正文加载后修正：优先页面真实标题，
  // 若页面没有标题，再用正文第一句话，避免为了标题提前抓取全书。
  const cleanParsedTitle = sanitizeChapterTitleCandidate(parsedTitle);
  if (cleanParsedTitle && !isFallbackChapterTitle(cleanParsedTitle)) {
    return withChapterNumber(chapter, cleanParsedTitle);
  }
  return withChapterNumber(
    chapter,
    titleFromFirstSentence(content) || chapter.title,
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
    if (existing) {
      const currentChapters = store.get(chaptersAtom)[book.id] ?? [];
      const contentBySource = new Map(
        currentChapters
          .filter(c => c.content && c.sourceUrl)
          .map(c => [c.sourceUrl!, c.content]),
      );
      const mergedChapters = chapters.map(c => {
        const cachedContent = c.sourceUrl ? contentBySource.get(c.sourceUrl) : undefined;
        return cachedContent
          ? { ...c, content: cachedContent, wordCount: cachedContent.length }
          : c;
      });

      // 同一本网络书重新添加时刷新目录：书源结构修复或站点更新后，避免继续复用旧的错误目录。
      store.set(booksAtom, prev =>
        prev.map(b =>
          b.id === book.id
            ? {
                ...b,
                title: book.title,
                author: book.author,
                cover: book.cover,
                description: book.description,
                totalChapters: mergedChapters.length,
                source: book.source,
                updatedAt: Date.now(),
              }
            : b,
        ),
      );
      store.set(chaptersAtom, prev => ({ ...prev, [book.id]: mergedChapters }));
      saveBookChapters(book.id, mergedChapters).catch(error => {
        console.warn('[useAddOnlineBook] refresh catalog failed', error);
      });
      return { ...existing, ...book, totalChapters: mergedChapters.length };
    }

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
 * 把内置浏览器识别到的页面加入书架（章节仅存标题+URL，正文留待后续在浏览器会话内抓取）。
 * 稳定 id：来源主机 + 详情页 URL 里的数字（取不到则退回 URL 本身），同页重复识别可复用。
 * 已存在同 id 的书直接复用，避免重复入库。
 */
export const useAddRecognizedBook = () => {
  const store = useStore();

  return async (data: RecognizedBook): Promise<Book> => {
    const idFromUrl =
      (data.url.match(/(\d{2,})/g) || []).join('_') ||
      data.url.replace(/[^a-z0-9]+/gi, '').slice(-16) ||
      String(Date.now());
    const bookId = `browser:${data.host}:${idFromUrl}`;

    const existing = store.get(booksAtom).find(b => b.id === bookId);
    if (existing) return existing;

    const now = Date.now();
    const book: Book = {
      id: bookId,
      title: data.title?.trim() || '未命名书籍',
      author: data.author?.trim() || '佚名',
      cover: data.cover || undefined,
      addedAt: now,
      updatedAt: now,
      progress: 0,
      totalChapters: data.chapters.length,
      // 浏览器识别源：host 作为来源名（无注册 BookSource），bookUrl 存详情页。
      source: { name: data.host, bookUrl: data.url },
    };
    const chapters: Chapter[] = data.chapters.map((c, i) => ({
      id: `${bookId}-${i}`,
      bookId,
      title: c.title,
      content: '',
      order: i,
      sourceUrl: c.url,
    }));

    store.set(booksAtom, prev => [...prev, book]);
    store.set(chaptersAtom, prev => ({ ...prev, [book.id]: chapters }));
    saveBookChapters(book.id, chapters).catch(error => {
      console.warn('[useAddRecognizedBook] save catalog failed', error);
    });
    return book;
  };
};

/**
 * 确保某章正文已就绪：已有正文直接返回；否则按书源抓取、回填内存并缓存落盘。
 * 抓取失败会抛错，交由调用方（阅读器）切到 error 态。
 */
interface EnsureChapterOptions {
  background?: boolean;
}

export const useEnsureChapterContent = () => {
  const store = useStore();

  return async (
    bookId: string,
    index: number,
    options: EnsureChapterOptions = {},
  ): Promise<Chapter | null> => {
    const startedAt = Date.now();
    let chapters = store.get(chaptersAtom)[bookId];
    let chapter = chapters?.[index];
    if (!chapter) return null;

    const book = store.get(booksAtom).find(b => b.id === bookId);
    const isBookshuku = book?.source?.name === 'bookshuku';
    console.info('[useOnlineBook] ensure start', {
      bookId,
      index,
      title: chapter.title,
      source: book?.source?.name,
      cached: !!chapter.content,
      contentVersion: chapter.contentVersion,
      contentComplete: chapter.contentComplete,
      nextPageUrl: chapter.nextPageUrl,
    });
    if (
      chapter.content &&
      (!isBookshuku ||
        (chapter.contentVersion === BOOKSHUKU_CONTENT_VERSION &&
          !isBlockedBookshukuText(chapter.content) &&
          !isFallbackChapterTitle(chapter.title)))
    ) {
      console.info('[useOnlineBook] ensure cache hit', {
        bookId,
        index,
        ms: Date.now() - startedAt,
        length: chapter.content.length,
      });
      return chapter;
    }
    if (!book?.source || !chapter.sourceUrl) return chapter; // 非在线书或缺 URL：按空正文处理

    // 注册书源（bookshuku/mingzw…）走 fetch 解析；浏览器识别源（source 为站点 host、
    // 无注册书源）走隐藏 WebView 取渲染后正文。
    const source = getSourceById(book.source.name);
    let content: string;
    let parsedMeta: Pick<
      ReturnType<typeof unpackChapterContent>,
      'nextPageUrl' | 'complete'
    > = {};
    if (source) {
      const needsCatalogRefresh =
        source.id === 'bookshuku' &&
        chapters &&
        (chapters.length <= 20 || chapters.some(c => /^分节阅读\s*\d+$/.test(c.title)));
      if (needsCatalogRefresh) {
        console.info('[useOnlineBook] refresh stale catalog start', {
          bookId,
          index,
          oldCount: chapters.length,
        });
        const metas = await source.parseCatalog({
          sourceBookId: source.extractId(book.source.bookUrl) ?? '',
          title: book.title,
          author: book.author,
          catalogUrl: book.source.bookUrl,
        });
        const contentBySource = new Map(
          chapters
            .filter(c => c.content && c.sourceUrl)
            .map(c => [c.sourceUrl!, c.content]),
        );
        const refreshed = metas.map((m, i) => {
          const cachedContent = contentBySource.get(m.url);
          return {
            id: `${bookId}-${i}`,
            bookId,
            title: m.title,
            content: cachedContent ?? '',
            order: i,
            sourceUrl: m.url,
            wordCount: cachedContent ? cachedContent.length : undefined,
          };
        });

        // 兼容旧版本错误目录：打开章节时自愈，避免用户必须删书重加才能得到完整 754 章目录。
        store.set(chaptersAtom, prev => ({ ...prev, [bookId]: refreshed }));
        store.set(booksAtom, prev =>
          prev.map(b =>
            b.id === bookId
              ? { ...b, totalChapters: refreshed.length, updatedAt: Date.now() }
              : b,
          ),
        );
        saveBookChapters(bookId, refreshed).catch(error => {
          console.warn('[useOnlineBook] refresh stale catalog failed', error);
        });
        console.info('[useOnlineBook] refresh stale catalog done', {
          bookId,
          oldCount: chapters.length,
          newCount: refreshed.length,
          ms: Date.now() - startedAt,
        });
        chapters = refreshed;
        chapter = refreshed[index];
        if (!chapter?.sourceUrl) return chapter ?? null;
      }
      console.info('[useOnlineBook] parse chapter start', {
        bookId,
        index,
        url: chapter.sourceUrl,
      });
      const parsed = unpackChapterContent(
        await withTimeout(
          source.parseChapterContent(chapter.sourceUrl, {
            priority: options.background ? 'low' : 'high',
          }),
          ENSURE_CHAPTER_TIMEOUT_MS,
          `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
        ),
      );
      content = parsed.content;
      if (source.id === 'bookshuku' && isBlockedBookshukuText(content)) {
        throw new Error('书源返回浏览器打开提示页，未拿到章节正文');
      }
      parsedMeta = {
        nextPageUrl: parsed.nextPageUrl,
        complete: parsed.complete,
      };
      chapter = {
        ...chapter,
        title: resolveChapterTitle(chapter, parsed.title, content),
      };
    } else {
      const raw = await withTimeout(
        fetchRenderedContent(chapter.sourceUrl),
        ENSURE_CHAPTER_TIMEOUT_MS,
        `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
      );
      content = cleanRenderedText(raw, chapter.title);
      if (isBookshuku && isBlockedBookshukuText(content)) {
        throw new Error('书源返回浏览器打开提示页，未拿到章节正文');
      }
      chapter = {
        ...chapter,
        title: resolveChapterTitle(chapter, undefined, content),
      };
    }

    const filled: Chapter = {
      ...chapter,
      content,
      wordCount: content.length,
      contentVersion: isBookshuku ? BOOKSHUKU_CONTENT_VERSION : chapter.contentVersion,
      nextPageUrl: parsedMeta.nextPageUrl,
      contentComplete: parsedMeta.complete ?? !parsedMeta.nextPageUrl,
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

    console.info('[useOnlineBook] ensure done', {
      bookId,
      index,
      title: filled.title,
      ms: Date.now() - startedAt,
      length: filled.content.length,
      contentComplete: filled.contentComplete,
      nextPageUrl: filled.nextPageUrl,
    });
    return filled;
  };
};

/**
 * 分页章节续载：目录仍是一章，只在读到章尾时按 nextPageUrl 追加下一子页。
 * 这条路径只处理已缓存当前页的章节，失败时保留已读内容并把错误交给阅读器提示重试。
 */
export const useLoadNextChapterPage = () => {
  const store = useStore();

  return async (bookId: string, index: number): Promise<Chapter | null> => {
    const startedAt = Date.now();
    const chapters = store.get(chaptersAtom)[bookId];
    const chapter = chapters?.[index];
    const book = store.get(booksAtom).find(b => b.id === bookId);
    const source = book?.source ? getSourceById(book.source.name) : null;
    if (!chapter || !chapter.nextPageUrl || !source) return chapter ?? null;

    console.info('[useOnlineBook] load next page start', {
      bookId,
      index,
      title: chapter.title,
      url: chapter.nextPageUrl,
      currentLength: chapter.content.length,
    });

    const parsed = unpackChapterContent(
      await withTimeout(
        source.parseChapterContent(chapter.nextPageUrl, { priority: 'high' }),
        ENSURE_CHAPTER_TIMEOUT_MS,
        `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
      ),
    );
    const content = chapter.content
      ? `${chapter.content}\n${parsed.content}`
      : parsed.content;
    if (source.id === 'bookshuku' && isBlockedBookshukuText(parsed.content)) {
      throw new Error('书源返回浏览器打开提示页，未拿到章节分页正文');
    }
    const filled: Chapter = {
      ...chapter,
      title: resolveChapterTitle(chapter, parsed.title, content),
      content,
      wordCount: content.length,
      contentVersion:
        source.id === 'bookshuku'
          ? BOOKSHUKU_CONTENT_VERSION
          : chapter.contentVersion,
      nextPageUrl: parsed.nextPageUrl,
      contentComplete: parsed.complete ?? !parsed.nextPageUrl,
    };

    let nextForBook: Chapter[] | undefined;
    store.set(chaptersAtom, prev => {
      const list = prev[bookId];
      if (!list) return prev;
      const next = list.map(c => (c.id === filled.id ? filled : c));
      nextForBook = next;
      return { ...prev, [bookId]: next };
    });
    if (nextForBook) scheduleCache(bookId, nextForBook);

    console.info('[useOnlineBook] load next page done', {
      bookId,
      index,
      ms: Date.now() - startedAt,
      length: filled.content.length,
      contentComplete: filled.contentComplete,
      nextPageUrl: filled.nextPageUrl,
    });
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
      if (
        !ch ||
        !ch.sourceUrl ||
        (ch.content &&
          (source.id !== 'bookshuku' ||
            (ch.contentVersion === BOOKSHUKU_CONTENT_VERSION &&
              !isBlockedBookshukuText(ch.content))))
      ) {
        continue;
      }
      try {
        let parsed = unpackChapterContent(
          await source.parseChapterContent(ch.sourceUrl, { priority: 'low' }),
        );
        if (source.id === 'bookshuku' && isBlockedBookshukuText(parsed.content)) {
          throw new Error('书源返回浏览器打开提示页，未拿到章节正文');
        }
        const firstParsedTitle = parsed.title;
        let fullContent = parsed.content;
        let nextPageUrl = parsed.nextPageUrl;
        let contentComplete = parsed.complete ?? !nextPageUrl;
        while (nextPageUrl && !signal?.aborted) {
          // 整本缓存需要完整章节；这里沿用分页元数据顺序抓取，阅读器按需加载不受影响。
          parsed = unpackChapterContent(
            await source.parseChapterContent(nextPageUrl, { priority: 'low' }),
          );
          if (
            source.id === 'bookshuku' &&
            isBlockedBookshukuText(parsed.content)
          ) {
            throw new Error('书源返回浏览器打开提示页，未拿到章节分页正文');
          }
          fullContent = `${fullContent}\n${parsed.content}`;
          nextPageUrl = parsed.nextPageUrl;
          contentComplete = parsed.complete ?? !nextPageUrl;
        }
        if (signal?.aborted) {
          if (sinceFlush > 0) await flush();
          return { done, total, cancelled: true };
        }
        const filled: Chapter = {
          ...ch,
          title: resolveChapterTitle(ch, firstParsedTitle, fullContent),
          content: fullContent,
          wordCount: fullContent.length,
          contentVersion:
            source.id === 'bookshuku'
              ? BOOKSHUKU_CONTENT_VERSION
              : ch.contentVersion,
          nextPageUrl,
          contentComplete,
        };
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
