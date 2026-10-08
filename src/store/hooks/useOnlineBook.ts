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
import {
  addOnlineBook,
  isSameOnlineBook,
  normalizeOnlineCatalog,
  onlineBookImportKey,
  recognizedBookImportId,
  type OnlineBookResult,
} from '../../utils/addOnlineBook';
import { getSourceById, resolveSource } from '../../services/source/registry';
import type { ParsedChapterContent } from '../../services/source/types';
import {
  isInvalidOnlineChapterContent,
  isOnlineChapterCacheUsable,
  isCompleteOnlineChapterCacheUsable,
  BROWSER_CONTENT_VERSION,
  ONLINE_CONTENT_VERSION,
} from '../../services/source/contentQuality';
import { isBlockedText } from '../../services/source/contentGuards';
import {
  collectChapterPages,
  chapterPageIdentity,
  MAX_CHAPTER_PAGES,
} from '../../services/source/chapterPages';
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
const BOOK_IMPORT_TIMEOUT_MS = 45000;
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
  loadedPageUrls?: string[];
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

type LibraryStore = ReturnType<typeof useStore>;
const bookImportRequests = new WeakMap<
  LibraryStore,
  Map<string, Promise<Book>>
>();
const bookImportQueues = new WeakMap<LibraryStore, Promise<void>>();

function runBookImport(
  store: LibraryStore,
  key: string,
  importBook: () => Promise<Book>,
): Promise<Book> {
  let requests = bookImportRequests.get(store);
  if (!requests) {
    requests = new Map();
    bookImportRequests.set(store, requests);
  }
  const existing = requests.get(key);
  if (existing) return existing;
  // 同书请求共用解析和保存结果；不同书的网络请求可并发，只有发布入库事务需要串行。
  const request = importBook();
  requests.set(key, request);
  const tail = request.then(
    () => undefined,
    () => undefined,
  );
  tail.then(() => {
    if (requests.get(key) === request) requests.delete(key);
  });
  return request;
}

function commitBookImport(
  store: LibraryStore,
  incoming: OnlineBookResult,
  fromBrowser = false,
): Promise<Book> {
  // 两个入口等待落盘时仍只能有一个发布者，避免都读到“尚未入库”的旧状态。
  const request = (bookImportQueues.get(store) ?? Promise.resolve()).then(() =>
    saveImportedBook(store, incoming, fromBrowser),
  );
  const tail = request.then(
    () => undefined,
    () => undefined,
  );
  bookImportQueues.set(store, tail);
  tail.then(() => {
    if (bookImportQueues.get(store) === tail) bookImportQueues.delete(store);
  });
  return request;
}

async function saveImportedBook(
  store: LibraryStore,
  incoming: OnlineBookResult,
  fromBrowser = false,
): Promise<Book> {
  const incomingBook = incoming.book;
  // 去重包含回收站与另一入口的历史 id；重新添加表示还原，用户状态继续沿用原书。
  const existing = store
    .get(booksAtom)
    .find(book => isSameOnlineBook(book, incomingBook.source!.bookUrl));
  const bookId = existing?.id ?? incomingBook.id;
  let previous = store.get(chaptersAtom)[bookId];
  if (existing && !previous) {
    const loaded = (await loadBookChapters(bookId)) ?? [];
    previous = store.get(chaptersAtom)[bookId] ?? loaded;
  }
  previous = previous ?? [];
  const metas = incoming.chapters.map(chapter => ({
    title: chapter.title,
    url: chapter.sourceUrl!,
  }));
  const preserveCatalog =
    metas.length < previous.length &&
    !isBadBookshukuCatalog(existing?.source?.name, previous);
  // 临时只识别到第一页时保留完整旧目录；残缺 bookshuku 目录则仍允许可信修复。
  if (
    !preserveCatalog &&
    existing &&
    !isSafeBookshukuCatalogReplacement(
      existing.source?.name,
      previous,
      incoming.chapters,
    )
  ) {
    throw new Error('书源返回的目录仍不完整，已保留本地目录和阅读数据');
  }
  const selectedMetas = preserveCatalog
    ? previous.map(chapter => ({
        title: chapter.title,
        url: chapter.sourceUrl!,
      }))
    : metas;
  const repair = (current: Chapter[]) =>
    repairCatalogPreservingIdentity(bookId, current, selectedMetas, cached =>
      isCachedOnlineChapterUsable(
        cached,
        existing?.source?.name ?? incomingBook.source?.name,
      ),
    );
  let repaired = repair(previous);
  const pendingCache = cacheTimers.get(bookId);
  if (pendingCache) {
    clearTimeout(pendingCache);
    cacheTimers.delete(bookId);
  }
  // 目录保存成功才显示入库成功；磁盘/浏览器存储失败交给入口提示重试，避免空壳书。
  try {
    await saveBookChapters(bookId, repaired.chapters);
  } catch (error) {
    // 导入失败时原书没有变化；此前待写的阅读缓存仍需重试，不能随导入一起丢掉。
    if (pendingCache)
      scheduleCache(bookId, store.get(chaptersAtom)[bookId] ?? previous);
    throw error;
  }
  const currentChapters = store.get(chaptersAtom)[bookId];
  if (currentChapters && currentChapters !== previous) {
    // 落盘时阅读器仍可能缓存正文；发布前重新合并最新缓存，不能用导入前快照覆盖它。
    previous = currentChapters;
    repaired = repair(previous);
    scheduleCache(bookId, repaired.chapters);
  }
  const latestBook =
    store.get(booksAtom).find(book => book.id === bookId) ?? existing;
  const history = store.get(readingHistoryAtom)[bookId];
  const references = migrateCatalogReferences(
    bookId,
    latestBook?.currentChapterId,
    history,
    store.get(bookmarksAtom)[bookId] ?? [],
    repaired.chapters,
    repaired.chapterIdMap,
  );
  const book: Book = {
    ...incomingBook,
    ...latestBook,
    id: bookId,
    title: incomingBook.title || latestBook?.title || '未命名书籍',
    author: incomingBook.author || latestBook?.author || '佚名',
    cover: incomingBook.cover || latestBook?.cover,
    description: incomingBook.description || latestBook?.description,
    // 注册书源已能直接读取正文，浏览器再次识别时保留此能力。
    source:
      fromBrowser && latestBook?.source && getSourceById(latestBook.source.name)
        ? latestBook.source
        : incomingBook.source,
    totalChapters: repaired.chapters.length,
    currentChapterId: references.currentChapterId,
    progress: latestBook
      ? progressAfterCatalogRepair(
          latestBook,
          previous,
          repaired.chapters,
          history,
          repaired.chapterIdMap,
        )
      : 0,
    updatedAt: Date.now(),
    deletedAt: undefined,
  };
  const readerTargetsBook = store.get(selectedBookIdAtom) === bookId;
  const selection = migrateReaderSelection(
    previous,
    repaired.chapters,
    readerTargetsBook ? store.get(currentChapterIndexAtom) : null,
    references.currentChapterId,
    repaired.chapterIdMap,
  );
  store.set(chaptersAtom, prev => ({ ...prev, [bookId]: repaired.chapters }));
  if (readerTargetsBook) {
    store.set(currentChapterIndexAtom, selection.chapterIndex);
    store.set(currentChapterContentAtom, selection.chapterContent);
  }
  if (references.history) {
    store.set(readingHistoryAtom, prev => ({
      ...prev,
      [bookId]: references.history!,
    }));
  }
  store.set(bookmarksAtom, prev => ({
    ...prev,
    [bookId]: references.bookmarks,
  }));
  store.set(booksAtom, prev =>
    latestBook
      ? prev.map(item => (item.id === bookId ? book : item))
      : [...prev, book],
  );
  return book;
}

/** 添加在线书并保存目录；重复添加保留续读、正文、书签与追更状态。 */
export const useAddOnlineBook = () => {
  const store = useStore();
  return (url: string): Promise<Book> =>
    runBookImport(store, onlineBookImportKey(url), async () =>
      // 代理、WebView 与镜像兜底会累加等待；只限制解析阶段，超时后迟到结果不能再发布入库。
      // 保存阶段不与超时竞赛，避免磁盘已提交却被界面误报失败。
      commitBookImport(
        store,
        await withTimeout(
          addOnlineBook(url),
          BOOK_IMPORT_TIMEOUT_MS,
          '书源响应超时',
        ),
      ),
    );
};

/**
 * 把内置浏览器识别到的页面加入书架（章节仅存标题+URL，正文留待后续在浏览器会话内抓取）。
 * 搜索与浏览器识别共用书源身份，旧版 browser id 也会被 URL 身份匹配并保留。
 */
export const useAddRecognizedBook = () => {
  const store = useStore();

  return (data: RecognizedBook): Promise<Book> =>
    runBookImport(store, onlineBookImportKey(data.url), async () => {
      if (!data.ok || !data.isDetail)
        throw new Error('未识别到书籍目录，请重新识别后重试');
      // 可直连的专用书源必须重取完整目录并保存注册身份；否则浏览导入会误走通用正文抓取，丢失章内子页。
      if (resolveSource(data.url)?.preferDirectImport) {
        return commitBookImport(
          store,
          await withTimeout(
            addOnlineBook(data.url),
            BOOK_IMPORT_TIMEOUT_MS,
            '书源响应超时',
          ),
        );
      }
      const metas = normalizeOnlineCatalog(data.chapters);
      const bookId = recognizedBookImportId(data.url, data.host);

      const now = Date.now();
      const book: Book = {
        id: bookId,
        title: data.title?.trim() || '',
        author: data.author?.trim() || '',
        cover: data.cover || undefined,
        addedAt: now,
        updatedAt: now,
        progress: 0,
        totalChapters: metas.length,
        // 浏览器识别源：host 作为来源名（无注册 BookSource），bookUrl 存详情页。
        source: { name: data.host, bookUrl: data.url },
      };
      const chapters: Chapter[] = metas.map((c, i) => ({
        id: `${bookId}-${i}`,
        bookId,
        title: c.title,
        content: '',
        order: i,
        sourceUrl: c.url,
      }));

      return commitBookImport(store, { book, chapters }, true);
    });
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
        'nextPageUrl' | 'complete' | 'trustedShort' | 'loadedPageUrls'
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
          loadedPageUrls: parsed.loadedPageUrls,
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
          firstPageUrl: chapter.sourceUrl,
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
          loadedPageUrls: merged.loadedPageUrls,
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
        loadedPageUrls: parsedMeta.loadedPageUrls,
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
      // 逐页阅读也必须检查环路；记录随正文保存，重启后不能再次追加已经读过的子页。
      const visited = new Set(
        [chapter.sourceUrl, ...(chapter.loadedPageUrls ?? [])]
          .filter((url): url is string => !!url)
          .map(chapterPageIdentity),
      );
      const requestedIdentity = chapterPageIdentity(requestedPageUrl);
      if (
        !requestedIdentity ||
        visited.has(requestedIdentity) ||
        visited.size >= MAX_CHAPTER_PAGES
      ) {
        throw new Error('章节分页链接异常，已保留已读正文，请重试或更换书源');
      }
      visited.add(requestedIdentity);
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
      if (
        parsed.nextPageUrl &&
        visited.has(chapterPageIdentity(parsed.nextPageUrl))
      ) {
        throw new Error('章节分页链接循环，已保留已读正文，请重试或更换书源');
      }
      const content = chapter.content
        ? `${chapter.content}\n${parsed.content}`
        : parsed.content;
      // 此处是已校验章正文的续页，尾页可能只有一句话；不能再套整章的 200 字门槛。
      // 仍拒绝空白和拦截/广告页，防止把网络错误标记为读完。
      const invalidPage =
        !parsed.content.trim() || isBlockedText(parsed.content);
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
        loadedPageUrls: [
          ...(chapter.loadedPageUrls ?? []),
          requestedPageUrl,
          ...(parsed.loadedPageUrls ?? []),
        ],
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
    if (!source)
      throw new Error('网页导入书籍会在阅读时自动缓存，请回原网页更新目录');
    if (!initial?.length) throw new Error('章节目录尚未就绪，请稍后重试');

    const total = initial.length;
    let done = initial.filter(c =>
      isCompleteOnlineChapterCacheUsable(c, source.id),
    ).length;
    onProgress?.({ done, total });

    // 每抓够若干章就落一次盘：整本 700+ 章耗时较长，中途关闭/断网也能保住已抓进度。
    const FLUSH_EVERY = 20;
    let sinceFlush = 0;
    const flush = async () => {
      const list = store.get(chaptersAtom)[bookId];
      if (list) {
        // 下载完成并不等于离线保存成功，存储失败必须由详情页提示重试。
        await saveBookChapters(bookId, list);
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
        isCompleteOnlineChapterCacheUsable(ch, source.id)
      ) {
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
        const visited = new Set(
          [ch.sourceUrl!, ...(parsed.loadedPageUrls ?? [])].map(
            chapterPageIdentity,
          ),
        );
        while (nextPageUrl && !signal?.aborted) {
          const identity = chapterPageIdentity(nextPageUrl);
          // 站点错误的下一页可能指回首页或成环，不能无限抓取并把重复正文标成完整。
          if (visited.has(identity) || visited.size >= MAX_CHAPTER_PAGES) {
            throw new Error('章节分页异常，未写入完整缓存');
          }
          visited.add(identity);
          // 整本缓存需要完整章节；这里沿用分页元数据顺序抓取，阅读器按需加载不受影响。
          parsed = unpackChapterContent(
            await source.parseChapterContent(nextPageUrl, { priority: 'low' }),
          );
          // 尾页可能只有几十字；整章首页已过字数校验，子页只拦空白和广告/拦截文本。
          if (!parsed.content.trim() || isBlockedText(parsed.content)) {
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
        if (!isCompleteOnlineChapterCacheUsable(filled, source.id)) {
          throw new Error('章节尚未完整，未计入离线缓存');
        }
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

    // 上次可能已下载到内存却落盘失败；再次点击缓存全本仍应重试保存，不能仅凭内存报成功。
    if (sinceFlush > 0 || done === total) await flush();
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

  return async (
    options: { cacheNewChapters?: boolean; onlyIfStale?: boolean } = {},
  ) => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const followed = store
      .get(booksAtom)
      // 回收站里的书已经从书架移除，不应继续消耗网络检查追更或缓存新章。
      .filter(book => !book.deletedAt && book.source && book.following)
      // 自动检查只处理当天尚未尝试的书，不能因为一本过期就重查整架。
      .filter(
        book =>
          !options.onlyIfStale || (book.lastUpdateCheckAt || 0) < todayStart,
      );
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
