import { Chapter } from '../store/types/book';

/** 根据已保存的 currentChapterId 找回续读位置，找不到则从头开始 */
export function resumeChapterIndex(chapters: Chapter[], currentChapterId?: string): number {
  if (!currentChapterId) return 0;
  const idx = chapters.findIndex((c) => c.id === currentChapterId);
  return idx >= 0 ? idx : 0;
}
