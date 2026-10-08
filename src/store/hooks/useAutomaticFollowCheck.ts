import React from 'react';
import { useIsFocused } from '@react-navigation/native';

interface FollowResult {
  updated: number;
  failed: number;
  cached: number;
}

export function useAutomaticFollowCheck(
  enabled: boolean,
  check: () => Promise<FollowResult>,
) {
  const focused = useIsFocused();
  const started = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const checkRef = React.useRef(check);
  checkRef.current = check;
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<FollowResult | null>(null);

  React.useEffect(() => {
    if (!enabled || !focused || started.current) return;
    let cancelled = false;
    let idle: ReturnType<typeof requestIdleCallback> | undefined;
    // 首屏和用户刚打开 App 的点击优先；离开书架会取消尚未开始的检查。
    // 不设置 idle 超时，避免期限到达时强行挤占正在处理菜单切换的 JS 线程。
    const run = () => {
      if (cancelled) return;
      started.current = true;
      setChecking(true);
      checkRef
        .current()
        .then(value => {
          if (mounted.current) setResult(value);
        })
        .catch(error => {
          // 自动检查失败不打断菜单操作，用户仍可手动重试。
          console.warn('[Bookshelf] automatic follow check failed', error);
        })
        .finally(() => {
          if (mounted.current) setChecking(false);
        });
    };
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') {
        idle = requestIdleCallback(run);
      } else {
        // 部分 Web 浏览器没有 idle API；仍先让出首屏展示与最初的菜单点击。
        run();
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [enabled, focused]);

  return { checking, result };
}
