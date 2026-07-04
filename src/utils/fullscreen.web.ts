/**
 * 全屏能力（Web）
 *
 * 浏览器默认带地址栏/标签栏，不是全屏。用 Fullscreen API 让整页真正全屏，
 * 并兼容 WebKit 前缀。注意 iPhone 上的 Safari 不支持元素级全屏，此时
 * isFullscreenSupported 为 false，调用方据此隐藏入口，避免出现无效按钮。
 */

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const doc: FsDocument | null =
  typeof document !== 'undefined' ? (document as FsDocument) : null;
const root: FsElement | null = doc
  ? (doc.documentElement as FsElement)
  : null;

export const isFullscreenSupported =
  !!root && !!(root.requestFullscreen || root.webkitRequestFullscreen);

export function isFullscreen(): boolean {
  if (!doc) return false;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function setFullscreen(next: boolean): void {
  if (!doc || !root) return;
  if (next === isFullscreen()) return;
  if (next) {
    Promise.resolve(
      root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.(),
    ).catch(() => {});
  } else {
    Promise.resolve(
      doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.(),
    ).catch(() => {});
  }
}

export function toggleFullscreen(): void {
  setFullscreen(!isFullscreen());
}

export function exitFullscreen(): void {
  // 浏览器全屏可由用户按 Esc 退出，离开阅读器时不强制退出，尊重用户预期。
  // 仅在明确需要时调用（原生端才会在离开时恢复状态栏）。
  if (isFullscreen()) setFullscreen(false);
}

export function subscribeFullscreen(cb: (v: boolean) => void): () => void {
  if (!doc) return () => {};
  const handler = () => cb(isFullscreen());
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler);
  };
}
