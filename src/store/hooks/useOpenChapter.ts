/**
 * 打开指定书籍的某一章节：写入当前章节内容/索引并更新阅读进度。
 * 供 Bookshelf 的“继续阅读”卡片、BookDetail 的目录/继续阅读入口共用。
 */

import { useAtomValue } from 'jotai';
import { chaptersAtom } from '../atoms';
import { useSelectBook, useUpdateReadingProgress } from './useBooks';
import { useSetChapterContent, useSetChapterIndex } from './useReader';

export const useOpenChapter = () => {
  const chaptersMap = useAtomValue(chaptersAtom);
  const selectBook = useSelectBook();
  const setChapterIndex = useSetChapterIndex();
  const setChapterContent = useSetChapterContent();
  const updateProgress = useUpdateReadingProgress();

  return (bookId: string, chapterIndex: number) => {
    const chapters = chaptersMap[bookId] || [];
    const chapter = chapters[chapterIndex];
    selectBook(bookId);
    setChapterIndex(chapterIndex);
    setChapterContent(chapter?.content || '');
    if (chapter && chapters.length > 0) {
      const progress = Math.round(((chapterIndex + 1) / chapters.length) * 100);
      updateProgress(bookId, progress, chapter.id, 0);
    }
  };
};
