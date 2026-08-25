import {
  BROWSER_CONTENT_VERSION,
  isInvalidOnlineChapterContent,
  isOnlineChapterCacheUsable,
  ONLINE_CONTENT_VERSION,
} from '../src/services/source/contentQuality';
import type { Chapter } from '../src/store/types/book';

const chapter = (
  content: string,
  contentVersion?: number,
  contentTrustedShort?: boolean,
): Chapter => ({
  id: 'chapter-1',
  bookId: 'book-1',
  title: '第一章',
  content,
  contentVersion,
  contentTrustedShort,
  order: 0,
});

describe('online chapter content quality', () => {
  it('拦截短响应和挑战页，避免写成完整章节', () => {
    expect(isInvalidOnlineChapterContent('只有一小段')).toBe(true);
    expect(
      isInvalidOnlineChapterContent(
        'Enable JavaScript and cookies to continue',
      ),
    ).toBe(true);
    expect(isInvalidOnlineChapterContent('有效正文。'.repeat(80))).toBe(false);
  });

  it('只放行书源结构校验过的短章，拦截页即使标记可信也不能缓存', () => {
    expect(
      isInvalidOnlineChapterContent('状态不好，休息一天。', {
        trustedShort: true,
      }),
    ).toBe(false);
    expect(
      isInvalidOnlineChapterContent('请在浏览器中打开后继续阅读', {
        trustedShort: true,
      }),
    ).toBe(true);
  });

  it('所有在线来源都要求当前缓存版本，本地书不受影响', () => {
    const valid = '有效正文。'.repeat(80);
    expect(isOnlineChapterCacheUsable(chapter(valid), 'mingzw')).toBe(false);
    expect(
      isOnlineChapterCacheUsable(
        {
          ...chapter(valid, ONLINE_CONTENT_VERSION),
          browserContentVersion: BROWSER_CONTENT_VERSION,
        },
        'example.com',
      ),
    ).toBe(true);
    expect(isOnlineChapterCacheUsable(chapter(valid), undefined)).toBe(true);
    expect(
      isOnlineChapterCacheUsable(
        chapter('状态不好，休息一天。', ONLINE_CONTENT_VERSION, true),
        'bookshuku',
      ),
    ).toBe(true);
  });

  it('浏览器识别来源单独失效旧缓存，不影响内置书源缓存', () => {
    const valid = '有效正文。'.repeat(80);
    const current = chapter(valid, ONLINE_CONTENT_VERSION);
    expect(isOnlineChapterCacheUsable(current, 'wap.xuanhuange.info')).toBe(
      false,
    );
    expect(
      isOnlineChapterCacheUsable(
        { ...current, browserContentVersion: BROWSER_CONTENT_VERSION },
        'wap.xuanhuange.info',
      ),
    ).toBe(true);
    expect(isOnlineChapterCacheUsable(current, 'mingzw')).toBe(true);
  });

  it('浏览器识别来源的 1 版缓存只有首个子页，必须整体重抓', () => {
    const valid = '有效正文。'.repeat(80);
    expect(
      isOnlineChapterCacheUsable(
        {
          ...chapter(valid, ONLINE_CONTENT_VERSION),
          browserContentVersion: 1,
        },
        'wap.xuanhuange.info',
      ),
    ).toBe(false);
  });
});
