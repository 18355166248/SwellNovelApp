/**
 * 书源注册表：按 URL 匹配对应书源。新增站点只需在此登记一个 BookSource。
 */

import { BookSource } from './types';
import { bookshukuSource } from './bookshuku';
import { mingzwSource } from './mingzw';
import { xuanhuangeSource } from './xuanhuange';

export const SOURCES: BookSource[] = [
  bookshukuSource,
  mingzwSource,
  xuanhuangeSource,
];

/** 按 URL 找到对应书源；无匹配返回 null。 */
export function resolveSource(url: string): BookSource | null {
  return SOURCES.find(s => s.matchUrl(url)) ?? null;
}

/** 书源站点的可浏览首页，供内置浏览器的常用站点入口使用。 */
export function getSourceHomeUrl(source: BookSource): string {
  return source.homeUrl ?? `http://${source.host}/`;
}

/** 按书源 id 查找（用于按已保存的 Book.source.name 定位）。 */
export function getSourceById(id: string): BookSource | null {
  return SOURCES.find(s => s.id === id) ?? null;
}
