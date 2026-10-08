import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { WebViewFetcher } from '../src/components/WebViewFetcher';
import {
  CONTENT_MESSAGE,
  fetchRenderedContent,
} from '../src/services/browserFetch/bridge';

it('启动不创建 WebView；首次请求才创建，并复用实例且不丢失缓冲任务', async () => {
  jest.useFakeTimers();
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  let tree!: TestRenderer.ReactTestRenderer;
  try {
    await act(() => {
      tree = TestRenderer.create(<WebViewFetcher />);
    });
    expect(tree.toJSON()).toBeNull();
    await act(() => tree.unmount());

    // 模拟根组件挂载前已经有两个请求，必须串行补投，不能覆盖队首。
    const first = fetchRenderedContent('https://example.com/1');
    const second = fetchRenderedContent('https://example.com/2');
    await act(() => {
      tree = TestRenderer.create(<WebViewFetcher />);
    });
    const view = () => tree.root.findByType(WebView);
    expect(view().props.source.uri).toBe('https://example.com/1');
    const instance = view();
    await act(() =>
      view().props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: CONTENT_MESSAGE,
            id: 'c1',
            ok: true,
            text: '第一章',
          }),
        },
      }),
    );
    await expect(first).resolves.toBe('第一章');
    expect(view().props.source.uri).toBe('https://example.com/2');
    expect(view()).toBe(instance);
    await act(() =>
      view().props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: CONTENT_MESSAGE,
            id: 'c2',
            ok: true,
            text: '第二章',
          }),
        },
      }),
    );
    await expect(second).resolves.toBe('第二章');
    expect(view()).toBe(instance);
    expect(view().props.source.html).toContain('<!doctype html>');
  } finally {
    await act(() => tree?.unmount());
    info.mockRestore();
    jest.useRealTimers();
  }
});

it('取消正在加载的网页会立即释放队首，旧网页事件不能污染下一个任务', async () => {
  jest.useFakeTimers();
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  let tree!: TestRenderer.ReactTestRenderer;
  const controller = new AbortController();
  try {
    await act(() => {
      tree = TestRenderer.create(<WebViewFetcher />);
    });
    let abandoned!: Promise<string>;
    await act(() => {
      abandoned = fetchRenderedContent('https://example.com/slow', {
        signal: controller.signal,
      });
    });
    const rejected = abandoned.catch(error => error);
    const oldView = tree.root.findByType(WebView);
    const oldError = oldView.props.onError;
    let next!: Promise<string>;
    await act(() => {
      next = fetchRenderedContent('https://example.com/next');
    });
    await act(() => controller.abort());
    await expect(rejected).resolves.toMatchObject({ name: 'AbortError' });
    const view = tree.root.findByType(WebView);
    expect(view).not.toBe(oldView);
    expect(view.props.source.uri).toBe('https://example.com/next');
    await act(() => oldError({ nativeEvent: { description: '旧网页取消' } }));
    expect(view.props.source.uri).toBe('https://example.com/next');
    const nextId = info.mock.calls.find(
      ([event, detail]) =>
        event === '[WebViewFetcher] start job' &&
        detail.url === 'https://example.com/next',
    )![1].id;
    await act(() =>
      view.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: CONTENT_MESSAGE,
            id: nextId,
            ok: true,
            text: '新正文',
          }),
        },
      }),
    );
    await expect(next).resolves.toBe('新正文');
  } finally {
    await act(() => tree?.unmount());
    info.mockRestore();
    jest.useRealTimers();
  }
});
