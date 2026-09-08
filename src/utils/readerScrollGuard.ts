export type BoundaryTurn = 'prev' | 'next';
export type ChapterNavigationIntent = BoundaryTurn | 'direct';
export type ChapterLanding = 'first' | 'last';

/** Web 在章节首尾不会产生越界 scrollOffset，需按触点位移识别向外滑动。 */
export function getBoundarySwipe({
  deltaX,
  deltaY,
  startPageIndex,
  pagesLength,
}: {
  deltaX: number;
  deltaY: number;
  startPageIndex: number;
  pagesLength: number;
}): -1 | 1 | null {
  if (
    pagesLength < 1 ||
    Math.abs(deltaX) < 40 ||
    Math.abs(deltaX) < Math.abs(deltaY) * 1.5
  )
    return null;
  if (startPageIndex === 0 && deltaX > 0) return -1;
  if (startPageIndex === pagesLength - 1 && deltaX < 0) return 1;
  return null;
}

export type BoundaryTurnInput = {
  offsetX: number;
  pageIndex: number;
  pagesLength: number;
  viewportWidth: number;
  chapterIndex: number;
  totalChapters: number;
  locked: boolean;
  threshold?: number;
  /** 已统一为内容滚动方向的松手速度；正值向下一页，负值向上一页。 */
  releaseVelocityX?: number;
  velocityThreshold?: number;
};

export type BoundaryTurnGestureState = {
  chapterId?: string;
  dragging: boolean;
  consumed: boolean;
};

/**
 * 目标章节已经成为当前章且退出 loading 时，UI 已可交互，旧切章任务应视为完成。
 * 不能只等被动 effect 清锁，否则首帧与 effect 之间的快速反向手势会被误拒绝。
 */
export function isChapterSwitchInFlight(
  targetChapterIndex: number | null,
  currentChapterIndex: number,
  status: 'ready' | 'loading' | 'error',
): boolean {
  return (
    targetChapterIndex !== null &&
    (targetChapterIndex !== currentChapterIndex || status === 'loading')
  );
}

/**
 * 只接受当前章节正在进行、且尚未消费的真实拖动。章节标识校验用于隔离列表
 * 重建后迟到的旧 onScroll 回调，避免它误操作已经展示的新章节。
 */
export function canHandleBoundaryTurnGesture(
  gesture: BoundaryTurnGestureState,
  currentChapterId?: string,
): boolean {
  return (
    gesture.dragging &&
    !gesture.consumed &&
    gesture.chapterId === currentChapterId
  );
}

export function getBoundaryTurn({
  offsetX,
  pageIndex,
  pagesLength,
  viewportWidth,
  chapterIndex,
  totalChapters,
  locked,
  threshold = 40,
  releaseVelocityX = 0,
  velocityThreshold = Number.POSITIVE_INFINITY,
}: BoundaryTurnInput): BoundaryTurn | null {
  if (locked || pagesLength <= 0 || viewportWidth <= 0) return null;

  if (
    pageIndex === 0 &&
    (offsetX < -threshold ||
      (offsetX <= 1 && releaseVelocityX < -velocityThreshold)) &&
    chapterIndex > 0
  ) {
    return 'prev';
  }

  const lastPageIndex = pagesLength - 1;
  const lastPageOffset = lastPageIndex * viewportWidth;
  if (
    pageIndex === lastPageIndex &&
    (offsetX > lastPageOffset + threshold ||
      (offsetX >= lastPageOffset - 1 &&
        releaseVelocityX > velocityThreshold)) &&
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
): ChapterLanding {
  // 落点由阅读方向决定；远程章保留落点意图，等正文就绪后再定位。
  return intent === 'prev' ? 'last' : 'first';
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
