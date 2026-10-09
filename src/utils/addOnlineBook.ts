/**
 * 把一个书源 URL 解析成 App 统一的 Book + Chapter[]（章节正文留空，阅读时懒加载）。
 */

import { Book, Chapter } from '../store/types/book';
import { StandardURL as URL } from './standardUrl';
import { resolveSource } from '../services/source/registry';
import type { ParsedChapter } from '../services/source/types';
import { normalizedChapterIdentity } from './catalogRepair';
import {
  enrichBookMetadata,
  needsBookMetadata,
} from '../services/recognize/enrichBookMetadata';

export interface OnlineBookResult {
  book: Book;
  chapters: Chapter[];
}

/** 搜索详情页与浏览器目录页共用站内书号，入库请求也用同一身份合并。 */
export function onlineBookImportKey(url: string): string {
  const trimmed = url.trim();
  const source = resolveSource(trimmed);
  const sourceBookId = source?.extractId(trimmed);
  return source && sourceBookId
    ? `${source.id}:${sourceBookId}`
    : normalizedChapterIdentity(trimmed) ?? trimmed;
}

/** 未注册站点也按完整 URL 生成稳定 id，不能只取路径数字（不同书可能共用年份）。 */
export function recognizedBookImportId(url: string, host: string): string {
  const identity = onlineBookImportKey(url);
  if (!identity.startsWith('url:') && !identity.startsWith('raw:'))
    return identity;
  let first = 17;
  let second = 5381;
  for (let index = 0; index < identity.length; index++) {
    const character = identity.charCodeAt(index);
    first = (first * 31 + character) % 2147483647;
    second = (second * 37 + character) % 2147483629;
  }
  return `browser:${host}:${first.toString(16)}-${second.toString(16)}`;
}

/** 目录分页会重复带上最新章链接；以来源身份去重，避免入库后同一章出现两次。 */
export function normalizeOnlineCatalog(
  metas: ParsedChapter[],
): ParsedChapter[] {
  const seen = new Set<string>();
  const chapters = metas.filter(meta => {
    try {
      if (!/^https?:$/.test(new URL(meta.url).protocol)) return false;
    } catch {
      return false;
    }
    const identity = normalizedChapterIdentity(meta.url)!;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  if (!chapters.length) {
    throw new Error('未获取到可阅读的章节目录，请刷新书籍页面后重试');
  }
  return chapters.map((meta, index) => ({
    ...meta,
    title: meta.title.trim() || `第${index + 1}章`,
  }));
}

/**
 * 判断书架里的某本书是否就是该链接指向的那本。
 *
 * 同一本书可能有两种来源：内置浏览器识别（source.name 为站点 host、bookUrl 是目录页）
 * 与注册书源（source.name 为书源 id、bookUrl 是详情页）。只比对 URL 会把它们当成两本，
 * 因此同属一个书源时改按站内书号判定，避免重复加入书架。
 */
export function isSameOnlineBook(book: Book, url: string): boolean {
  const bookUrl = book.source?.bookUrl;
  if (!bookUrl) return false;
  return onlineBookImportKey(bookUrl) === onlineBookImportKey(url);
}

export async function addOnlineBook(url: string): Promise<OnlineBookResult> {
  const trimmed = url.trim();
  const source = resolveSource(trimmed);
  if (!source)
    throw new Error('暂不支持该网站，请在内置浏览器打开书籍目录后加入书架');

  const info = await source.parseBookInfo(trimmed);
  if (!info.title.trim() || !info.sourceBookId.trim()) {
    throw new Error('未获取到有效书籍信息，请确认链接并稍后重试');
  }
  if (needsBookMetadata(info)) {
    const { book: metadata } = await enrichBookMetadata({
      ...info,
      ok: true,
      isDetail: true,
      url: trimmed,
      host: '',
      chapters: [],
    });
    Object.assign(info, {
      title: metadata.title || info.title,
      author: metadata.author || info.author,
      cover: metadata.cover,
      description: metadata.description || info.description,
    });
  }
  const metas = normalizeOnlineCatalog(await source.parseCatalog(info));

  // 稳定 id：同一本书重复添加可复用已缓存目录/正文，避免重复入库。
  const bookId = `${source.id}:${info.sourceBookId}`;
  const now = Date.now();

  const book: Book = {
    id: bookId,
    title: info.title,
    author: info.author,
    cover: info.cover,
    description: info.description,
    addedAt: now,
    updatedAt: now,
    progress: 0,
    totalChapters: metas.length,
    source: { name: source.id, bookUrl: info.catalogUrl },
  };

  const chapters: Chapter[] = metas.map((m, i) => ({
    id: `${bookId}-${i}`,
    bookId,
    title: m.title,
    content: '', // 空 = 未抓取；打开时懒加载并缓存
    order: i,
    sourceUrl: m.url,
  }));

  return { book, chapters };
}
