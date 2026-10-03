import { AppState, Platform } from 'react-native';
import { startReadingSession } from '../src/utils/readingSession';

jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

describe('reading foreground session', () => {
  let onState: (state: string) => void;
  let stops: Array<() => void>;
  const remove = jest.fn();
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    stops = [];
    Object.assign(Platform, { OS: 'ios' });
    Object.assign(AppState, { currentState: 'active' });
    remove.mockClear();
    (AppState.addEventListener as jest.Mock).mockImplementation(
      (_, callback) => {
        onState = callback;
        return { remove };
      },
    );
  });
  afterEach(() => {
    stops.forEach(stop => stop());
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    jest.useRealTimers();
  });
  const start = (flush: (ms: number) => void) => {
    const stop = startReadingSession(flush);
    stops.push(stop);
    return stop;
  };
  const elapsed = (flush: jest.Mock) =>
    flush.mock.calls.reduce((sum, [ms]) => sum + ms, 0);

  it('settles the visible tail and excludes native background time', () => {
    const flush = jest.fn();
    const stop = start(flush);
    jest.advanceTimersByTime(7000);
    onState('inactive');
    onState('background');
    jest.advanceTimersByTime(120000);
    expect(elapsed(flush)).toBe(7000);
    onState('active');
    jest.advanceTimersByTime(4000);
    stop();
    expect(elapsed(flush)).toBe(11000);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not count time when mounted in the background', () => {
    Object.assign(AppState, { currentState: 'background' });
    const flush = jest.fn();
    start(flush);
    jest.advanceTimersByTime(60000);
    expect(flush).not.toHaveBeenCalled();
    onState('active');
    jest.advanceTimersByTime(5000);
    stops[0]();
    expect(elapsed(flush)).toBe(5000);
  });

  it('counts a foreground mount before the native bridge resolves its unknown state', () => {
    Object.assign(AppState, { currentState: 'unknown' });
    const flush = jest.fn();
    start(flush);
    jest.advanceTimersByTime(4000);
    stops[0]();
    expect(elapsed(flush)).toBe(4000);
  });

  it('shares one timer across overlapping readers and stops idempotently', () => {
    const flush = jest.fn();
    const first = start(flush);
    const second = start(flush);
    jest.advanceTimersByTime(20000);
    expect(elapsed(flush)).toBe(20000);
    first();
    first();
    jest.advanceTimersByTime(10000);
    second();
    expect(elapsed(flush)).toBe(30000);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('pauses while a Web tab is hidden, even when interval timers keep running', () => {
    Object.assign(Platform, { OS: 'web' });
    let onVisibility!: () => void;
    const browserDocument = {
      visibilityState: 'visible',
      addEventListener: jest.fn((_, callback) => {
        onVisibility = callback;
      }),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: browserDocument,
    });
    const flush = jest.fn();
    const stop = start(flush);
    jest.advanceTimersByTime(5000);
    browserDocument.visibilityState = 'hidden';
    onVisibility();
    jest.advanceTimersByTime(60000);
    expect(elapsed(flush)).toBe(5000);
    browserDocument.visibilityState = 'visible';
    onVisibility();
    jest.advanceTimersByTime(3000);
    stop();
    expect(elapsed(flush)).toBe(8000);
    expect(browserDocument.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
