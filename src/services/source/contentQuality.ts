import type { Chapter } from '../../store/types/book';
import { isBlockedText } from './contentGuards';

/**
 * 所有在线正文共用同一解析版本。提升版本会让旧版本缓存按需重抓，避免书源修复后
 * 仍永久复用已经落盘的残缺章节；本地 TXT 没有 source，不受影响。
 */
export const ONLINE_CONTENT_VERSION = 9;
export const MIN_ONLINE_CHAPTER_CHARS = 200;

interface OnlineChapterQualityOptions {
  trustedShort?: boolean;
}

export function isInvalidOnlineChapterContent(
  content?: string,
  options: OnlineChapterQualityOptions = {},
): boolean {
  if (!content) return true;
  if (isBlockedText(content)) return true;
  const length = content.replace(/\s+/g, '').length;
  // 不能全局降低 200 字门槛；只有书源已经用页面结构确认过的短章才能放行。
  return (
    length < MIN_ONLINE_CHAPTER_CHARS && !(options.trustedShort && length >= 2)
  );
}

export function isOnlineChapterCacheUsable(
  chapter: Chapter | undefined,
  sourceName?: string,
): boolean {
  if (!chapter?.content) return false;
  // 无 source 的本地书正文由文件解析产生，不套用网络响应质量与版本规则。
  if (!sourceName) return true;
  return (
    chapter.contentVersion === ONLINE_CONTENT_VERSION &&
    !isInvalidOnlineChapterContent(chapter.content, {
      trustedShort: chapter.contentTrustedShort,
    })
  );
}
