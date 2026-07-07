export type BoundaryTurn = 'prev' | 'next';

export type BoundaryTurnInput = {
  offsetX: number;
  pageIndex: number;
  pagesLength: number;
  viewportWidth: number;
  chapterIndex: number;
  totalChapters: number;
  locked: boolean;
  threshold?: number;
};

export function getBoundaryTurn({
  offsetX,
  pageIndex,
  pagesLength,
  viewportWidth,
  chapterIndex,
  totalChapters,
  locked,
  threshold = 40,
}: BoundaryTurnInput): BoundaryTurn | null {
  if (locked || pagesLength <= 0 || viewportWidth <= 0) return null;

  if (pageIndex === 0 && offsetX < -threshold && chapterIndex > 0) {
    return 'prev';
  }

  const lastPageIndex = pagesLength - 1;
  const lastPageOffset = lastPageIndex * viewportWidth;
  if (
    pageIndex === lastPageIndex &&
    offsetX > lastPageOffset + threshold &&
    chapterIndex < totalChapters - 1
  ) {
    return 'next';
  }

  return null;
}

export function isStaleScrollSync(
  scheduledEpoch: number,
  currentEpoch: number,
): boolean {
  return scheduledEpoch !== currentEpoch;
}
