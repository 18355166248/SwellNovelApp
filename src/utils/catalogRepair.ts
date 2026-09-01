import type {
  Book,
  Bookmark,
  Chapter,
  ReadingHistory,
} from '../store/types/book';
import { calculateReadingProgress } from './readingProgressPercent';

interface CatalogMeta {
  title: string;
  url: string;
}

export interface CatalogRepairResult {
  chapters: Chapter[];
  newChapterCount: number;
  /** 每个旧章节都有结果；无法按来源序号找到可靠邻近章时才为 null。 */
  chapterIdMap: ReadonlyMap<string, string | null>;
}

export interface MigratedCatalogReferences {
  currentChapterId?: string;
  history?: ReadingHistory;
  bookmarks: Bookmark[];
}

export interface MigratedReaderSelection {
  chapterIndex: number | null;
  chapterContent: string;
}

function normalizedNumericSegment(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}

function parsedChapterUrl(url?: string): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function bookshukuIdentityParts(
  url?: string,
): { bookId: string; sequence: string } | null {
  const parsed = parsedChapterUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^(?:www|wap)\./, '');
  if (host !== 'bookshuku.org') return null;
  const match = /^\/read\/(\d+)_(\d+)\.html\/?$/i.exec(parsed.pathname);
  if (!match) return null;
  return {
    bookId: normalizedNumericSegment(match[1]),
    sequence: normalizedNumericSegment(match[2]),
  };
}

/**
 * 章节身份不使用可变的访问入口。bookshuku 的协议及 www/wap 域名会切换，
 * 但书号与章节序号稳定；其他来源也忽略协议、展示子域和 hash，并规范 query 顺序。
 */
export function normalizedChapterIdentity(url?: string): string | null {
  if (!url?.trim()) return null;
  const bookshuku = bookshukuIdentityParts(url);
  if (bookshuku) {
    return `bookshuku:${bookshuku.bookId}:${bookshuku.sequence}`;
  }

  const parsed = parsedChapterUrl(url);
  if (!parsed) return `raw:${url.trim()}`;
  const host = parsed.hostname.toLowerCase().replace(/^(?:www|wap)\./, '');
  const port = parsed.port ? `:${parsed.port}` : '';
  const pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  const query: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, key) => {
    if (key !== '__nvl_proxy_ts') query.push([key, value]);
  });
  query.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`),
  );
  const normalizedParams = new URLSearchParams();
  query.forEach(([key, value]) => normalizedParams.append(key, value));
  const normalizedQuery = normalizedParams.toString();
  return `url:${host}${port}${pathname}${
    normalizedQuery ? `?${normalizedQuery}` : ''
  }`;
}

function sourceSequence(url?: string): number | null {
  const sequence = bookshukuIdentityParts(url)?.sequence;
  if (!sequence) return null;
  const parsed = Number(sequence);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 用完整目录替换残目录时按规范化来源身份保留旧章节 id。书签、阅读历史和当前章都引用
 * 这个 id；若按新数组下标重建，会把“旧第 700 章”错误指向“新第 11 章”。
 */
export function repairCatalogPreservingIdentity(
  bookId: string,
  existing: Chapter[],
  metas: CatalogMeta[],
  canReuseContent: (chapter: Chapter) => boolean,
): CatalogRepairResult {
  const existingByIdentity = new Map<string, Chapter[]>();
  existing.forEach(chapter => {
    const identity = normalizedChapterIdentity(chapter.sourceUrl);
    if (!identity) return;
    const matches = existingByIdentity.get(identity) ?? [];
    matches.push(chapter);
    existingByIdentity.set(identity, matches);
  });
  const consumedExisting = new Set<Chapter>();
  const reservedIds = new Set(existing.map(chapter => chapter.id));
  const assignedIds = new Set<string>();
  // 映射覆盖每一个旧 id；未被新目录认领的项保持 null，调用方不得按下标猜章。
  const chapterIdMap = new Map<string, string | null>(
    existing.map(chapter => [chapter.id, null]),
  );

  const chapters = metas.map((meta, index): Chapter => {
    const identity = normalizedChapterIdentity(meta.url);
    const previous = identity
      ? existingByIdentity
          .get(identity)
          ?.find(chapter => !consumedExisting.has(chapter))
      : undefined;
    if (previous) consumedExisting.add(previous);
    const reusable = previous && canReuseContent(previous) ? previous : null;
    let id = previous?.id;

    if (!id || assignedIds.has(id)) {
      const sequence = sourceSequence(meta.url) ?? index + 1;
      const base = `${bookId}-catalog-${sequence}`;
      id = base;
      let suffix = 1;
      while (reservedIds.has(id) || assignedIds.has(id)) {
        id = `${base}-${suffix++}`;
      }
    }
    assignedIds.add(id);
    if (previous) chapterIdMap.set(previous.id, id);

    return {
      id,
      bookId,
      title: meta.title,
      content: reusable?.content ?? '',
      order: index,
      sourceUrl: meta.url,
      wordCount: reusable?.wordCount,
      contentVersion: reusable?.contentVersion,
      browserContentVersion: reusable?.browserContentVersion,
      contentTrustedShort: reusable?.contentTrustedShort,
      nextPageUrl: reusable?.nextPageUrl,
      contentComplete: reusable?.contentComplete,
    };
  });

  // 书源偶尔会删除或合并旧章节。精确身份消失时按稳定 URL 序号落到最近的存活章，
  // 让“继续阅读”仍停在原位置附近；没有序号就保持 null，绝不按数组下标猜测。
  for (const previous of existing) {
    if (chapterIdMap.get(previous.id) !== null) continue;
    const previousSequence = sourceSequence(previous.sourceUrl);
    if (previousSequence == null) continue;
    let nearest: { id: string; sequence: number } | null = null;
    for (const candidate of chapters) {
      const candidateSequence = sourceSequence(candidate.sourceUrl);
      if (candidateSequence == null) continue;
      const candidateDistance = Math.abs(candidateSequence - previousSequence);
      const nearestDistance = nearest
        ? Math.abs(nearest.sequence - previousSequence)
        : Number.POSITIVE_INFINITY;
      // 距离相同时优先前一章，避免续读无意跳过尚未读到的内容。
      if (
        candidateDistance < nearestDistance ||
        (candidateDistance === nearestDistance &&
          (!nearest || candidateSequence < nearest.sequence))
      ) {
        nearest = { id: candidate.id, sequence: candidateSequence };
      }
    }
    if (nearest) chapterIdMap.set(previous.id, nearest.id);
  }

  const maxKnownSequence = existing.reduce(
    (max, chapter) => Math.max(max, sourceSequence(chapter.sourceUrl) ?? 0),
    0,
  );
  const newChapterCount =
    maxKnownSequence > 0
      ? new Set(
          metas
            .filter(meta => (sourceSequence(meta.url) ?? 0) > maxKnownSequence)
            .map(meta => normalizedChapterIdentity(meta.url) ?? meta.url),
        ).size
      : 0;

  return { chapters, newChapterCount, chapterIdMap };
}

function migratedChapterId(
  chapterId: string | undefined,
  nextChapterIds: ReadonlySet<string>,
  chapterIdMap: ReadonlyMap<string, string | null>,
): string | undefined {
  if (!chapterId) return undefined;
  if (chapterIdMap.has(chapterId)) {
    return chapterIdMap.get(chapterId) ?? undefined;
  }
  return nextChapterIds.has(chapterId) ? chapterId : undefined;
}

function validPosition(position: number, chapter: Chapter): number {
  if (!Number.isFinite(position) || position <= 0 || !chapter.content) return 0;
  return Math.min(Math.floor(position), chapter.content.length);
}

/** 把 Reader 的全局数组索引迁到稳定章节 id，避免目录扩容后相同下标指向另一章。 */
export function migrateReaderSelection(
  previousChapters: Chapter[],
  nextChapters: Chapter[],
  previousChapterIndex: number | null,
  fallbackChapterId: string | undefined,
  chapterIdMap: ReadonlyMap<string, string | null>,
): MigratedReaderSelection {
  const previousChapterId =
    previousChapterIndex != null
      ? previousChapters[previousChapterIndex]?.id
      : undefined;
  const nextChapterId = previousChapterId
    ? chapterIdMap.get(previousChapterId)
    : fallbackChapterId;
  const chapterIndex = nextChapterId
    ? nextChapters.findIndex(chapter => chapter.id === nextChapterId)
    : -1;
  return chapterIndex >= 0
    ? {
        chapterIndex,
        chapterContent: nextChapters[chapterIndex]?.content ?? '',
      }
    : { chapterIndex: null, chapterContent: '' };
}

/**
 * 目录替换与引用迁移必须作为一次状态变更：可定位章节迁到稳定 id，正文未复用或
 * 变短时收敛位置；完全无法定位的历史/书签保留为 orphan，不能静默删除用户数据。
 */
export function migrateCatalogReferences(
  bookId: string,
  currentChapterId: string | undefined,
  history: ReadingHistory | undefined,
  bookmarks: Bookmark[],
  nextChapters: Chapter[],
  chapterIdMap: ReadonlyMap<string, string | null>,
): MigratedCatalogReferences {
  const nextById = new Map(nextChapters.map(chapter => [chapter.id, chapter]));
  const nextChapterIds = new Set(nextById.keys());
  const migratedCurrentChapterId = migratedChapterId(
    currentChapterId,
    nextChapterIds,
    chapterIdMap,
  );
  const migratedHistoryChapterId = migratedChapterId(
    history?.chapterId,
    nextChapterIds,
    chapterIdMap,
  );
  const migratedHistoryChapter = migratedHistoryChapterId
    ? nextById.get(migratedHistoryChapterId)
    : undefined;
  const migratedHistory =
    history && migratedHistoryChapterId && migratedHistoryChapter
      ? {
          ...history,
          bookId,
          chapterId: migratedHistoryChapterId,
          position:
            migratedHistoryChapterId === history.chapterId
              ? validPosition(history.position, migratedHistoryChapter)
              : 0,
        }
      : history
      ? { ...history, bookId }
      : undefined;

  const migratedBookmarks = bookmarks.flatMap(bookmark => {
    const nextChapterId = migratedChapterId(
      bookmark.chapterId,
      nextChapterIds,
      chapterIdMap,
    );
    const nextChapter = nextChapterId ? nextById.get(nextChapterId) : undefined;
    if (!nextChapterId || !nextChapter) {
      // 无法定位的旧书签/摘抄保留为 orphan，避免一次书源异常造成不可恢复的数据删除；
      // 后续目录再次出现时仍有机会恢复引用，当前阅读器会忽略找不到的章节。
      return [{ ...bookmark, bookId }];
    }
    return [
      {
        ...bookmark,
        bookId,
        chapterId: nextChapterId,
        position:
          nextChapterId === bookmark.chapterId
            ? validPosition(bookmark.position, nextChapter)
            : 0,
      },
    ];
  });

  return {
    currentChapterId: migratedCurrentChapterId,
    history: migratedHistory,
    bookmarks: migratedBookmarks,
  };
}

/** 修复目录后按映射后的当前章 id 重新计算位置；无法可靠映射时宁可保留原进度。 */
export function progressAfterCatalogRepair(
  book: Book,
  previousChapters: Chapter[],
  nextChapters: Chapter[],
  history?: ReadingHistory,
  chapterIdMap: ReadonlyMap<string, string | null> = new Map(),
): number {
  if (nextChapters.length === 0) return 0;
  if (!book.currentChapterId) return book.progress;
  const nextChapterId = migratedChapterId(
    book.currentChapterId,
    new Set(nextChapters.map(chapter => chapter.id)),
    chapterIdMap,
  );
  if (!nextChapterId) return 0;
  const nextIndex = nextChapters.findIndex(
    chapter => chapter.id === nextChapterId,
  );
  if (nextIndex < 0) return 0;

  const previous = previousChapters.find(
    chapter => chapter.id === book.currentChapterId,
  );
  const chapterFraction =
    book.progress >= 100
      ? 1
      : nextChapterId === book.currentChapterId &&
        history?.chapterId === book.currentChapterId &&
        previous?.content.length
      ? Math.max(0, Math.min(1, history.position / previous.content.length))
      : 0;

  return calculateReadingProgress({
    chapterIndex: nextIndex,
    totalChapters: nextChapters.length,
    chapterFraction,
  });
}
