/**
 * 书库持久化：原生端写入应用 Documents 目录，避免重启后导入书籍丢失。
 *
 * 存储拆分为「元数据」+「按书分文件的章节正文」：
 * - meta（书籍/进度/书签/设置）：翻页时高频变更，体积小，单独落盘。
 * - 章节正文：按 `book-chapters/{bookId}.json` 分文件存储，导入后基本不变，
 *   启动时不再一次性读取整库正文，改为打开某本书时按需懒加载，避免 10MB 级
 *   JSON.parse / JSON.stringify 阻塞 JS 线程导致卡顿。
 */

import RNFS from 'react-native-fs';
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

const DOC = RNFS.DocumentDirectoryPath;
const LEGACY_STATE_PATH = `${DOC}/library-state-v1.json`;
const LEGACY_CHAPTERS_PATH = `${DOC}/library-chapters-v1.json`;
const META_PATH = `${DOC}/library-meta-v1.json`;
const BOOK_CHAPTERS_DIR = `${DOC}/book-chapters`;

const bookChaptersPath = (bookId: string) =>
  `${BOOK_CHAPTERS_DIR}/${encodeURIComponent(bookId)}.json`;

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

// 把整库章节 Map 拆写成按书分文件（用于迁移旧的单文件正文）。
const migrateChaptersMap = async (map: Record<string, Chapter[]>) => {
  await RNFS.mkdir(BOOK_CHAPTERS_DIR).catch(() => {});
  await Promise.all(
    Object.entries(map).map(([bookId, chapters]) =>
      RNFS.writeFile(
        bookChaptersPath(bookId),
        JSON.stringify(chapters),
        'utf8',
      ),
    ),
  );
};

export const loadLibrarySnapshot =
  async (): Promise<LibrarySnapshot | null> => {
    if (await RNFS.exists(META_PATH)) {
      const meta = JSON.parse(
        await RNFS.readFile(META_PATH, 'utf8'),
      ) as Partial<LibraryMeta>;
      if (meta.version !== 1) {
        return null;
      }

      // 迁移 Phase 1 遗留的单文件正文（若存在）为按书分文件。
      if (await RNFS.exists(LEGACY_CHAPTERS_PATH)) {
        const mono = JSON.parse(
          await RNFS.readFile(LEGACY_CHAPTERS_PATH, 'utf8'),
        ) as { chapters?: Record<string, Chapter[]> };
        await migrateChaptersMap(mono.chapters ?? {});
        await RNFS.unlink(LEGACY_CHAPTERS_PATH).catch(() => {});
      }

      return metaToSnapshot(meta);
    }

    // 迁移更早的单文件快照（books + chapters 混在一起）。
    if (await RNFS.exists(LEGACY_STATE_PATH)) {
      const legacy = JSON.parse(
        await RNFS.readFile(LEGACY_STATE_PATH, 'utf8'),
      ) as Partial<LibrarySnapshot>;
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
      await RNFS.unlink(LEGACY_STATE_PATH).catch(() => {});
      return metaToSnapshot(meta);
    }

    return null;
  };

export const saveLibraryMeta = async (meta: LibraryMeta) => {
  await RNFS.writeFile(META_PATH, JSON.stringify(meta), 'utf8');
};

/** 懒加载单本书的章节；无正文文件时返回 null。 */
export const loadBookChapters = async (
  bookId: string,
): Promise<Chapter[] | null> => {
  const path = bookChaptersPath(bookId);
  if (!(await RNFS.exists(path))) {
    return null;
  }
  return JSON.parse(await RNFS.readFile(path, 'utf8')) as Chapter[];
};

export const saveBookChapters = async (bookId: string, chapters: Chapter[]) => {
  await RNFS.mkdir(BOOK_CHAPTERS_DIR).catch(() => {});
  await RNFS.writeFile(
    bookChaptersPath(bookId),
    JSON.stringify(chapters),
    'utf8',
  );
};

export const deleteBookChapters = async (bookId: string) => {
  const path = bookChaptersPath(bookId);
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
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
  // 元数据写入即为提交点；旧书正文只是孤立缓存，清理失败不能把已成功恢复误报为失败。
  await Promise.all(
    (previous?.books ?? [])
      .filter(book => !chapters[book.id])
      .map(book =>
        deleteBookChapters(book.id).catch(error => {
          console.warn('[LibraryStorage] stale chapter cleanup failed', error);
        }),
      ),
  );
};
