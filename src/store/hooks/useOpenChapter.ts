/** 选章与位置恢复共用入口；目录跳转前保存独立快照，不能被下一章阅读进度覆盖。 */
import { useCallback } from 'react';
import type { ReadingHistory } from '../types/book';
import { useStore } from 'jotai';
import { booksAtom, chaptersAtom, readingHistoryAtom } from '../atoms';
import { useSelectBook, useUpdateReadingProgress } from './useBooks';
import { useSetChapterContent, useSetChapterIndex } from './useReader';
import { calculateReadingProgress } from '../../utils/readingProgressPercent';
import { preserveReadingPosition } from '../../utils/readingRecords';

interface OpenChapterOptions {
  updateProgress?: boolean;
  /** 顺序翻章不留跳转快照；目录、书签、阅读记录等主动跳转需要保护原位置。 */
  preservePreviousPosition?: boolean;
  restorePosition?: number;
}

export const usePreserveReadingPosition = () => {
  const store = useStore();
  return useCallback(
    (
      bookId: string,
      targetChapterId?: string,
      targetPosition?: number,
      currentPosition?: ReadingHistory,
    ) => {
      const history = currentPosition ?? store.get(readingHistoryAtom)[bookId];
      const chapters = store.get(chaptersAtom)[bookId] ?? [];
      store.set(booksAtom, books =>
        books.map(book =>
          book.id === bookId
            ? preserveReadingPosition(
                book,
                history,
                chapters,
                targetChapterId,
                targetPosition,
              )
            : book,
        ),
      );
    },
    [store],
  );
};

export const useOpenChapter = () => {
  const store = useStore();
  const preserve = usePreserveReadingPosition();
  const selectBook = useSelectBook();
  const setChapterIndex = useSetChapterIndex();
  const setChapterContent = useSetChapterContent();
  const updateProgress = useUpdateReadingProgress();

  return (
    bookId: string,
    chapterIndex: number,
    options: OpenChapterOptions = {},
  ) => {
    // 事件读取最新目录，避免异步回调持有旧章节数组；无效选章不能污染全局续读状态。
    const chapters = store.get(chaptersAtom)[bookId] ?? [];
    const chapter = chapters[chapterIndex];
    if (
      !chapter ||
      !store.get(booksAtom).some(b => b.id === bookId && !b.deletedAt)
    )
      return;
    if (
      options.updateProgress !== false &&
      options.preservePreviousPosition !== false
    )
      preserve(bookId, chapter.id, options.restorePosition);
    selectBook(bookId);
    setChapterIndex(chapterIndex);
    setChapterContent(chapter.content || '');
    if (options.updateProgress !== false) {
      const position = options.restorePosition;
      const validPosition =
        position === undefined
          ? undefined
          : Math.max(0, Number.isFinite(position) ? position : 0);
      const progress = calculateReadingProgress({
        chapterIndex,
        totalChapters: chapters.length,
        chapterFraction:
          validPosition !== undefined && chapter.content.length
            ? Math.min(1, validPosition / chapter.content.length)
            : 0,
        hasRemainingPages: !!chapter.nextPageUrl,
      });
      // 普通选章不清空原续读偏移；选中历史记录时显式恢复，阅读器按实际排版落到对应页。
      updateProgress(bookId, progress, chapter.id, validPosition);
    }
  };
};
