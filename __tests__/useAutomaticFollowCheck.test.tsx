import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAutomaticFollowCheck } from '../src/store/hooks/useAutomaticFollowCheck';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));

describe('启动追更让出菜单交互', () => {
  let tree: TestRenderer.ReactTestRenderer;
  let idle: jest.Mock;
  let cancelIdle: jest.Mock;
  let runIdle: () => void;
  let latest: ReturnType<typeof useAutomaticFollowCheck>;
  const check = jest.fn();
  const originalIdle = globalThis.requestIdleCallback;
  const originalCancel = globalThis.cancelIdleCallback;

  function Probe({ enabled = true }) {
    latest = useAutomaticFollowCheck(enabled, check);
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    mockFocused = true;
    check.mockReset().mockResolvedValue({ updated: 1, failed: 0, cached: 0 });
    idle = jest.fn(callback => {
      runIdle = callback;
      return 7;
    });
    cancelIdle = jest.fn();
    globalThis.requestIdleCallback = idle;
    globalThis.cancelIdleCallback = cancelIdle;
  });

  afterEach(async () => {
    await act(() => tree?.unmount());
    globalThis.requestIdleCallback = originalIdle;
    globalThis.cancelIdleCallback = originalCancel;
    jest.useRealTimers();
  });

  it('首屏立即可交互，延迟后仍等空闲才开始，并只运行一次', async () => {
    await act(() => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(check).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1500));
    expect(check).not.toHaveBeenCalled();
    await act(async () => runIdle());
    expect(check).toHaveBeenCalledTimes(1);
    expect(latest.result?.updated).toBe(1);
    expect(latest.checking).toBe(false);
    mockFocused = false;
    await act(() => tree.update(<Probe />));
    mockFocused = true;
    await act(() => tree.update(<Probe />));
    await act(() => jest.advanceTimersByTime(5000));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('启动后立即切换菜单会取消检查，回书架后重新等待空闲', async () => {
    await act(() => {
      tree = TestRenderer.create(<Probe />);
    });
    await act(() => jest.advanceTimersByTime(100));
    mockFocused = false;
    await act(() => tree.update(<Probe />));
    await act(() => jest.advanceTimersByTime(5000));
    expect(idle).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    mockFocused = true;
    await act(() => tree.update(<Probe />));
    await act(() => jest.advanceTimersByTime(1500));
    mockFocused = false;
    await act(() => tree.update(<Probe />));
    expect(cancelIdle).toHaveBeenCalledWith(7);
    await act(async () => runIdle());
    expect(check).not.toHaveBeenCalled();
  });

  it('读取书架期间不安排检查，检查中离开页面也不会重复启动', async () => {
    let finish!: (value: any) => void;
    check.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await act(() => {
      tree = TestRenderer.create(<Probe enabled={false} />);
    });
    await act(() => jest.advanceTimersByTime(5000));
    expect(idle).not.toHaveBeenCalled();
    await act(() => tree.update(<Probe />));
    await act(() => jest.advanceTimersByTime(1500));
    await act(() => runIdle());
    expect(latest.checking).toBe(true);
    mockFocused = false;
    await act(() => tree.update(<Probe />));
    mockFocused = true;
    await act(() => tree.update(<Probe />));
    await act(async () => finish({ updated: 0, failed: 0, cached: 0 }));
    expect(check).toHaveBeenCalledTimes(1);
    expect(latest.checking).toBe(false);
  });

  it('没有 idle API 的 Web 浏览器仍能在首屏延迟后检查', async () => {
    globalThis.requestIdleCallback = undefined as any;
    await act(() => {
      tree = TestRenderer.create(<Probe />);
    });
    await act(() => jest.advanceTimersByTime(1499));
    expect(check).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(latest.checking).toBe(false);
  });
});
