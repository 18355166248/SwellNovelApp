/**
 * 全屏能力（原生：iOS / Android）
 *
 * 原生 App 本就占满屏幕，这里的“全屏”指沉浸式阅读——隐藏顶部状态栏（时间/电量）。
 * 本模块只维护逻辑开关与订阅；阅读器页面的原生状态栏由 native-stack 对应的
 * UIViewController 管理。Web 端由 fullscreen.web.ts 覆盖。
 */

export const isFullscreenSupported = true;

let fsState = false;
const listeners = new Set<(v: boolean) => void>();

export function isFullscreen(): boolean {
  return fsState;
}

export function setFullscreen(next: boolean): void {
  if (fsState === next) return;
  fsState = next;
  listeners.forEach(l => l(fsState));
}

export function toggleFullscreen(): void {
  setFullscreen(!fsState);
}

export function exitFullscreen(): void {
  setFullscreen(false);
}

export function subscribeFullscreen(cb: (v: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
