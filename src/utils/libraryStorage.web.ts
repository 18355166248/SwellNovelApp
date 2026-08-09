/// <reference lib="dom" />
/**
 * 书库持久化：Web 端 meta 存 localStorage，章节正文存 IndexedDB。
 *
 * 为什么章节不放 localStorage：localStorage 每域仅约 5MB 且写入同步阻塞主线程，
 * 一本 10MB 的书会直接触发 QuotaExceededError（导入后刷新即丢失）。IndexedDB
 * 容量大、异步、structured clone 直接存对象免 JSON 序列化，适合大正文。
 * 无 IndexedDB 的环境（隐私模式 / SSR / 测试）回退到 localStorage 按书分键。
 */

import { Book, Bookmark, Chapter, ReadingHistory } from '../store/types/book';
import { ReaderSettings } from '../store/types/reader';
import { ReadingStats, emptyReadingStats } from '../store/types/stats';
import {
  normalizeProfileAppearance,
  ProfileAppearance,
} from '../store/types/profile';

export interface LibrarySnapshot {
  version: 1;
  readerSettingsVersion?: 2;
  books: Book[];
  chapters: Record<string, Chapter[]>;
  readingHistory: Record<string, ReadingHistory>;
  bookmarks: Record<string, Bookmark[]>;
  readerSettings?: ReaderSettings;
  searchHistory?: string[];
  readingStats?: ReadingStats;
  profileAppearance?: ProfileAppearance;
}

/** 轻量元数据：书籍、阅读进度、书签、阅读设置、阅读统计。 */
export interface LibraryMeta {
  version: 1;
  readerSettingsVersion?: 2;
  books: Book[];
  readingHistory: Record<string, ReadingHistory>;
  bookmarks: Record<string, Bookmark[]>;
  readerSettings?: ReaderSettings;
  searchHistory?: string[];
  readingStats?: ReadingStats;
  profileAppearance?: ProfileAppearance;
}

const LEGACY_STATE_KEY = 'swell-novel-library-state-v1';
const LEGACY_CHAPTERS_KEY = 'swell-novel-library-chapters-v1';
const META_KEY = 'swell-novel-library-meta-v1';
const bookChaptersKey = (bookId: string) =>
  `swell-novel-book-chapters-${bookId}`;

// ---- IndexedDB 章节存储（不可用时回退 localStorage） ----

const DB_NAME = 'swell-novel';
const DB_VERSION = 1;
const CHAPTERS_STORE = 'book-chapters';

const hasIDB = () => typeof indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;
const openDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          db.createObjectStore(CHAPTERS_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};

const idbGet = (bookId: string): Promise<Chapter[] | null> =>
  openDB().then(
    db =>
      new Promise<Chapter[] | null>((resolve, reject) => {
        const req = db
          .transaction(CHAPTERS_STORE, 'readonly')
          .objectStore(CHAPTERS_STORE)
          .get(bookId);
        req.onsuccess = () => resolve((req.result as Chapter[]) ?? null);
        req.onerror = () => reject(req.error);
      }),
  );

const idbPut = (bookId: string, chapters: Chapter[]): Promise<void> =>
  openDB().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHAPTERS_STORE, 'readwrite');
        tx.objectStore(CHAPTERS_STORE).put(chapters, bookId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );

const idbDelete = (bookId: string): Promise<void> =>
  openDB().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHAPTERS_STORE, 'readwrite');
        tx.objectStore(CHAPTERS_STORE).delete(bookId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );

// ---- 通用 ----

// v1 早期默认值是上下滚动。没有明确设置版本时迁移到新的默认左右翻页，之后用户选择会正常持久化。
const normalizeReaderSettings = (
  readerSettings: ReaderSettings | undefined,
  readerSettingsVersion: number | undefined,
): ReaderSettings | undefined =>
  readerSettings
    ? {
        ...readerSettings,
        pageMode:
          readerSettingsVersion === 2 ? readerSettings.pageMode : 'page',
      }
    : undefined;

const metaToSnapshot = (meta: Partial<LibraryMeta>): LibrarySnapshot => ({
  version: 1,
  books: meta.books ?? [],
  // 章节改为懒加载，启动快照不再携带正文。
  chapters: {},
  readingHistory: meta.readingHistory ?? {},
  bookmarks: meta.bookmarks ?? {},
  readerSettings: normalizeReaderSettings(
    meta.readerSettings,
    meta.readerSettingsVersion,
  ),
  searchHistory: meta.searchHistory ?? [],
  readingStats: meta.readingStats ?? emptyReadingStats,
  profileAppearance: normalizeProfileAppearance(meta.profileAppearance),
});

// 把整库章节 Map 拆存为按书条目（用于迁移旧的单文件正文）。
const migrateChaptersMap = async (map: Record<string, Chapter[]>) => {
  await Promise.all(
    Object.entries(map).map(([bookId, chapters]) =>
      saveBookChapters(bookId, chapters),
    ),
  );
};

export const loadLibrarySnapshot =
  async (): Promise<LibrarySnapshot | null> => {
    const metaRaw = window.localStorage.getItem(META_KEY);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as Partial<LibraryMeta>;
      if (meta.version !== 1) {
        return null;
      }

      // 迁移 Phase 1 遗留的单文件正文（若存在）为按书条目。
      const monoRaw = window.localStorage.getItem(LEGACY_CHAPTERS_KEY);
      if (monoRaw) {
        const mono = JSON.parse(monoRaw) as {
          chapters?: Record<string, Chapter[]>;
        };
        await migrateChaptersMap(mono.chapters ?? {});
        window.localStorage.removeItem(LEGACY_CHAPTERS_KEY);
      }

      return metaToSnapshot(meta);
    }

    // 迁移更早的单文件快照（books + chapters 混在一起）。
    const raw = window.localStorage.getItem(LEGACY_STATE_KEY);
    if (!raw) {
      return null;
    }
    const legacy = JSON.parse(raw) as Partial<LibrarySnapshot>;
    if (legacy.version !== 1) {
      return null;
    }

    await migrateChaptersMap(legacy.chapters ?? {});
    const meta: LibraryMeta = {
      version: 1,
      readerSettingsVersion: 2,
      books: legacy.books ?? [],
      readingHistory: legacy.readingHistory ?? {},
      bookmarks: legacy.bookmarks ?? {},
      readerSettings: normalizeReaderSettings(
        legacy.readerSettings,
        legacy.readerSettingsVersion,
      ),
      searchHistory: legacy.searchHistory ?? [],
      readingStats: legacy.readingStats,
      profileAppearance: normalizeProfileAppearance(legacy.profileAppearance),
    };
    await saveLibraryMeta(meta);
    window.localStorage.removeItem(LEGACY_STATE_KEY);
    return metaToSnapshot(meta);
  };

export const saveLibraryMeta = async (meta: LibraryMeta) => {
  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
};

/** 懒加载单本书的章节；无正文时返回 null。 */
export const loadBookChapters = async (
  bookId: string,
): Promise<Chapter[] | null> => {
  if (hasIDB()) {
    return idbGet(bookId);
  }
  const raw = window.localStorage.getItem(bookChaptersKey(bookId));
  return raw ? (JSON.parse(raw) as Chapter[]) : null;
};

export const saveBookChapters = async (bookId: string, chapters: Chapter[]) => {
  if (hasIDB()) {
    await idbPut(bookId, chapters);
    return;
  }
  window.localStorage.setItem(
    bookChaptersKey(bookId),
    JSON.stringify(chapters),
  );
};

export const deleteBookChapters = async (bookId: string) => {
  if (hasIDB()) {
    await idbDelete(bookId);
    return;
  }
  window.localStorage.removeItem(bookChaptersKey(bookId));
};

/**
 * 将已经校验的备份写入本地存储。先写入新章节，最后切换元数据，避免中断时
 * 把当前可用书库替换成半份备份。
 */
export const replaceLibraryFromBackup = async (
  meta: LibraryMeta,
  chapters: Record<string, Chapter[]>,
) => {
  const previous = await loadLibrarySnapshot();
  await Promise.all(
    Object.entries(chapters).map(([bookId, content]) =>
      saveBookChapters(bookId, content),
    ),
  );
  await saveLibraryMeta(meta);
  await Promise.all(
    (previous?.books ?? [])
      .filter(book => !chapters[book.id])
      .map(book => deleteBookChapters(book.id)),
  );
};
