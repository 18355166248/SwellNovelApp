import type { Chapter } from '../store/types/book';

export function formatReaderClock(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatReaderChapterLabel(
  chapter: Pick<Chapter, 'title'> | undefined,
  index: number,
): string {
  const title = chapter?.title?.replace(/\s+/g, ' ').trim();
  return title || `第 ${index + 1} 章`;
}
