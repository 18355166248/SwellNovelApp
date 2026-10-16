import { createReaderNativeTapTracker } from '../src/utils/readerNativeTap';
const start = { pageX: 380, pageY: 300, timestamp: 1000, touches: [{}] };
const end = { ...start, timestamp: 1100, touches: [] };
it('补偿动画期间短点击，补偿与普通 onPress 不重复消费', () => {
  const tracker = createReaderNativeTapTracker();
  tracker.start(start, true, 'chapter');
  expect(tracker.shouldRecover(end, 'chapter')).toBe(true);
  expect(tracker.consume(end, 'chapter')).toBe(true);
  expect(tracker.consume(end, 'chapter')).toBe(false);
  expect(tracker.shouldRecover(end, 'chapter')).toBe(false);
});
it('普通点击已经消费时，不追加补偿', () => {
  const tracker = createReaderNativeTapTracker();
  tracker.start(start, true, 'chapter');
  tracker.consume(end, 'chapter');
  expect(tracker.shouldRecover(end, 'chapter')).toBe(false);
  tracker.start({ ...start, timestamp: 2000 }, false, 'chapter');
  expect(tracker.shouldRecover({ ...end, timestamp: 2100 }, 'chapter')).toBe(
    false,
  );
});
it('排除拖动后移回原点、长按、多指和已取消触摸', () => {
  const tracker = createReaderNativeTapTracker();
  tracker.start(start, true, 'chapter');
  tracker.move({ ...start, pageX: 350 });
  expect(tracker.shouldRecover(end, 'chapter')).toBe(false);
  tracker.start(start, true, 'chapter');
  expect(tracker.shouldRecover({ ...end, timestamp: 1500 }, 'chapter')).toBe(
    false,
  );
  tracker.start({ ...start, touches: [{}, {}] }, true, 'chapter');
  expect(tracker.shouldRecover(end, 'chapter')).toBe(false);
  tracker.start(start, true, 'chapter');
  tracker.cancel();
  expect(tracker.shouldRecover(end, 'chapter')).toBe(false);
});
it('拒绝旧会话的补偿，新的触摸能独立消费', () => {
  const tracker = createReaderNativeTapTracker();
  tracker.start(start, true, 'old');
  expect(tracker.shouldRecover(end, 'new')).toBe(false);
  tracker.start({ ...start, timestamp: 2000 }, true, 'new');
  expect(tracker.shouldRecover({ ...end, timestamp: 2100 }, 'new')).toBe(true);
  expect(tracker.consume({ pageX: 380, pageY: 300 }, 'new')).toBe(true);
});
