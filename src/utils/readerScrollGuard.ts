export type BoundaryTurn = 'prev' | 'next';
export type ChapterNavigationIntent = BoundaryTurn | 'direct';
export type ChapterLanding = 'first' | 'last';

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

export function getChapterLanding(
  intent: ChapterNavigationIntent = 'direct',
  targetContentAvailable = true,
): ChapterLanding {
  // 返回上一章只有在正文已经就绪时才落末页；远程章先落首页，避免加载完成后
  // 又做一次从首页到末页的远距离虚拟列表跳转。
  return intent === 'prev' && targetContentAvailable ? 'last' : 'first';
}

/**
 * 换章时首帧应该挂载的页码。上一章直接从末页创建列表，避免先露出首页再补滚；
 * 下一章和目录直达则从首页开始。
 */
export function getChapterLandingPage(
  landing: ChapterLanding,
  pagesLength: number,
): number {
  if (landing !== 'last' || pagesLength <= 0) return 0;
  return pagesLength - 1;
}
