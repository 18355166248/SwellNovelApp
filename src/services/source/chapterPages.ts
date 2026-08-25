/**
 * 网页分页章节的合并。
 *
 * 部分站点把一章拆成多个网页子页（正文末尾给出“下一页”），而阅读器需要的是
 * 完整一章。这里只负责按 nextPageUrl 依次取完剩余子页并拼接；取页与正文清洗由
 * 调用方注入，因此 WebView 识别源与注册书源都能复用同一套合并规则。
 */

import { isBlockedText } from './contentGuards';

/** 分页链接成环时的抓取上限，避免无限翻页。 */
export const MAX_CHAPTER_PAGES = 20;

/** 单个子页的抓取结果：正文原文 + 页面标注的下一子页。 */
export interface ChapterPageResult {
  content: string;
  nextPageUrl?: string;
}

export interface CollectChapterPagesOptions {
  /** 已抓到并清洗过的首个子页正文。 */
  firstContent: string;
  /** 首个子页指向的下一子页；为空表示本章只有一页。 */
  firstNextPageUrl?: string;
  /** 取指定子页；抛错表示该页本次不可用。 */
  fetchPage: (url: string) => Promise<ChapterPageResult>;
  /** 子页正文清洗，通常用于剥离每页重复的章节名。 */
  cleanPage: (raw: string) => string;
  maxPages?: number;
  /** 子页抓取失败时的上报钩子，便于调用方打日志。 */
  onError?: (url: string, error: unknown) => void;
}

/**
 * 从首个子页出发合并整章。
 *
 * 中途遇到空白页、广告/拦截页或抓取失败都会停止合并，并把停在哪一页通过
 * nextPageUrl 返回：已读到的正文不会作废，调用方可把它当作续载入口按需重试。
 */
export async function collectChapterPages({
  firstContent,
  firstNextPageUrl,
  fetchPage,
  cleanPage,
  maxPages = MAX_CHAPTER_PAGES,
  onError,
}: CollectChapterPagesOptions): Promise<ChapterPageResult> {
  let content = firstContent;
  let cursor = firstNextPageUrl;
  let guard = 0;
  while (cursor && guard < maxPages) {
    guard += 1;
    const pageUrl = cursor;
    try {
      const page = await fetchPage(pageUrl);
      // 子页是整章的一部分，尾页天然可能很短，不能套用整章字数门槛；
      // 这里只挡空白页和广告/拦截页，整章长度由首页校验保证。
      const text = cleanPage(page.content);
      if (!text || isBlockedText(text)) break;
      content = content ? `${content}\n${text}` : text;
      cursor = page.nextPageUrl;
    } catch (error) {
      onError?.(pageUrl, error);
      break;
    }
  }
  return { content, nextPageUrl: cursor };
}
