import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import InAppBrowserScreen from '../src/screens/InAppBrowserScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { recognizeBookHtml } from '../src/services/recognize/recognizer';
import { fetchRenderedHtml } from '../src/services/browserFetch/bridge';

const url = 'http://wap.xuanhuange.info/wapbook-192466/';
const html =
  '<h1>测试小说</h1><p>作者：作者</p><div class="cover"><img src="/cover.jpg"></div>' +
  Array.from(
    { length: 6 },
    (_, i) => `<a href="/wapbook-192466-${600000 + i}/">第${i + 1}章 故事</a>`,
  ).join('');
const mockAdd = jest.fn();
const mockListeners = new Map<string, () => void>();
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn((name: string, fn: () => void) => {
    mockListeners.set(name, fn);
    return () => mockListeners.delete(name);
  }),
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({
    params: { initialUrl: 'http://wap.xuanhuange.info/wapbook-192466/' },
  }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/store', () => ({ useAddRecognizedBook: () => mockAdd }));
jest.mock('../src/components', () => ({
  Icon: () => null,
  BookCover: () => null,
}));
jest.mock('../src/utils/browserHistory', () => ({
  loadBrowserHistory: async () => [],
  saveBrowserHistory: jest.fn(),
  addBrowserHistory: (_: string[], value: string) => [value],
}));
jest.mock('../src/services/browserFetch/bridge', () => ({
  ...jest.requireActual('../src/services/browserFetch/bridge'),
  fetchRenderedHtml: jest.fn(),
}));
jest.mock('react-native-webview', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    WebView: R.forwardRef((props: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({
        stopLoading: jest.fn(),
        injectJavaScript: jest.fn(),
      }));
      return R.createElement(View, { ...props, testID: 'test-webview' });
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockAdd.mockResolvedValue({ id: 'added' });
});

async function open() {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <InAppBrowserScreen />
      </ThemeProvider>,
    );
  });
  const web = () => tree.root.findAllByProps({ testID: 'test-webview' })[0];
  await act(async () => {
    web().props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          ...recognizeBookHtml(html, url),
          type: 'nvl-recognize',
        }),
      },
    });
  });
  return { tree, web };
}

it('同步防连点：两次加入只发布一次，成功进入该书详情', async () => {
  const { tree } = await open();
  const press = tree.root.findAllByProps({ accessibilityLabel: '加入书架' })[0]
    .props.onPress;
  await act(async () => {
    await Promise.all([press(), press()]);
  });
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', {
    bookId: 'added',
  });
  await act(() => tree.unmount());
});

it('返回时取消分页任务，不入库、不迟到跳页；旧页失败消息不清除当前预览', async () => {
  const { tree, web } = await open();
  await act(() =>
    web().props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'nvl-recognize',
          ok: false,
          url: 'https://old.test/book',
          chapters: [],
        }),
      },
    }),
  );
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '加入书架' }).length,
  ).toBeGreaterThan(0);
  await act(() =>
    web().props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          ...recognizeBookHtml(html, url),
          type: 'nvl-recognize',
          pageUrls: [`${url.slice(0, -1)}_2/`],
        }),
      },
    }),
  );
  let signal!: AbortSignal;
  jest.mocked(fetchRenderedHtml).mockImplementation((_, options: any) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  let pending!: Promise<void>;
  await act(() => {
    pending = tree.root
      .findAllByProps({ accessibilityLabel: '加入书架' })[0]
      .props.onPress();
  });
  await act(async () => {
    mockListeners.get('blur')!();
    await pending;
  });
  expect(signal.aborted).toBe(true);
  expect(mockAdd).not.toHaveBeenCalled();
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  await act(() => tree.unmount());
});

it('入库失败保留预览与错误，按钮恢复可重试', async () => {
  mockAdd.mockRejectedValueOnce(new Error('存储已满'));
  const { tree } = await open();
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: '加入书架' })[0]
      .props.onPress(),
  );
  expect(
    tree.root.findAllByProps({ children: '存储已满' }).length,
  ).toBeGreaterThan(0);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: '加入书架' })[0]
      .props.onPress(),
  );
  expect(mockAdd).toHaveBeenCalledTimes(2);
  expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', {
    bookId: 'added',
  });
  await act(() => tree.unmount());
});
