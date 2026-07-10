/**
 * 全屏/沉浸模式的全局控制器。
 *
 * 挂在应用根部（Provider 内），仅负责 Web Fullscreen API 的持久化偏好。
 * 原生阅读器的状态栏由 native-stack 根据工具栏显隐实时控制，不持久化。
 * Web 进入浏览器全屏必须在用户手势调用栈内，无法在加载时静默进入，因此偏好为
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

  // 原生阅读器的沉浸状态是临时 UI 状态，不写入偏好；Web 才需要记住
  // Fullscreen API 的进入/Esc 退出结果。
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    return subscribeFullscreen(isFs => setFullscreenPref(isFs));
  }, [setFullscreenPref]);

  // 应用偏好。
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
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
