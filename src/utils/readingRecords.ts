import type {
  Book,
  Chapter,
  ReadingHistory,
  ReadingRecord,
} from '../store/types/book';
import { normalizedChapterIdentity } from './catalogRepair';

export const MAX_READING_RECORDS = 30;

/** 只保存真实读过的位置；打开目录/加载页不制造章首记录，也不以当前进度覆盖旧快照。 */
export function preserveReadingPosition(
  book: Book,
  history: ReadingHistory | null | undefined,
  chapters: Chapter[],
  targetChapterId?: string,
  targetPosition?: number,
): Book {
  if (
    !history ||
    book.deletedAt ||
    (book.currentChapterId && history.chapterId !== book.currentChapterId) ||
    (history.chapterId === targetChapterId &&
      (targetPosition === undefined || history.position === targetPosition))
  )
    return book;
  const chapter = chapters.find(c => c.id === history.chapterId);
  if (!chapter || !Number.isFinite(history.position) || history.position < 0)
    return book;
  const previous = book.readingRecords ?? [];
  if (
    previous[0]?.chapterId === chapter.id &&
    previous[0]?.position === history.position
  )
    return book;
  const record: ReadingRecord = {
    ...history,
    id: `${history.chapterId}:${history.position}:${history.updatedAt}`,
    chapterTitle: chapter.title,
    sourceUrl: chapter.sourceUrl,
  };
  return {
    ...book,
    readingRecords: [
      record,
      ...previous.filter(
        r => r.chapterId !== record.chapterId || r.position !== record.position,
      ),
    ].slice(0, MAX_READING_RECORDS),
  };
}

export interface DisplayReadingRecord extends ReadingRecord {
  current?: boolean;
}

/** 当前续读位置单独展示；跳转前的快照仅在显式跳转时新增，翻页不会冲掉它。 */
export function displayReadingRecords(
  book: Book,
  history: ReadingHistory | null | undefined,
  chapters: Chapter[],
): DisplayReadingRecord[] {
  const saved = book.readingRecords ?? [];
  const chapter = history && chapters.find(c => c.id === history.chapterId);
  if (!chapter || !history) return saved;
  return [
    {
      ...history,
      id: 'current-reading-position',
      chapterTitle: chapter.title,
      sourceUrl: chapter.sourceUrl,
      current: true,
    },
    ...saved,
  ];
}

/** 阅读快照只接受原章的精确身份；目录删除原章时保留快照，不能套用续读的邻近章回退。 */
export function migrateReadingRecords(
  records: ReadingRecord[] | undefined,
  chapters: Chapter[],
): ReadingRecord[] | undefined {
  if (!records?.length) return records;
  const byId = new Map(chapters.map(chapter => [chapter.id, chapter]));
  const bySource = new Map(
    chapters.map(chapter => [
      normalizedChapterIdentity(chapter.sourceUrl),
      chapter,
    ]),
  );
  return records.map(record => {
    const identity = normalizedChapterIdentity(record.sourceUrl);
    const chapter = identity
      ? bySource.get(identity)
      : byId.get(record.chapterId);
    return chapter
      ? {
          ...record,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          sourceUrl: chapter.sourceUrl,
        }
      : record;
  });
}

/** 源链接存在时校验真实章节身份，防止被目录重新使用的旧 id 带到错误章节。 */
export function readingRecordChapter(
  record: ReadingRecord,
  chapters: Chapter[],
): Chapter | undefined {
  const identity = normalizedChapterIdentity(record.sourceUrl);
  const exact = chapters.find(chapter => chapter.id === record.chapterId);
  if (!identity || normalizedChapterIdentity(exact?.sourceUrl) === identity)
    return exact;
  return chapters.find(
    chapter => normalizedChapterIdentity(chapter.sourceUrl) === identity,
  );
}
