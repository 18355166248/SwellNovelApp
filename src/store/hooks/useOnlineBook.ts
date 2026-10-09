import {
  abortable,
  createSharedRequestPool,
  throwIfAborted,
} from '../../utils/abort';
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
import {
  isBadBookshukuCatalog,
  isSafeBookshukuCatalogReplacement,
} from '../../utils/bookCatalogQuality';
import {
  migrateCatalogReferences,
  migrateReaderSelection,
  progressAfterCatalogRepair,
  repairCatalogPreservingIdentity,
  normalizedChapterIdentity,
} from '../../utils/catalogRepair';
import { migrateReadingRecords } from '../../utils/readingRecords';
import type { RecognizedBook } from '../../services/recognize/recognizer';
import {
  recognizeBookHtml,
  getRecognitionTargetUrl,
} from '../../services/recognize/recognizer';
import { prepareRecognizedCatalog } from '../../services/recognize/prepareRecognizedCatalog';
import {
  enrichBookMetadata,
  needsBookMetadata,
} from '../../services/recognize/enrichBookMetadata';
import {
  fetchRenderedChapterPage,
  fetchRenderedHtml,
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
const cacheTimerStores = new WeakMap<
  LibraryStore,
  Map<string, ReturnType<typeof setTimeout>>
>();
function cacheTimersFor(store: LibraryStore) {
  let timers = cacheTimerStores.get(store);
  if (!timers) {
    timers = new Map();
    cacheTimerStores.set(store, timers);
  }
  return timers;
}
// 阅读器后台预取与用户主动切章可能同时命中同一章。按章节合并在途请求，
// 避免重复占用书源连接；前台切章会直接等待已经开始的预取结果。
type ChapterRequests = ReturnType<
  typeof createSharedRequestPool<Chapter | null>
>;
const chapterContentRequests = new WeakMap<LibraryStore, ChapterRequests>();
const chapterPageRequests = new WeakMap<LibraryStore, ChapterRequests>();
function chapterRequests(
  pools: WeakMap<LibraryStore, ChapterRequests>,
  store: LibraryStore,
) {
  let pool = pools.get(store);
  if (!pool) {
    pool = createSharedRequestPool<Chapter | null>();
    pools.set(store, pool);
  }
  return pool;
}

function scheduleCache(store: LibraryStore, bookId: string) {
  const cacheTimers = cacheTimersFor(store);
  const existing = cacheTimers.get(bookId);
  if (existing) clearTimeout(existing);
  cacheTimers.set(
    bookId,
    setTimeout(() => {
      cacheTimers.delete(bookId);
      // 防抖等待期间可能追更或彻底删除；只保存当前书库的最新正文，不能重建已删除文件。
      const book = store.get(booksAtom).find(b => b.id === bookId);
      const chapters = store.get(chaptersAtom)[bookId];
      if (!book || !chapters) return;
      saveBookChapters(bookId, chapters).catch(error => {
        console.warn('[useOnlineBook] cache chapters failed', error);
      });
    }, CACHE_DEBOUNCE_MS),
  );
}

/** 网络响应只补正文：目录可在等待期间重排/改名，最新目录身份和元数据不能退回旧快照。 */
function publishChapterContent(
  store: LibraryStore,
  bookId: string,
  original: Chapter,
  filled: Chapter,
  requestedPageUrl?: string,
  debounceSave = true,
): Chapter | null {
  const book = store.get(booksAtom).find(b => b.id === bookId && !b.deletedAt);
  if (!book) return null;
  let published: Chapter | null = null;
  let changed = false;
  store.set(chaptersAtom, prev => {
    const list = prev[bookId];
    const latest = list?.find(c => c.id === original.id);
    if (
      !list ||
      !latest ||
      normalizedChapterIdentity(latest.sourceUrl) !==
        normalizedChapterIdentity(original.sourceUrl)
    )
      return prev;
    published = latest;
    // 另一路正文下载/续页已完成时返回最新缓存，不能把完整正文降回首个子页。
    if (
      (requestedPageUrl && latest.nextPageUrl !== requestedPageUrl) ||
      (latest.content !== original.content &&
        isCachedOnlineChapterUsable(latest, book.source?.name) &&
        (isCompleteOnlineChapterCacheUsable(latest, book.source?.name) ||
          !filled.content.startsWith(latest.content)))
    )
      return prev;
    published = {
      ...latest,
      title: latest.title === original.title ? filled.title : latest.title,
      content: filled.content,
      wordCount: filled.wordCount,
      contentVersion: filled.contentVersion,
      browserContentVersion: filled.browserContentVersion,
      contentTrustedShort: filled.contentTrustedShort,
      loadedPageUrls: filled.loadedPageUrls,
      nextPageUrl: filled.nextPageUrl,
      contentComplete: filled.contentComplete,
    };
    changed = true;
    return {
      ...prev,
      [bookId]: list.map(c => (c.id === latest.id ? published! : c)),
    };
  });
  if (changed && debounceSave) scheduleCache(store, bookId);
  return published;
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
  // 正常目录标题可能带作者备注；与目录识别保持同一上限，避免正文缓存时把长标题改成“章节”。
  if (!normalized || normalized.length > 200) return undefined;
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
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return abortable(Promise.race([promise, timeout]), signal).finally(() => {
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

function runLibraryTransaction<T>(
  store: LibraryStore,
  task: () => Promise<T>,
): Promise<T> {
  // 导入与追更共用发布队列；否则两个事务都可能基于旧目录写盘并覆盖对方的结果。
  const request = (bookImportQueues.get(store) ?? Promise.resolve()).then(task);
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

function commitBookImport(
  store: LibraryStore,
  incoming: OnlineBookResult,
  fromBrowser = false,
  signal?: AbortSignal,
): Promise<Book> {
  // 两个入口等待落盘时仍只能有一个发布者，避免都读到“尚未入库”的旧状态。
  return runLibraryTransaction(store, () => {
    throwIfAborted(signal);
    // 已进入落盘事务后完成发布，避免保存成功但页面因离开而误报失败。
    return saveImportedBook(store, incoming, fromBrowser);
  });
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
  const incomingIds = new Set(metas.map(m => normalizedChapterIdentity(m.url)));
  if (
    !preserveCatalog &&
    !isBadBookshukuCatalog(existing?.source?.name, previous) &&
    previous.some(c => !incomingIds.has(normalizedChapterIdentity(c.sourceUrl)))
  )
    throw new Error('新目录不完整，已保留本地目录和阅读数据');
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
  const cacheTimers = cacheTimersFor(store);
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
    if (pendingCache) scheduleCache(store, bookId);
    throw error;
  }
  const currentChapters = store.get(chaptersAtom)[bookId];
  if (currentChapters && currentChapters !== previous) {
    // 落盘时阅读器仍可能缓存正文；发布前重新合并最新缓存，不能用导入前快照覆盖它。
    previous = currentChapters;
    repaired = repair(previous);
    scheduleCache(store, bookId);
  }
  const latestBook = store.get(booksAtom).find(book => book.id === bookId);
  // 用户在导入等待期间再次移除原书时，后发的删除意图优先，不能被迟到导入还原。
  if (
    existing &&
    (!latestBook ||
      (latestBook.deletedAt && latestBook.deletedAt !== existing.deletedAt))
  )
    throw new Error('书籍已移除，已停止本次导入');
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
    readingRecords: migrateReadingRecords(
      latestBook?.readingRecords,
      repaired.chapters,
    ),
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

  return (data: RecognizedBook, signal?: AbortSignal): Promise<Book> =>
    runBookImport(store, onlineBookImportKey(data.url), async () => {
      throwIfAborted(signal);
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
            signal,
          ),
          false,
          signal,
        );
      }
      const metas = normalizeOnlineCatalog(data.chapters);
      const bookId = recognizedBookImportId(data.url, data.host);
      // 目录页可能完全没有封面/作者；通用补全仅查书籍资料，失败不影响已确认的完整目录。
      const metadata =
        data.metadataChecked || !needsBookMetadata(data)
          ? data
          : (await enrichBookMetadata(data, { signal })).book;
      throwIfAborted(signal);

      const now = Date.now();
      const book: Book = {
        id: bookId,
        title: metadata.title?.trim() || '',
        author: metadata.author?.trim() || '',
        cover: metadata.cover || undefined,
        description: metadata.description,
        addedAt: now,
        updatedAt: now,
        progress: 0,
        totalChapters: metas.length,
        // 注册源保留适配器身份以支持追更/缓存；未知网站用 host 标识，来源地址用于通用解析。
        source: {
          name: resolveSource(data.url)?.id || data.host,
          bookUrl: data.url,
        },
      };
      const chapters: Chapter[] = metas.map((c, i) => ({
        id: `${bookId}-${i}`,
        bookId,
        title: c.title,
        content: '',
        order: i,
        sourceUrl: c.url,
      }));

      return commitBookImport(store, { book, chapters }, true, signal);
    });
};

/**
 * 确保某章正文已就绪：已有正文直接返回；否则按书源抓取、回填内存并缓存落盘。
 * 抓取失败会抛错，交由调用方（阅读器）切到 error 态。
 */
interface EnsureChapterOptions {
  background?: boolean;
  signal?: AbortSignal;
}

export const useEnsureChapterContent = () => {
  const store = useStore();
  const checkBookUpdate = useCheckBookUpdate();

  return async (
    bookId: string,
    index: number,
    options: EnsureChapterOptions = {},
  ): Promise<Chapter | null> => {
    throwIfAborted(options.signal);
    const startedAt = Date.now();
    let chapters = store.get(chaptersAtom)[bookId];
    let chapter = chapters?.[index];
    if (!chapter) return null;

    const book = store
      .get(booksAtom)
      .find(b => b.id === bookId && !b.deletedAt);
    if (!book) return null;
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
    return chapterRequests(chapterContentRequests, store)(
      requestKey,
      options.signal,
      async signal => {
        throwIfAborted(signal);
        let originalChapter = chapter;
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
            // 阅读触发的旧目录修复与手动追更共用事务，保存失败不能提前替换界面或吞掉错误。
            const requestedChapter = chapter;
            const previousCatalog = chapters!;
            await checkBookUpdate(bookId, signal);
            throwIfAborted(signal);
            if (
              !store.get(booksAtom).some(b => b.id === bookId && !b.deletedAt)
            )
              return null;
            chapters = store.get(chaptersAtom)[bookId] ?? [];
            const mapped = repairCatalogPreservingIdentity(
              bookId,
              previousCatalog,
              chapters.map(c => ({ title: c.title, url: c.sourceUrl! })),
              () => false,
            ).chapterIdMap.get(requestedChapter.id);
            const migrated =
              chapters.find(c => c.id === requestedChapter.id) ??
              chapters.find(c => c.id === mapped);
            if (!migrated?.sourceUrl) return migrated ?? null;
            chapter = migrated;
            originalChapter = migrated;
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
                signal,
              }),
              ENSURE_CHAPTER_TIMEOUT_MS,
              `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
              signal,
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
              signal,
            }),
            ENSURE_CHAPTER_TIMEOUT_MS,
            `章节加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
            signal,
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
            signal,
            firstPageUrl: chapter.sourceUrl,
            firstContent: content,
            firstNextPageUrl: rendered.nextPageUrl,
            fetchPage: pageUrl =>
              withTimeout(
                fetchRenderedChapterPage(pageUrl, {
                  priority: options.background ? 'low' : 'high',
                  signal,
                }),
                ENSURE_CHAPTER_TIMEOUT_MS,
                `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
                signal,
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

        throwIfAborted(signal);
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

        const published = publishChapterContent(
          store,
          bookId,
          originalChapter,
          filled,
        );

        console.info('[useOnlineBook] ensure done', {
          bookId,
          index,
          title: filled.title,
          ms: Date.now() - startedAt,
          length: filled.content.length,
          contentComplete: filled.contentComplete,
          nextPageUrl: filled.nextPageUrl,
        });
        return published;
      },
    );
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
    const book = store
      .get(booksAtom)
      .find(b => b.id === bookId && !b.deletedAt);
    if (!book) return null;
    const source = book?.source ? getSourceById(book.source.name) : null;
    if (!chapter || !chapter.nextPageUrl || !book?.source)
      return chapter ?? null;

    const requestKey = `${bookId}:${chapter.id}:${chapter.nextPageUrl}`;
    return chapterRequests(chapterPageRequests, store)(
      requestKey,
      options.signal,
      async signal => {
        throwIfAborted(signal);
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
                  signal,
                }),
                ENSURE_CHAPTER_TIMEOUT_MS,
                `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
                signal,
              ),
            )
          : await (async (): Promise<
              ReturnType<typeof unpackChapterContent>
            > => {
              const rendered = await withTimeout(
                fetchRenderedChapterPage(requestedPageUrl, {
                  priority: options.background ? 'low' : 'high',
                  signal,
                }),
                ENSURE_CHAPTER_TIMEOUT_MS,
                `章节分页加载超时 ${ENSURE_CHAPTER_TIMEOUT_MS}ms`,
                signal,
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
        throwIfAborted(signal);
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

        const published = publishChapterContent(
          store,
          bookId,
          chapter,
          filled,
          requestedPageUrl,
        );

        console.info('[useOnlineBook] load next page done', {
          bookId,
          index,
          ms: Date.now() - startedAt,
          length: filled.content.length,
          contentComplete: filled.contentComplete,
          nextPageUrl: filled.nextPageUrl,
        });
        return published;
      },
    );
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
    const book = store
      .get(booksAtom)
      .find(b => b.id === bookId && !b.deletedAt);
    const source = book?.source
      ? getSourceById(book.source.name) || resolveSource(book.source.bookUrl)
      : null;
    const initial = store.get(chaptersAtom)[bookId];
    if (!source || !book?.source)
      throw new Error('网页导入书籍会在阅读时自动缓存，请回原网页更新目录');
    if (!initial?.length) throw new Error('章节目录尚未就绪，请稍后重试');

    const sourceName = book.source.name;
    const completeCache = new WeakMap<Chapter, boolean>();
    const complete = (c: Chapter) => {
      // 任务内按不可变章节对象复用质量校验，避免每下载一章都重新扫描此前所有正文。
      const known = completeCache.get(c);
      if (known !== undefined) return known;
      const usable = isCompleteOnlineChapterCacheUsable(c, sourceName);
      completeCache.set(c, usable);
      return usable;
    };
    let total = initial.length;
    const targets = new Set(initial.map(c => c.id));
    let done = initial.filter(complete).length;
    onProgress?.({ done, total });
    const refreshProgress = () => {
      const list = store.get(chaptersAtom)[bookId] ?? [];
      // 全本缓存跨越追更时按稳定 id 遍历，并纳入中途新增章；重排不会重复抓或漏章。
      list.forEach(c => targets.add(c.id));
      total = list.length;
      done = list.filter(complete).length;
    };
    const active = () =>
      store.get(booksAtom).some(b => b.id === bookId && !b.deletedAt);

    // 每抓够若干章就落一次盘：整本 700+ 章耗时较长，中途关闭/断网也能保住已抓进度。
    const FLUSH_EVERY = 20;
    let sinceFlush = 0;
    const flush = async () => {
      const list = store.get(chaptersAtom)[bookId];
      if (list && active()) {
        // 下载完成并不等于离线保存成功，存储失败必须由详情页提示重试。
        await saveBookChapters(bookId, list);
      }
      sinceFlush = 0;
    };

    for (const chapterId of targets) {
      refreshProgress();
      if (signal?.aborted || !active()) {
        if (sinceFlush > 0) await flush();
        return { done, total, cancelled: true };
      }
      const ch = store.get(chaptersAtom)[bookId]?.find(c => c.id === chapterId);
      if (!ch || !ch.sourceUrl || complete(ch)) {
        continue;
      }
      try {
        let parsed = unpackChapterContent(
          await abortable(
            source.parseChapterContent(ch.sourceUrl, {
              priority: 'low',
              signal,
            }),
            signal,
          ),
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
            await abortable(
              source.parseChapterContent(nextPageUrl, {
                priority: 'low',
                signal,
              }),
              signal,
            ),
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
        if (signal?.aborted || !active()) {
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
          browserContentVersion: book?.source?.name.includes('.')
            ? BROWSER_CONTENT_VERSION
            : ch.browserContentVersion,
          nextPageUrl,
          contentComplete,
        };
        if (!complete(filled)) {
          throw new Error('章节尚未完整，未计入离线缓存');
        }
        publishChapterContent(store, bookId, ch, filled, undefined, false);
        refreshProgress();
        sinceFlush += 1;
        onProgress?.({ done, total });
        if (sinceFlush >= FLUSH_EVERY) await flush();
      } catch {
        if (signal?.aborted) {
          if (sinceFlush > 0) await flush();
          return { done, total, cancelled: true };
        }
        // 单章失败静默跳过，继续抓下一章。
      }
      refreshProgress();
    }

    // 上次可能已下载到内存却落盘失败；再次点击缓存全本仍应重试保存，不能仅凭内存报成功。
    if (sinceFlush > 0 || done === total) await flush();
    return { done, total };
  };
};

// 手动检查与自动追更共享同书请求，任一页面离开不会取消仍有使用者的检查。
const updateRequests = new WeakMap<
  LibraryStore,
  ReturnType<typeof createSharedRequestPool<number>>
>();

/** 更新按章节来源身份合并，保存成功后才发布目录、续读引用和未读数量。 */
export const useCheckBookUpdate = () => {
  const store = useStore();
  return (bookId: string, signal?: AbortSignal): Promise<number> => {
    let pool = updateRequests.get(store);
    if (!pool) {
      pool = createSharedRequestPool<number>();
      updateRequests.set(store, pool);
    }
    return pool(bookId, signal, async requestSignal => {
      const book = store
        .get(booksAtom)
        .find(b => b.id === bookId && !b.deletedAt);
      if (!book?.source) return 0;
      const source =
        getSourceById(book.source.name) || resolveSource(book.source.bookUrl);
      let remote;
      if (source) {
        remote = await abortable(
          source.parseCatalog(
            {
              sourceBookId: source.extractId(book.source.bookUrl) || '',
              title: book.title,
              author: book.author,
              catalogUrl: getRecognitionTargetUrl(book.source.bookUrl),
            },
            { signal: requestSignal },
          ),
          requestSignal,
        );
      } else {
        // 未注册网站沿用导入时的通用解析与分页完整性检查，无需为追更再写一套适配。
        const fetchHtml = (url: string) =>
          fetchRenderedHtml(url, {
            signal: requestSignal,
            waitMs: 3500,
            timeout: 20000,
            priority: 'normal',
          });
        const recognized = recognizeBookHtml(
          await fetchHtml(book.source.bookUrl),
          book.source.bookUrl,
        );
        if (recognized.title && recognized.title !== book.title)
          throw new Error('书源返回了其他书籍的目录，请回原网页核对');
        remote = (
          await prepareRecognizedCatalog(
            recognized,
            fetchHtml,
            undefined,
            requestSignal,
          )
        ).chapters;
      }
      const metas = normalizeOnlineCatalog(remote);
      throwIfAborted(requestSignal);
      return runLibraryTransaction(store, async () => {
        throwIfAborted(requestSignal);
        const currentBook = () =>
          store.get(booksAtom).find(b => b.id === bookId && !b.deletedAt);
        if (!currentBook()) return 0;
        let existing = store.get(chaptersAtom)[bookId];
        if (!existing) {
          existing = (await loadBookChapters(bookId, requestSignal)) ?? [];
          existing = store.get(chaptersAtom)[bookId] ?? existing;
        }
        throwIfAborted(requestSignal);
        if (!currentBook()) return 0;
        const replacingBad = isBadBookshukuCatalog(source?.id, existing);
        const remoteIds = new Set(
          metas.map(m => normalizedChapterIdentity(m.url)),
        );
        // 只返回最新几章或一页目录不能被当成“已是最新”。保守拒绝缺失旧章的结果，保留阅读数据。
        if (
          (!replacingBad &&
            existing.some(
              c => !remoteIds.has(normalizedChapterIdentity(c.sourceUrl)),
            )) ||
          (replacingBad &&
            !isSafeBookshukuCatalogReplacement(
              source?.id,
              existing,
              metas.map(m => ({ title: m.title, sourceUrl: m.url })),
            ))
        )
          throw new Error('书源返回的目录不完整，已保留本地目录和阅读数据');
        const oldIds = new Set(
          existing.map(c => normalizedChapterIdentity(c.sourceUrl)),
        );
        const repair = (list: Chapter[]) =>
          repairCatalogPreservingIdentity(bookId, list, metas, c =>
            isCachedOnlineChapterUsable(c, source?.id ?? book.source!.name),
          );
        let repaired = repair(existing);
        const added = replacingBad
          ? repaired.newChapterCount
          : metas.filter(m => !oldIds.has(normalizedChapterIdentity(m.url)))
              .length;
        const cacheTimers = cacheTimersFor(store);
        const pendingCache = cacheTimers.get(bookId);
        if (pendingCache) {
          clearTimeout(pendingCache);
          cacheTimers.delete(bookId);
        }
        try {
          await saveBookChapters(bookId, repaired.chapters);
        } catch (error) {
          if (pendingCache) scheduleCache(store, bookId);
          throw error;
        }
        // 落盘期间读者可能缓存正文/移动位置，也可能删除书籍；不能发布旧快照或复活已删除书。
        const latest = currentBook();
        if (!latest) return 0;
        const newer = store.get(chaptersAtom)[bookId];
        if (newer && newer !== existing) {
          existing = newer;
          repaired = repair(newer);
          scheduleCache(store, bookId);
        }
        const next = repaired.chapters;
        const history = store.get(readingHistoryAtom)[bookId];
        const references = migrateCatalogReferences(
          bookId,
          latest.currentChapterId,
          history,
          store.get(bookmarksAtom)[bookId] ?? [],
          next,
          repaired.chapterIdMap,
        );
        const readerTargetsBook = store.get(selectedBookIdAtom) === bookId;
        const selection = migrateReaderSelection(
          existing,
          next,
          readerTargetsBook ? store.get(currentChapterIndexAtom) : null,
          references.currentChapterId,
          repaired.chapterIdMap,
        );
        store.set(chaptersAtom, prev => ({ ...prev, [bookId]: next }));
        if (readerTargetsBook) {
          store.set(currentChapterIndexAtom, selection.chapterIndex);
          store.set(currentChapterContentAtom, selection.chapterContent);
        }
        if (references.history)
          store.set(readingHistoryAtom, prev => ({
            ...prev,
            [bookId]: references.history!,
          }));
        store.set(bookmarksAtom, prev => ({
          ...prev,
          [bookId]: references.bookmarks,
        }));
        store.set(booksAtom, prev =>
          prev.map(b =>
            b.id === bookId
              ? {
                  ...b,
                  currentChapterId: references.currentChapterId,
                  readingRecords: migrateReadingRecords(b.readingRecords, next),
                  progress: progressAfterCatalogRepair(
                    b,
                    existing,
                    next,
                    history,
                    repaired.chapterIdMap,
                  ),
                  totalChapters: next.length,
                  updatedAt: Date.now(),
                  lastUpdateCheckAt: Date.now(),
                  unreadUpdates: b.following
                    ? (b.unreadUpdates || 0) + added
                    : b.unreadUpdates,
                }
              : b,
          ),
        );
        return added;
      });
    });
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
        const before = options.cacheNewChapters
          ? store.get(chaptersAtom)[book.id] ??
            (await loadBookChapters(book.id)) ??
            []
          : [];
        const beforeIds = new Set(
          before.map(c => normalizedChapterIdentity(c.sourceUrl)),
        );
        const added = await checkBookUpdate(book.id);
        updated += added;
        if (added > 0 && options.cacheNewChapters) {
          const chapters = store.get(chaptersAtom)[book.id] ?? [];
          let bookCached = 0;

          // 新章缓存严格串行，避免自动追更在后台并发请求触发书源限流。
          for (const target of chapters) {
            // 新章也可能插在中间；按来源身份定位，不能缓存末尾 N 章冒充新增章。
            if (beforeIds.has(normalizedChapterIdentity(target.sourceUrl)))
              continue;
            try {
              // 每次抓取和续页前重新定位，其他追更任务可能已把目标章移动到新的下标。
              const locate = () =>
                (store.get(chaptersAtom)[book.id] ?? []).findIndex(
                  c => c.id === target.id,
                );
              let index = locate();
              if (index < 0) throw new Error('章节已不在当前目录');
              let chapter = await ensureChapterContent(book.id, index, {
                background: true,
              });
              while (chapter?.nextPageUrl) {
                index = locate();
                if (index < 0) throw new Error('章节已不在当前目录');
                chapter = await loadNextChapterPage(book.id, index, {
                  background: true,
                });
              }
              if (
                chapter &&
                isCompleteOnlineChapterCacheUsable(chapter, book.source?.name)
              )
                bookCached += 1;
              else cacheFailed += 1;
            } catch {
              // 单章缓存失败不影响其它新章；正文仍可在真正阅读时再次按需抓取。
              cacheFailed += 1;
            }
          }

          const latest = store.get(chaptersAtom)[book.id];
          if (
            latest &&
            store.get(booksAtom).some(b => b.id === book.id && !b.deletedAt)
          ) {
            try {
              await saveBookChapters(book.id, latest);
              cached += bookCached;
            } catch {
              // 正文只在内存里不等于可离线；保留更新成功，单独报告缓存落盘失败。
              cacheFailed += bookCached;
            }
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
