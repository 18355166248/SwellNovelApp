import type { Chapter } from '../store/types/book';

export interface CacheSummary {
  cachedChapters: number;
  bytes: number;
}

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function summarizeChapterCache(chapters: Chapter[]): CacheSummary {
  return chapters.reduce<CacheSummary>(
    (summary, chapter) => {
      if (!chapter.content) return summary;
      summary.cachedChapters += 1;
      summary.bytes += utf8ByteLength(chapter.content);
      return summary;
    },
    { cachedChapters: 0, bytes: 0 },
  );
}

function clearChapterContent(chapter: Chapter): Chapter {
  if (!chapter.content) return chapter;
  return {
    ...chapter,
    content: '',
    wordCount: undefined,
    contentVersion: undefined,
    nextPageUrl: undefined,
    contentComplete: undefined,
  };
}

/** 清空正文缓存但保留目录、源地址与章节标题，后续阅读时可重新按需加载。 */
export function clearAllChapterCache(chapters: Chapter[]): Chapter[] {
  return chapters.map(clearChapterContent);
}

/**
 * 清理当前章之前的已读缓存，并保留最近若干章，避免用户回看上一章时立即联网。
 * currentChapterId 缺失时按 progress 估算当前章；尚未开始阅读则不做清理。
 */
export function clearReadChapterCache(
  chapters: Chapter[],
  currentChapterId: string | undefined,
  progress: number,
  keepRecent = 3,
): Chapter[] {
  if (chapters.length === 0) return chapters;
  let currentIndex = currentChapterId
    ? chapters.findIndex(chapter => chapter.id === currentChapterId)
    : -1;
  if (currentIndex < 0 && progress > 0) {
    currentIndex = Math.max(
      0,
      Math.min(chapters.length - 1, Math.ceil((progress / 100) * chapters.length) - 1),
    );
  }
  if (currentIndex < 0) return chapters;
  const clearBefore = Math.max(0, currentIndex - Math.max(0, keepRecent));
  return chapters.map((chapter, index) =>
    index < clearBefore ? clearChapterContent(chapter) : chapter,
  );
}

export function formatCacheBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
