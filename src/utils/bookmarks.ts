import type { Bookmark } from '../store/types/book';

/** 切换单章普通书签；摘抄与笔记虽然共用列表，但永远不能被该操作删除。 */
export function togglePlainBookmark(
  list: Bookmark[],
  bookId: string,
  chapterId: string,
  position: number,
  now = Date.now(),
): Bookmark[] {
  const existing = list.find(
    item => item.chapterId === chapterId && !item.excerpt,
  );
  if (existing) {
    return list.filter(item => item.id !== existing.id);
  }
  return [
    ...list,
    {
      id: `${bookId}-${chapterId}-${now}`,
      bookId,
      chapterId,
      position,
      createdAt: now,
    },
  ];
}

/** 保存摘抄；同章同位置再次保存时更新正文/笔记并保留原 id 与创建时间。 */
export function upsertExcerpt(
  list: Bookmark[],
  bookId: string,
  chapterId: string,
  position: number,
  excerpt: string,
  note?: string,
  now = Date.now(),
): Bookmark[] {
  const normalizedExcerpt = excerpt.trim();
  if (!normalizedExcerpt) return list;
  const existingIndex = list.findIndex(
    item =>
      item.chapterId === chapterId &&
      item.position === position &&
      !!item.excerpt,
  );
  const previous = existingIndex >= 0 ? list[existingIndex] : undefined;
  const saved: Bookmark = {
    id: previous?.id ?? `${bookId}-${chapterId}-excerpt-${now}`,
    bookId,
    chapterId,
    position,
    excerpt: normalizedExcerpt,
    note: note?.trim() || undefined,
    createdAt: previous?.createdAt ?? now,
  };
  if (existingIndex < 0) return [...list, saved];
  const next = list.slice();
  next[existingIndex] = saved;
  return next;
}
