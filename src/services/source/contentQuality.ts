import type { Chapter } from '../../store/types/book';
import { isBlockedText } from './contentGuards';

/**
 * 所有在线正文共用同一解析版本。提升版本会让旧版本缓存按需重抓，避免书源修复后
 * 仍永久复用已经落盘的残缺章节；本地 TXT 没有 source，不受影响。
 */
// 10：正文改由 contentNoise 统一剔除站点水印与翻页提示；
// 9 版缓存里仍夹着“最新网址:xxx”这类噪声行，需要重抓才能清掉。
export const ONLINE_CONTENT_VERSION = 10;
// 3：同上，浏览器识别源的正文也要按新的噪声规则重抓；
// 2：改为一次抓完整章的所有网页子页，1 版缓存里只有第一子页。
export const BROWSER_CONTENT_VERSION = 3;
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
  // 浏览器识别来源以 host 作为 source name。它过去会把章节网页的第一页误判成整章，
  // 因此单独校验版本，修复时只重抓这类缓存，不影响内置书源的离线正文。
  if (
    sourceName.includes('.') &&
    chapter.browserContentVersion !== BROWSER_CONTENT_VERSION
  ) {
    return false;
  }
  return (
    chapter.contentVersion === ONLINE_CONTENT_VERSION &&
    !isInvalidOnlineChapterContent(chapter.content, {
      trustedShort: chapter.contentTrustedShort,
    })
  );
}
