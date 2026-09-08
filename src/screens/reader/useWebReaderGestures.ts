import React from 'react';
import { Platform } from 'react-native';
import { getBoundarySwipe } from '../../utils/readerScrollGuard';

/** 保留浏览器章内滚动，仅补齐章节首尾不会触发 overscroll 的触摸手势。 */
export function useWebReaderGestures(options: {
  sessionKey: string;
  enabled: boolean;
  pagesLength: number;
  currentPageIndexRef: React.MutableRefObject<number>;
  onUserScroll: () => void;
  onTurn: (delta: number) => void;
  suppressPressUntilRef: React.MutableRefObject<number>;
}) {
  const latest = React.useRef(options);
  latest.current = options;
  const { sessionKey, enabled } = options;
  React.useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const root = document.querySelector('[data-testid="reader-page-list"]');
    if (!root) return;
    let start: { x: number; y: number; pageIndex: number; id: number } | null =
      null;
    const onWheel = () => latest.current.onUserScroll();
    const onStart = (event: Event) => {
      const touches = (event as TouchEvent).touches;
      start = null;
      if (touches.length !== 1) return;
      latest.current.onUserScroll();
      const touch = touches[0];
      start = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
        pageIndex: latest.current.currentPageIndexRef.current,
      };
    };
    const onEnd = (event: Event) => {
      const gesture = start;
      start = null;
      if (!gesture || latest.current.sessionKey !== sessionKey) return;
      const touch = Array.from((event as TouchEvent).changedTouches).find(
        item => item.identifier === gesture.id,
      );
      if (!touch) return;
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        latest.current.suppressPressUntilRef.current = Date.now() + 350;
      }
      const delta = getBoundarySwipe({
        deltaX,
        deltaY,
        startPageIndex: gesture.pageIndex,
        pagesLength: latest.current.pagesLength,
      });
      if (delta != null) latest.current.onTurn(delta);
    };
    const onMove = (event: Event) => {
      if (!start) return;
      const touch = Array.from((event as TouchEvent).touches).find(
        item => item.identifier === start?.id,
      );
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const outward =
        (start.pageIndex === 0 && dx > 0) ||
        (start.pageIndex === latest.current.pagesLength - 1 && dx < 0);
      // 首尾向外滑动由阅读器消费，避免触发浏览器的历史前进/后退手势。
      if (outward && Math.abs(dx) > Math.abs(dy) * 1.5 && event.cancelable) {
        event.preventDefault();
      }
    };
    const onCancel = () => {
      start = null;
    };
    root.addEventListener('wheel', onWheel, { passive: true });
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchcancel', onCancel);
    };
  }, [sessionKey, enabled]);
}
