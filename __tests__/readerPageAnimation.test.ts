import { animateReaderPage } from '../src/utils/readerPageAnimation';

describe('reader page animation', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;
  const frame = (time: number) => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(time));
  };

  beforeEach(() => {
    callbacks = new Map();
    nextId = 0;
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.set(++nextId, callback);
      return nextId;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('moves monotonically and lands exactly on the requested page', () => {
    const update = jest.fn();
    const complete = jest.fn();
    animateReaderPage({ from: 0, to: 390, update, complete });
    [0, 60, 120, 180, 240].forEach(frame);
    const offsets = update.mock.calls.map(([offset]) => offset);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeGreaterThan(0);
    expect(offsets[1]).toBeLessThan(390);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets[offsets.length - 1]).toBe(390);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('cancels stale frames when a new turn or drag interrupts the animation', () => {
    const update = jest.fn();
    const complete = jest.fn();
    const cancel = animateReaderPage({ from: 0, to: 390, update, complete });
    frame(0);
    const lateFrame = [...callbacks.values()][0];
    cancel();
    lateFrame(180);
    frame(240);
    expect(update).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it('honors reduced motion and instant restoration without overshoot', () => {
    const update = jest.fn();
    const complete = jest.fn();
    animateReaderPage({ from: 780, to: 390, duration: 0, update, complete });
    frame(0);
    expect(update).toHaveBeenCalledWith(390);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });
});
