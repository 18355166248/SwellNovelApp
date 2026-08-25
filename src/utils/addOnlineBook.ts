/**
 * 把一个书源 URL 解析成 App 统一的 Book + Chapter[]（章节正文留空，阅读时懒加载）。
 */

import { Book, Chapter } from '../store/types/book';
import { resolveSource } from '../services/source/registry';

export interface OnlineBookResult {
  book: Book;
  chapters: Chapter[];
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
  if (bookUrl === url) return true;
  const source = resolveSource(url);
  if (!source || !source.matchUrl(bookUrl)) return false;
  const id = source.extractId(url);
  return !!id && id === source.extractId(bookUrl);
}

export async function addOnlineBook(url: string): Promise<OnlineBookResult> {
  const trimmed = url.trim();
  const source = resolveSource(trimmed);
  if (!source) throw new Error('暂不支持该网站，请粘贴 bookshuku.org 的书籍链接');

  const info = await source.parseBookInfo(trimmed);
  const metas = await source.parseCatalog(info);

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
