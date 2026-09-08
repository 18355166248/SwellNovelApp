/** 可中断的页间动画。每次从当前实际位置出发，取消后旧帧不能回写位置。 */
export function animateReaderPage({
  from,
  to,
  update,
  complete,
  duration = 180,
}: {
  from: number;
  to: number;
  update: (offset: number) => void;
  complete: () => void;
  duration?: number;
}): () => void {
  let cancelled = false;
  let frame: number;
  let startedAt: number | undefined;
  const tick = (now: number) => {
    if (cancelled) return;
    startedAt ??= now;
    const progress =
      duration <= 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    update(progress === 1 ? to : from + (to - from) * eased);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else complete();
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
