export interface ReaderTapTouch {
  pageX: number;
  pageY: number;
  timestamp?: number;
  touches?: readonly unknown[];
}

/** 只补偿 iOS 程序翻页动画期间被 ScrollView 捕获的短点击，普通点击仍走 Pressable。 */
export function createReaderNativeTapTracker() {
  let touch: {
    x: number;
    y: number;
    time: number;
    session: string;
    recover: boolean;
    cancelled: boolean;
    consumed: boolean;
  } | null = null;
  const validTime = (event: ReaderTapTouch) =>
    touch != null &&
    event.timestamp != null &&
    event.timestamp >= touch.time &&
    event.timestamp - touch.time <= 500;
  const moved = (event: ReaderTapTouch) =>
    touch != null &&
    Math.hypot(event.pageX - touch.x, event.pageY - touch.y) > 10;
  return {
    start(event: ReaderTapTouch, recover: boolean, session: string) {
      touch =
        event.timestamp == null
          ? null
          : {
              x: event.pageX,
              y: event.pageY,
              time: event.timestamp,
              session,
              recover,
              cancelled: (event.touches?.length ?? 1) !== 1,
              consumed: false,
            };
    },
    move(event: ReaderTapTouch) {
      if (touch && (moved(event) || (event.touches?.length ?? 1) > 1))
        touch.cancelled = true;
    },
    cancel() {
      if (touch) touch.cancelled = true;
    },
    shouldRecover(event: ReaderTapTouch, session: string) {
      return (
        touch != null &&
        touch.session === session &&
        touch.recover &&
        !touch.cancelled &&
        !touch.consumed &&
        validTime(event) &&
        !moved(event) &&
        event.timestamp! - touch.time <= 350 &&
        (event.touches?.length ?? 0) === 0
      );
    },
    consume(event: ReaderTapTouch, session: string) {
      // 无原生时间戳的辅助功能/键盘点击独立处理；同一次触摸的补偿与 onPress 只消费一次。
      if (!validTime(event)) return true;
      if (touch!.session !== session || touch!.consumed) return false;
      touch!.consumed = true;
      return true;
    },
  };
}
