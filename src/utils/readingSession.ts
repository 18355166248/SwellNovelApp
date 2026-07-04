/**
 * 阅读计时会话（全局单例、引用计数）。
 *
 * 只在前台连续时间内累加：单次间隔超过 5 分钟视为切后台/离开，丢弃该段。
 * 用模块级引用计数保证——即便阅读器在导航过渡中短暂出现两个实例，也只有一个
 * 计时器在跑，不会把同一段时间重复计入。Web 端切标签页时暂停、回前台重置基准。
 */

const MAX_GAP_MS = 5 * 60 * 1000;
const TICK_MS = 20 * 1000;

let refCount = 0;
let lastTs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let flushCb: ((ms: number) => void) | null = null;

function accrue() {
  const now = Date.now();
  const delta = now - lastTs;
  lastTs = now;
  if (delta > 0 && delta < MAX_GAP_MS && flushCb) flushCb(delta);
}

function onVisibility() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') {
    lastTs = Date.now(); // 回前台：重置基准，别把离开的时间算进来
  } else {
    accrue(); // 切后台：先把可见期间的时间落一次
  }
}

/**
 * 开始一段阅读计时，flush(ms) 会被周期性调用以累加时长。返回停止函数。
 * 多次调用会共用同一个计时器（引用计数），全部停止后才结算并清理。
 */
export function startReadingSession(flush: (ms: number) => void): () => void {
  flushCb = flush;
  refCount += 1;
  if (refCount === 1) {
    lastTs = Date.now();
    timer = setInterval(accrue, TICK_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    }
  };
}
