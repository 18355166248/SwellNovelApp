/**
 * 全屏能力（原生：iOS / Android）
 *
 * 原生 App 本就占满屏幕，这里的“全屏”指沉浸式阅读——隐藏顶部状态栏（时间/电量）。
 * 状态栏的实际隐藏由根组件 AppContent 声明式渲染 <StatusBar hidden={偏好} /> 完成，
 * 避免与应用其它 StatusBar 声明相互覆盖；本模块只维护逻辑开关与订阅，供全屏按钮
 * 读取图标状态、供 FullscreenController 回写偏好。Web 端由 fullscreen.web.ts 覆盖。
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
