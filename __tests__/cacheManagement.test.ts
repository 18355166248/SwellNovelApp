import {
  clearAllChapterCache,
  clearReadChapterCache,
  formatCacheBytes,
  summarizeChapterCache,
} from '../src/utils/cacheManagement';
import type { Chapter } from '../src/store/types/book';

const chapters: Chapter[] = Array.from({ length: 8 }, (_, index) => ({
  id: `chapter-${index}`,
  bookId: 'book-1',
  title: `第 ${index + 1} 章`,
  content: `正文${index}`,
  order: index,
  sourceUrl: `https://example.com/${index}`,
  wordCount: 3,
}));

describe('cache management', () => {
  it('清理已读章节时保留当前章之前最近三章', () => {
    const next = clearReadChapterCache(chapters, 'chapter-6', 80, 3);
    expect(next.slice(0, 3).every(chapter => chapter.content === '')).toBe(true);
    expect(next.slice(3).every(chapter => chapter.content !== '')).toBe(true);
    expect(next[0].sourceUrl).toBe(chapters[0].sourceUrl);
  });

  it('清空缓存仍保留目录和源地址', () => {
    const next = clearAllChapterCache(chapters);
    expect(next.every(chapter => chapter.content === '')).toBe(true);
    expect(next[2].title).toBe(chapters[2].title);
    expect(next[2].sourceUrl).toBe(chapters[2].sourceUrl);
  });

  it('统计 UTF-8 正文占用并格式化', () => {
    const summary = summarizeChapterCache(chapters.slice(0, 2));
    expect(summary).toEqual({ cachedChapters: 2, bytes: 14 });
    expect(formatCacheBytes(1536)).toBe('1.5 KB');
  });
});
