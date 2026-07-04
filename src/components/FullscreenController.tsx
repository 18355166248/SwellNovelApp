/**
 * 全屏/沉浸模式的全局控制器。
 *
 * 挂在应用根部（Provider 内），把持久化的 fullscreen 偏好应用到平台，并让外部
 * 状态变化回写偏好，实现「设置一次、下次自动恢复」：
 *
 * - 原生：偏好为真则隐藏状态栏（沉浸阅读），无需用户手势，可直接在启动时套用。
 * - Web：进入浏览器全屏必须在用户手势调用栈内，无法在加载时静默进入。因此偏好为
 *   真而当前非全屏时，挂一次性 pointerdown 监听——用户回到页面后的第一次点击即自动
 *   恢复全屏，之后不必再点全屏按钮。用户按 Esc 退出会经 fullscreenchange 回写偏好，
 *   不会在下次点击时又被强行拉回全屏。
 */
import React from 'react';
import { Platform } from 'react-native';
import { useReaderSettings, useSetFullscreenPref } from '../store';
import {
  isFullscreen as fsIsFullscreen,
  setFullscreen,
  subscribeFullscreen,
} from '../utils/fullscreen';

export function FullscreenController() {
  const settings = useReaderSettings();
  const setFullscreenPref = useSetFullscreenPref();
  const enabled = !!settings.fullscreen;

  // 把实际全屏状态回写到持久化偏好：原生切换、Web 的 Esc 退出 / 手势进入都会走这里。
  React.useEffect(
    () => subscribeFullscreen(isFs => setFullscreenPref(isFs)),
    [setFullscreenPref],
  );

  // 应用偏好。
  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      setFullscreen(enabled);
      return;
    }
    if (enabled === fsIsFullscreen()) return;
    if (enabled) {
      // 只能在用户手势内进入全屏，挂一次性监听，首次点击即恢复。
      const enter = () => setFullscreen(true);
      window.addEventListener('pointerdown', enter, { once: true });
      return () => window.removeEventListener('pointerdown', enter);
    }
    // 退出全屏无需手势，可直接执行。
    setFullscreen(false);
  }, [enabled]);

  return null;
}
