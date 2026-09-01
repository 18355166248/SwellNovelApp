import type { Book } from '../store/types/book';

type CompletionBook = Pick<
  Book,
  'finishedAt' | 'lastReadAt' | 'progress' | 'updatedAt'
>;

/** 新数据认 finishedAt；旧数据没有该字段时才用 100% 进度兼容。 */
export function isBookFinished(book: CompletionBook): boolean {
  return typeof book.finishedAt === 'number' || book.progress >= 100;
}

export function bookFinishedInYear(
  book: CompletionBook,
  year: number,
): boolean {
  const completedAt =
    typeof book.finishedAt === 'number'
      ? book.finishedAt
      : book.progress >= 100
      ? book.lastReadAt ?? book.updatedAt
      : undefined;
  return (
    completedAt !== undefined &&
    new Date(completedAt).getFullYear() === year
  );
}
