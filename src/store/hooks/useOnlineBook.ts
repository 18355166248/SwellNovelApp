/**
 * 网络书源相关 hooks：添加在线书、按需抓取并缓存章节正文。
 */

import { useStore } from 'jotai';
import {
  bookmarksAtom,
  booksAtom,
  chaptersAtom,
  currentChapterContentAtom,
  currentChapterIndexAtom,
  readingHistoryAtom,
  selectedBookIdAtom,
} from '../atoms';
import { Book, Chapter } from '../types/book';
import { addOnlineBook } from '../../utils/addOnlineBook';
import { getSourceById } from '../../services/source/registry';
import type { ParsedChapterContent } from '../../services/source/types';
import {
  isInvalidOnlineChapterContent,
  isOnlineChapterCacheUsable,
  BROWSER_CONTENT_VERSION,
  ONLINE_CONTENT_VERSION,
} from '../../services/source/contentQuality';
import { isBlockedText } from '../../services/source/contentGuards';
import { collectChapterPages } from '../../services/source/chapterPages';
import { loadBookChapters, saveBookChapters } from '../../utils/libraryStorage';
import { calculateReadingProgress } from '../../utils/readingProgressPercent';
import {
  isBadBookshukuCatalog,
  isSafeBookshukuCatalogReplacement,
} from '../../utils/bookCatalogQuality';
import {
  migrateCatalogReferences,
  migrateReaderSelection,
  progressAfterCatalogRepair,
  repairCatalogPreservingIdentity,
} from '../../utils/catalogRepair';
import type { RecognizedBook } from '../../services/recognize/recognizer';
import {
  fetchRenderedChapterPage,
  cleanRenderedText,
} from '../../services/browserFetch/bridge';

// 懒加载正文后按书防抖落盘：整册 JSON 重写较重，短时间多次翻章合并成一次写入。
const CACHE_DEBOUNCE_MS = 1000;
/** @deprecated 兼容旧引用；在线书源现在统一使用同一正文缓存版本。 */
export const BOOKSHUKU_CONTENT_VERSION = ONLINE_CONTENT_VERSION;
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
// 阅读器后台预取与用户主动切章可能同时命中同一章。按章节合并在途请求，
// 避免重复占用书源连接；前台切章会直接等待已经开始的预取结果。
const chapterContentRequests = new Map<string, Promise<Chapter | null>>();
const chapterPageRequests = new Map<string, Promise<Chapter | null>>();

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
  trustedShort?: boolean;
} {
  return typeof result === 'string' ? { content: result } : result;
}

function isCachedOnlineChapterUsable(
  chapter: Chapter | undefined,
  sourceName?: string,
): boolean {
  return (
    isOnlineChapterCacheUsable(chapter, sourceName) &&
    (sourceName !== 'bookshuku' || !isFallbackChapterTitle(chapter!.title))
  );
}

function titleWithoutChapterPrefix(title: string): string {
  return title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadChapterTitle(title: string): boolean {
  const normalized = title
    .replace(/[>»›]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const suffix = titleWithoutChapterPrefix(normalized);
  return BAD_CHAPTER_TITLES.has(normalized) || BAD_CHAPTER_TITLES.has(suffix);
}

function isFallbackChapterTitle(title: string): boolean {
  const normalized = title
    .replace(/[>»›]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function withChapterNumber(chapter: Chapter, title: string): string {
  const normalized = sanitizeChapterTitleCandidate(title);
  if (!normalized)
    return sanitizeChapterTitleCandidate(chapter.title) || '章节';
  const chapterHeading =
    /^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/.exec(
      normalized,
    )?.[0];
  if (chapterHeading) {
    return normalized.replace(/\s+/g, ' ').trim();
  }
  return normalized;
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
          .filter(
            c =>
              c.sourceUrl &&
              isCachedOnlineChapterUsable(c, existing.source?.name),
          )
          .map(c => [c.sourceUrl!, c]),
      );
      const mergedChapters = chapters.map(c => {
        const cached = c.sourceUrl
          ? contentBySource.get(c.sourceUrl)
          : undefined;
        return cached
          ? {
              ...c,
              content: cached.content,
              wordCount: cached.wordCount,
              contentVersion: cached.contentVersion,
              nextPageUrl: cached.nextPageUrl,
              contentComplete: cached.contentComplete,
            }
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
                // 同 id 的书可能正躺在回收站；用户再次添加即视为还原，
                // 否则后续跳详情页时会被 activeBooksAtom 过滤掉。
                deletedAt: undefined,
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
    if (existing) {
      // 同一详情页可能先导入第一页、后识别到完整分页目录；此时必须覆盖旧目录，
      // 否则用户点击“加入书架”后仍只能看到旧的 40 章。
      const chapters: Chapter[] = data.chapters.map((c, i) => ({
        id: `${bookId}-${i}`,
        bookId,
        title: c.title,
        content: '',
        order: i,
        sourceUrl: c.url,
      }));
      const updated: Book = {
        ...existing,
        title: data.title?.trim() || existing.title,
        author: data.author?.trim() || existing.author,
        cover: data.cover || existing.cover,
        totalChapters: chapters.length,
        updatedAt: Date.now(),
        // 浏览器再次识别同一本书也应恢复到书架，不能只刷新目录却保留回收站标记。
        deletedAt: undefined,
      };
      store.set(booksAtom, prev =>
        prev.map(book => (book.id === bookId ? updated : book)),
      );
      store.set(chaptersAtom, prev => ({ ...prev, [bookId]: chapters }));
      saveBookChapters(bookId, chapters).catch(error => {
        console.warn('[useAddRecognizedBook] refresh catalog failed', error);
      });
      return updated;
    }

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
    const sourceName = book?.source?.name;
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
    if (isCachedOnlineChapterUsable(chapter, sourceName)) {
      console.info('[useOnlineBook] ensure cache hit', {
        bookId,
        index,
        ms: Date.now() - startedAt,
        length: chapter.content.length,
      });
      return chapter;
    }
    if (!book?.source || !chapter.sourceUrl) return chapter; // 非在线书或缺 URL：按空正文处理
    const bookSource = book.source;

    const requestKey = `${bookId}:${chapter.id}`;
    const existingRequest = chapterContentRequests.get(requestKey);
    if (existingRequest) {
      console.info('[useOnlineBook] ensure join in-flight request', {
        bookId,
        index,
        title: chapter.title,
        background: !!options.background,
      });
      return existingRequest;
    }

    const request = (async (): Promise<Chapter | null> => {
      // 注册书源（bookshuku/mingzw…）走 fetch 解析；浏览器识别源（source 为站点 host、
      // 无注册书源）走隐藏 WebView 取渲染后正文。
      const source = getSourceById(bookSource.name);
      let content: string;
      let parsedMeta: Pick<
        ReturnType<typeof unpackChapterContent>,
        'nextPageUrl' | 'complete' | 'trustedShort'
      > = {};
      if (source) {
        const needsCatalogRefresh =
          source.id === 'bookshuku' &&
          chapters &&
          isBadBookshukuCatalog(source.id, chapters);
        if (needsCatalogRefresh) {
          console.info('[useOnlineBook] refresh stale catalog start', {
            bookId,
            index,
            oldCount: chapters.length,
          });
          const metas = await source.parseCatalog({
            sourceBookId: source.extractId(bookSource.bookUrl) ?? '',
            title: book.title,
            author: book.author,
            catalogUrl: bookSource.bookUrl,
          });
          const requestedChapterId = chapter.id;
          const existingForRepair = store.get(chaptersAtom)[bookId] ?? chapters;
          if (
            !isSafeBookshukuCatalogReplacement(
              source.id,
              existingForRepair,
              metas.map(meta => ({
                title: meta.title,
                sourceUrl: meta.url,
              })),
            )
          ) {
            // 临时空响应或半截目录不能覆盖本地数据，否则会永久丢失续读与书签引用。
            throw new Error('书源返回的目录仍不完整，已保留本地目录和阅读数据');
          }
          const latestBook =
            store.get(booksAtom).find(item => item.id === bookId) ?? book;
          const repaired = repairCatalogPreservingIdentity(
            bookId,
            existingForRepair,
            metas,
            cached => isCachedOnlineChapterUsable(cached, source.id),
          );
          const refreshed = repaired.chapters;
          const previousHistory = store.get(readingHistoryAtom)[bookId];
          const migratedReferences = migrateCatalogReferences(
            bookId,
            latestBook.currentChapterId,
            previousHistory,
            store.get(bookmarksAtom)[bookId] ?? [],
            refreshed,
            repaired.chapterIdMap,
          );
          const repairedProgress = progressAfterCatalogRepair(
            latestBook,
            existingForRepair,
            refreshed,
            previousHistory,
            repaired.chapterIdMap,
          );
          const migratedRequestedChapterId =
            repaired.chapterIdMap.get(requestedChapterId);
          const migratedRequestedChapter = migratedRequestedChapterId
            ? refreshed.find(item => item.id === migratedRequestedChapterId)
            : undefined;
          const readerTargetsBook = store.get(selectedBookIdAtom) === bookId;
          const migratedReaderSelection = migrateReaderSelection(
            existingForRepair,
            refreshed,
            readerTargetsBook ? store.get(currentChapterIndexAtom) : null,
            migratedReferences.currentChapterId,
            repaired.chapterIdMap,
          );

          // 目录和所有 chapterId 引用同步迁移；消失的旧章不按数组下标猜测，避免串章。
          store.set(chaptersAtom, prev => ({ ...prev, [bookId]: refreshed }));
          if (readerTargetsBook) {
            // Reader 仍持有旧数组索引；必须与目录替换同批迁移，否则旧 index=0
            // 会从“第690章”静默变成完整目录的“第1章”。
            store.set(
              currentChapterIndexAtom,
              migratedReaderSelection.chapterIndex,
            );
            store.set(
              currentChapterContentAtom,
              migratedReaderSelection.chapterContent,
            );
          }
          store.set(readingHistoryAtom, prev => {
            const next = { ...prev };
            if (migratedReferences.history) {
              next[bookId] = migratedReferences.history;
            } else {
              delete next[bookId];
            }
            return next;
          });
          store.set(bookmarksAtom, prev => {
            const next = { ...prev };
            if (migratedReferences.bookmarks.length > 0) {
              next[bookId] = migratedReferences.bookmarks;
            } else {
              delete next[bookId];
            }
            return next;
          });
          store.set(booksAtom, prev =>
            prev.map(b =>
              b.id === bookId
                ? {
                    ...b,
                    currentChapterId: migratedReferences.currentChapterId,
                    progress: repairedProgress,
                    totalChapters: refreshed.length,
                    updatedAt: Date.now(),
                  }
                : b,
            ),
          );
          saveBookChapters(bookId, refreshed).catch(error => {
            console.warn('[useOnlineBook] refresh stale catalog failed', error);
          });
          console.info('[useOnlineBook] refresh stale catalog done', {
            bookId,
            oldCount: existingForRepair.length,
            newCount: refreshed.length,
            ms: Date.now() - startedAt,
          });
          chapters = refreshed;
          if (!migratedRequestedChapter?.sourceUrl) {
            return migratedRequestedChapter ?? null;
          }
          chapter = migratedRequestedChapter;
        }
        console.info('[useOnlineBook] parse chapter start', {
          bookId,
          index,
          url: chapter.sourceUrl,
        });
        const sourceUrl = chapter.sourceUrl;
        if (!sourceUrl) return chapter;
        const parsed = unpackChapterContent(
          await withTimeout(
            source.parseChapterContent(sourceUrl, {
              priority: options.background ? 'low' : 'high',
            }),
            ENSURE_CHAPTER_TIMEOUT_MS,
            `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
          ),
        );
        content = parsed.content;
        if (
          isInvalidOnlineChapterContent(content, {
            trustedShort: parsed.trustedShort,
          })
        ) {
          throw new Error('书源返回正文不完整，未写入章节缓存');
        }
        parsedMeta = {
          nextPageUrl: parsed.nextPageUrl,
          complete: parsed.complete,
          trustedShort: parsed.trustedShort,
        };
        chapter = {
          ...chapter,
          title: resolveChapterTitle(chapter, parsed.title, content),
        };
      } else {
        const sourceUrl = chapter.sourceUrl;
        if (!sourceUrl) return chapter;
        const rendered = await withTimeout(
          fetchRenderedChapterPage(sourceUrl, {
            priority: options.background ? 'low' : 'high',
          }),
          ENSURE_CHAPTER_TIMEOUT_MS,
          `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
        );
        content = cleanRenderedText(rendered.content, chapter.title);
        if (isInvalidOnlineChapterContent(content)) {
          throw new Error('网页返回正文不完整，未写入章节缓存');
        }
        chapter = {
          ...chapter,
          title: resolveChapterTitle(chapter, undefined, content),
        };
        // 站点把一章拆成多个网页子页时，这里一次性读完再入库，让阅读器拿到完整
        // 章节，而不是读到章尾才现拉下一页。中途失败保留 nextPageUrl 交给续载兜底。
        const chapterTitle = chapter.title;
        const merged = await collectChapterPages({
          firstContent: content,
          firstNextPageUrl: rendered.nextPageUrl,
          fetchPage: pageUrl =>
            withTimeout(
              fetchRenderedChapterPage(pageUrl, {
                priority: options.background ? 'low' : 'high',
              }),
              ENSURE_CHAPTER_TIMEOUT_MS,
              `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
            ),
          cleanPage: raw => cleanRenderedText(raw, chapterTitle),
          onError: (pageUrl, error) => {
            console.warn('[useOnlineBook] merge chapter page failed', {
              bookId,
              index,
              url: pageUrl,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        });
        content = merged.content;
        parsedMeta = {
          nextPageUrl: merged.nextPageUrl,
          complete: !merged.nextPageUrl,
        };
      }

      const filled: Chapter = {
        ...chapter,
        content,
        wordCount: content.length,
        contentVersion: ONLINE_CONTENT_VERSION,
        browserContentVersion: source ? undefined : BROWSER_CONTENT_VERSION,
        contentTrustedShort: parsedMeta.trustedShort,
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
    })();

    chapterContentRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      // 只清理由本次调用登记的 Promise，避免旧请求 finally 误删后来的重试。
      if (chapterContentRequests.get(requestKey) === request) {
        chapterContentRequests.delete(requestKey);
      }
    }
  };
};

/**
 * 分页章节续载：目录仍是一章，只在读到章尾时按 nextPageUrl 追加下一子页。
 * 这条路径只处理已缓存当前页的章节，失败时保留已读内容并把错误交给阅读器提示重试。
 */
export const useLoadNextChapterPage = () => {
  const store = useStore();

  return async (
    bookId: string,
    index: number,
    options: EnsureChapterOptions = {},
  ): Promise<Chapter | null> => {
    const startedAt = Date.now();
    const chapters = store.get(chaptersAtom)[bookId];
    const chapter = chapters?.[index];
    const book = store.get(booksAtom).find(b => b.id === bookId);
    const source = book?.source ? getSourceById(book.source.name) : null;
    if (!chapter || !chapter.nextPageUrl || !book?.source)
      return chapter ?? null;

    const requestKey = `${bookId}:${chapter.id}:${chapter.nextPageUrl}`;
    const existingRequest = chapterPageRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = (async (): Promise<Chapter | null> => {
      console.info('[useOnlineBook] load next page start', {
        bookId,
        index,
        title: chapter.title,
        url: chapter.nextPageUrl,
        currentLength: chapter.content.length,
      });

      const requestedPageUrl = chapter.nextPageUrl!;
      const parsed: ReturnType<typeof unpackChapterContent> = source
        ? unpackChapterContent(
            await withTimeout(
              source.parseChapterContent(requestedPageUrl, {
                priority: options.background ? 'low' : 'high',
              }),
              ENSURE_CHAPTER_TIMEOUT_MS,
              `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
            ),
          )
        : await (async (): Promise<ReturnType<typeof unpackChapterContent>> => {
            const rendered = await withTimeout(
              fetchRenderedChapterPage(requestedPageUrl, {
                priority: options.background ? 'low' : 'high',
              }),
              ENSURE_CHAPTER_TIMEOUT_MS,
              `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
            );
            return {
              content: cleanRenderedText(rendered.content, chapter.title),
              nextPageUrl: rendered.nextPageUrl,
              complete: !rendered.nextPageUrl,
            };
          })();
      const content = chapter.content
        ? `${chapter.content}\n${parsed.content}`
        : parsed.content;
      // 子页是整章的一部分，尾页天然可能很短。浏览器识别源没有书源级的短章确认，
      // 只挡空白页和广告/拦截页；注册书源仍按自己的 trustedShort 口径校验。
      const invalidPage = source
        ? isInvalidOnlineChapterContent(parsed.content, {
            trustedShort: parsed.trustedShort,
          })
        : !parsed.content || isBlockedText(parsed.content);
      if (invalidPage) {
        throw new Error('书源返回分页正文不完整，未写入章节缓存');
      }
      const filled: Chapter = {
        ...chapter,
        title: resolveChapterTitle(chapter, parsed.title, content),
        content,
        wordCount: content.length,
        contentVersion: ONLINE_CONTENT_VERSION,
        browserContentVersion: source ? undefined : BROWSER_CONTENT_VERSION,
        contentTrustedShort:
          content.replace(/\s+/g, '').length < 200
            ? !!chapter.contentTrustedShort && !!parsed.trustedShort
            : undefined,
        nextPageUrl: parsed.nextPageUrl,
        contentComplete: parsed.complete ?? !parsed.nextPageUrl,
      };

      let nextForBook: Chapter[] | undefined;
      store.set(chaptersAtom, prev => {
        const list = prev[bookId];
        if (!list) return prev;
        const latest = list.find(c => c.id === filled.id);
        // 快速翻页可能在请求返回前已完成同一子页；只允许仍指向本次 URL 的请求落盘。
        if (latest?.nextPageUrl !== requestedPageUrl) return prev;
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
    })();

    chapterPageRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (chapterPageRequests.get(requestKey) === request) {
        chapterPageRequests.delete(requestKey);
      }
    }
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
    let done = initial.filter(c =>
      isCachedOnlineChapterUsable(c, source.id),
    ).length;
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
      if (!ch || !ch.sourceUrl || isCachedOnlineChapterUsable(ch, source.id)) {
        continue;
      }
      try {
        let parsed = unpackChapterContent(
          await source.parseChapterContent(ch.sourceUrl, { priority: 'low' }),
        );
        if (
          isInvalidOnlineChapterContent(parsed.content, {
            trustedShort: parsed.trustedShort,
          })
        ) {
          throw new Error('书源返回正文不完整，未写入章节缓存');
        }
        const firstParsedTitle = parsed.title;
        let fullContent = parsed.content;
        let nextPageUrl = parsed.nextPageUrl;
        let contentComplete = parsed.complete ?? !nextPageUrl;
        let allPartsTrustedShort = !!parsed.trustedShort;
        while (nextPageUrl && !signal?.aborted) {
          // 整本缓存需要完整章节；这里沿用分页元数据顺序抓取，阅读器按需加载不受影响。
          parsed = unpackChapterContent(
            await source.parseChapterContent(nextPageUrl, { priority: 'low' }),
          );
          if (
            isInvalidOnlineChapterContent(parsed.content, {
              trustedShort: parsed.trustedShort,
            })
          ) {
            throw new Error('书源返回分页正文不完整，未写入章节缓存');
          }
          fullContent = `${fullContent}\n${parsed.content}`;
          nextPageUrl = parsed.nextPageUrl;
          contentComplete = parsed.complete ?? !nextPageUrl;
          allPartsTrustedShort = allPartsTrustedShort && !!parsed.trustedShort;
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
          contentVersion: ONLINE_CONTENT_VERSION,
          contentTrustedShort:
            fullContent.replace(/\s+/g, '').length < 200
              ? allPartsTrustedShort
              : undefined,
          nextPageUrl,
          contentComplete,
        };
        store.set(chaptersAtom, prev => {
          const list = prev[bookId];
          if (!list) return prev;
          return {
            ...prev,
            [bookId]: list.map(c => (c.id === filled.id ? filled : c)),
          };
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
    const sourceBookId = source.extractId(book.source.bookUrl) ?? '';

    const metas = await source.parseCatalog({
      sourceBookId,
      title: book.title,
      author: book.author,
      catalogUrl: book.source.bookUrl,
    });
    let existing = store.get(chaptersAtom)[bookId];
    if (!existing) {
      // 章节正文按书懒加载。追更可能发生在用户尚未打开书籍时，必须先恢复旧目录，
      // 否则会把远端整本目录误判成新增章节，并覆盖本地已缓存正文。
      const loaded = (await loadBookChapters(bookId)) ?? [];
      store.set(chaptersAtom, prev =>
        prev[bookId] ? prev : { ...prev, [bookId]: loaded },
      );
      existing = store.get(chaptersAtom)[bookId] ?? loaded;
    }
    const shouldReplaceCatalog = isBadBookshukuCatalog(source.id, existing);
    if (
      shouldReplaceCatalog &&
      !isSafeBookshukuCatalogReplacement(
        source.id,
        existing,
        metas.map(meta => ({ title: meta.title, sourceUrl: meta.url })),
      )
    ) {
      // 更新检查同样不能让临时半截目录覆盖用户的续读、书签与摘抄。
      throw new Error('书源返回的目录仍不完整，已保留本地目录和阅读数据');
    }
    if (!shouldReplaceCatalog && metas.length <= existing.length) {
      store.set(booksAtom, prev =>
        prev.map(b =>
          b.id === bookId ? { ...b, lastUpdateCheckAt: Date.now() } : b,
        ),
      );
      return 0;
    }

    const repaired = shouldReplaceCatalog
      ? repairCatalogPreservingIdentity(bookId, existing, metas, cached =>
          isCachedOnlineChapterUsable(cached, source.id),
        )
      : null;
    const next: Chapter[] = repaired
      ? repaired.chapters
      : [
          ...existing,
          ...metas.slice(existing.length).map((m, i) => ({
            id: `${bookId}-${existing.length + i}`,
            bookId,
            title: m.title,
            content: '',
            order: existing.length + i,
            sourceUrl: m.url,
          })),
        ];

    const latestBook =
      store.get(booksAtom).find(item => item.id === bookId) ?? book;
    const history = store.get(readingHistoryAtom)[bookId];
    const migratedReferences = repaired
      ? migrateCatalogReferences(
          bookId,
          latestBook.currentChapterId,
          history,
          store.get(bookmarksAtom)[bookId] ?? [],
          next,
          repaired.chapterIdMap,
        )
      : null;
    const readerTargetsBook = store.get(selectedBookIdAtom) === bookId;
    const migratedReaderSelection = repaired
      ? migrateReaderSelection(
          existing,
          next,
          readerTargetsBook ? store.get(currentChapterIndexAtom) : null,
          migratedReferences?.currentChapterId,
          repaired.chapterIdMap,
        )
      : null;
    store.set(chaptersAtom, prev => ({ ...prev, [bookId]: next }));
    if (repaired && readerTargetsBook) {
      // 后台追更也可能在阅读器存活时修复目录，同步更新全局索引和正文快照。
      store.set(
        currentChapterIndexAtom,
        migratedReaderSelection?.chapterIndex ?? null,
      );
      store.set(
        currentChapterContentAtom,
        migratedReaderSelection?.chapterContent ?? '',
      );
    }
    if (migratedReferences) {
      // 追更触发的残目录修复也要同步迁移续读和书签，不能只替换章节数组。
      store.set(readingHistoryAtom, prev => {
        const migrated = { ...prev };
        if (migratedReferences.history) {
          migrated[bookId] = migratedReferences.history;
        } else {
          delete migrated[bookId];
        }
        return migrated;
      });
      store.set(bookmarksAtom, prev => {
        const migrated = { ...prev };
        if (migratedReferences.bookmarks.length > 0) {
          migrated[bookId] = migratedReferences.bookmarks;
        } else {
          delete migrated[bookId];
        }
        return migrated;
      });
    }
    // 修复残目录时，补回的旧章节不能算“新章”；仅 URL 序号超过旧最大值的章节进入追更数。
    const addedChapterCount = repaired
      ? repaired.newChapterCount
      : Math.max(0, next.length - existing.length);
    store.set(booksAtom, prev =>
      prev.map(b =>
        b.id === bookId
          ? {
              ...b,
              currentChapterId: repaired
                ? migratedReferences?.currentChapterId
                : b.currentChapterId,
              // 已读完的连载书出现新章后不应继续显示 100%；保留首次完成时间，
              // 但把进度回落到旧目录末尾在新目录中的真实位置。
              progress: repaired
                ? progressAfterCatalogRepair(
                    b,
                    existing,
                    next,
                    history,
                    repaired.chapterIdMap,
                  )
                : b.progress >= 100 && addedChapterCount > 0
                ? calculateReadingProgress({
                    chapterIndex: Math.max(0, existing.length - 1),
                    totalChapters: next.length,
                    chapterFraction: 1,
                  })
                : b.progress,
              totalChapters: next.length,
              updatedAt: Date.now(),
              lastUpdateCheckAt: Date.now(),
              unreadUpdates: b.following
                ? (b.unreadUpdates || 0) + addedChapterCount
                : b.unreadUpdates,
            }
          : b,
      ),
    );
    await saveBookChapters(bookId, next).catch(error => {
      console.warn('[useCheckBookUpdate] save failed', error);
    });
    return addedChapterCount;
  };
};

export const useToggleBookFollow = () => {
  const store = useStore();
  return (bookId: string) => {
    store.set(booksAtom, prev =>
      prev.map(book =>
        book.id === bookId && book.source
          ? {
              ...book,
              following: !book.following,
              unreadUpdates: book.following ? 0 : book.unreadUpdates || 0,
            }
          : book,
      ),
    );
  };
};

export const useCheckFollowedBooks = () => {
  const store = useStore();
  const checkBookUpdate = useCheckBookUpdate();
  const ensureChapterContent = useEnsureChapterContent();
  const loadNextChapterPage = useLoadNextChapterPage();

  return async (options: { cacheNewChapters?: boolean } = {}) => {
    const followed = store
      .get(booksAtom)
      // 回收站里的书已经从书架移除，不应继续消耗网络检查追更或缓存新章。
      .filter(book => !book.deletedAt && book.source && book.following);
    let updated = 0;
    let failed = 0;
    let cached = 0;
    let cacheFailed = 0;
    for (const book of followed) {
      try {
        const added = await checkBookUpdate(book.id);
        updated += added;
        if (added > 0 && options.cacheNewChapters) {
          const chapters = store.get(chaptersAtom)[book.id] ?? [];
          const firstNewIndex = Math.max(0, chapters.length - added);

          // 新章缓存严格串行，避免自动追更在后台并发请求触发书源限流。
          for (let index = firstNewIndex; index < chapters.length; index += 1) {
            try {
              let chapter = await ensureChapterContent(book.id, index, {
                background: true,
              });
              while (chapter?.nextPageUrl) {
                chapter = await loadNextChapterPage(book.id, index, {
                  background: true,
                });
              }
              if (chapter?.content) cached += 1;
            } catch {
              // 单章缓存失败不影响其它新章；正文仍可在真正阅读时再次按需抓取。
              cacheFailed += 1;
            }
          }

          const latest = store.get(chaptersAtom)[book.id];
          if (latest) {
            await saveBookChapters(book.id, latest).catch(() => {});
          }
        }
      } catch {
        failed += 1;
        // 自动检查按“尝试日”限频；失败后当天不反复请求，用户仍可手动重试。
        store.set(booksAtom, prev =>
          prev.map(item =>
            item.id === book.id
              ? { ...item, lastUpdateCheckAt: Date.now() }
              : item,
          ),
        );
      }
    }
    return {
      checked: followed.length,
      updated,
      failed,
      cached,
      cacheFailed,
    };
  };
};
