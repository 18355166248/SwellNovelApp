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
