/**
 * 打开指定书籍的某一章节：写入当前章节内容/索引并更新阅读进度。
 * 供 Bookshelf 的“继续阅读”卡片、BookDetail 的目录/继续阅读入口共用。
 */

import { useAtomValue } from 'jotai';
import { chaptersAtom } from '../atoms';
import { useSelectBook, useUpdateReadingProgress } from './useBooks';
import { useSetChapterContent, useSetChapterIndex } from './useReader';
import { calculateReadingProgress } from '../../utils/readingProgressPercent';

interface OpenChapterOptions {
  /** 仅为目录抽屉准备上下文时设为 false，避免“查看目录”被记录成实际阅读。 */
  updateProgress?: boolean;
}

export const useOpenChapter = () => {
  const chaptersMap = useAtomValue(chaptersAtom);
  const selectBook = useSelectBook();
  const setChapterIndex = useSetChapterIndex();
  const setChapterContent = useSetChapterContent();
  const updateProgress = useUpdateReadingProgress();

  return (
    bookId: string,
    chapterIndex: number,
    options: OpenChapterOptions = {},
  ) => {
    const chapters = chaptersMap[bookId] || [];
    const chapter = chapters[chapterIndex];
    selectBook(bookId);
    setChapterIndex(chapterIndex);
    setChapterContent(chapter?.content || '');
    if (chapter && chapters.length > 0 && options.updateProgress !== false) {
      // 打开章节只代表到达章首，不能把整章都算作已读；尤其末章不能在进入时就记为 100%。
      const progress = calculateReadingProgress({
        chapterIndex,
        totalChapters: chapters.length,
        chapterFraction: 0,
      });
      // 只更新书籍进度/当前章，不写 readingHistory.position——页内偏移由阅读器
      // 按实际翻页落盘，这里传 0 会把续读位置清成章首。
      updateProgress(bookId, progress, chapter.id);
    }
  };
};
