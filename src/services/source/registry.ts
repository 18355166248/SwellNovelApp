/**
 * 书源注册表：按 URL 匹配对应书源。新增站点只需在此登记一个 BookSource。
 */

import { BookSource } from './types';
import { bookshukuSource } from './bookshuku';

export const SOURCES: BookSource[] = [bookshukuSource];

/** 按 URL 找到对应书源；无匹配返回 null。 */
export function resolveSource(url: string): BookSource | null {
  return SOURCES.find(s => s.matchUrl(url)) ?? null;
}

/** 按书源 id 查找（用于按已保存的 Book.source.name 定位）。 */
export function getSourceById(id: string): BookSource | null {
  return SOURCES.find(s => s.id === id) ?? null;
}
