/**
 * 阅读计时会话（全局单例、引用计数）。
 *
 * 只在前台连续时间内累加：单次间隔超过 5 分钟视为切后台/离开，丢弃该段。
 * 用模块级引用计数保证——即便阅读器在导航过渡中短暂出现两个实例，也只有一个
 * 计时器在跑，不会把同一段时间重复计入。Web 切标签页、原生切后台时暂停。
 */

import { AppState, Platform } from 'react-native';

const MAX_GAP_MS = 5 * 60 * 1000;
const TICK_MS = 20 * 1000;

let refCount = 0;
let lastTs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let flushCb: ((ms: number) => void) | null = null;
let foreground = true;
let removeForegroundListener: (() => void) | null = null;

function accrue() {
  const now = Date.now();
  const delta = now - lastTs;
  lastTs = now;
  if (foreground && delta > 0 && delta < MAX_GAP_MS && flushCb) flushCb(delta);
}

function setForeground(next: boolean) {
  if (next === foreground) return;
  // 离开前只结算当前可见的尾段；定时器即使仍运行，也不能计入任何后台时间。
  if (foreground) accrue();
  foreground = next;
  lastTs = Date.now();
}

/**
 * 开始一段阅读计时，flush(ms) 会被周期性调用以累加时长。返回停止函数。
 * 多次调用会共用同一个计时器（引用计数），全部停止后才结算并清理。
 */
export function startReadingSession(flush: (ms: number) => void): () => void {
  flushCb = flush;
  refCount += 1;
  if (refCount === 1) {
    foreground =
      Platform.OS === 'web'
        ? typeof document === 'undefined' ||
          document.visibilityState === 'visible'
        : // 原生桥启动时可能返回 unknown；只排除明确的后台态，避免首个前台会话漏计。
          AppState.currentState !== 'background' &&
          AppState.currentState !== 'inactive';
    lastTs = Date.now();
    timer = setInterval(accrue, TICK_MS);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibility = () =>
        setForeground(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      removeForegroundListener = () =>
        document.removeEventListener('visibilitychange', onVisibility);
    } else if (Platform.OS !== 'web') {
      const subscription = AppState.addEventListener('change', state =>
        setForeground(state === 'active'),
      );
      removeForegroundListener = () => subscription.remove();
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    refCount -= 1;
    if (refCount === 0) {
      accrue(); // 结算最后一段
      if (timer) clearInterval(timer);
      timer = null;
      removeForegroundListener?.();
      removeForegroundListener = null;
      flushCb = null;
    }
  };
}
