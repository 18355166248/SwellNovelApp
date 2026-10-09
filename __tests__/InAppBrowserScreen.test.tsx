import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import { loadBrowserHistory } from '../src/utils/browserHistory';
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
let mockInitialUrl: string | undefined = url;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({
    params: { initialUrl: mockInitialUrl },
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
  loadBrowserHistory: jest.fn(async () => []),
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
  mockInitialUrl = url;
  jest.mocked(loadBrowserHistory).mockResolvedValue([]);
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

it('有历史也停在站点入口，手动选择历史后再次进入仍回入口', async () => {
  mockInitialUrl = undefined;
  jest.mocked(loadBrowserHistory).mockResolvedValue([url]);
  const mount = async () => {
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(
        <ThemeProvider>
          <InAppBrowserScreen />
        </ThemeProvider>,
      );
    });
    return tree;
  };
  let tree = await mount();
  expect(tree.root.findAllByProps({ testID: 'test-webview' })).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ children: '网站导入' }).length,
  ).toBeGreaterThan(0);
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  const history = tree.root.findAll(
    node => node.props.children === 'wap.xuanhuange.info/wapbook-192466',
  )[0];
  let row = history.parent;
  while (row && !row.props.onPress) row = row.parent;
  await act(() => row!.props.onPress());
  expect(
    tree.root.findAllByProps({ testID: 'test-webview' })[0].props.source.uri,
  ).toBe(url);
  await act(() => tree.unmount());
  tree = await mount();
  expect(tree.root.findAllByProps({ testID: 'test-webview' })).toHaveLength(0);
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  await act(() => tree.unmount());
});

it('迟到历史只更新最近访问列表，不覆盖已打开的指定链接', async () => {
  let resolve!: (items: string[]) => void;
  jest.mocked(loadBrowserHistory).mockImplementation(
    () =>
      new Promise(yes => {
        resolve = yes;
      }),
  );
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <ThemeProvider>
        <InAppBrowserScreen />
      </ThemeProvider>,
    );
  });
  const next = 'https://example.com/book';
  mockInitialUrl = next;
  await act(() =>
    tree.update(
      <ThemeProvider>
        <InAppBrowserScreen />
      </ThemeProvider>,
    ),
  );
  expect(loadBrowserHistory).toHaveBeenCalledTimes(1);
  await act(async () => resolve([url]));
  expect(
    tree.root.findAllByProps({ testID: 'test-webview' })[0].props.source.uri,
  ).toBe(next);
  await act(() => tree.unmount());
});

it('最近访问先显示3条，可展开全部并打开原网址，回入口后收起', async () => {
  mockInitialUrl = undefined;
  const items = Array.from(
    { length: 8 },
    (_, i) => `https://example.com/book-${i}`,
  );
  jest.mocked(loadBrowserHistory).mockResolvedValue(items);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <InAppBrowserScreen />
      </ThemeProvider>,
    );
  });
  expect(
    tree.root.findAllByProps({
      accessibilityLabel: `打开最近访问 ${items[3]}`,
    }),
  ).toHaveLength(0);
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '展开全部最近访问' })[0]
      .props.onPress(),
  );
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: `打开最近访问 ${items[7]}` })[0]
      .props.onPress(),
  );
  expect(
    tree.root.findAllByProps({ testID: 'test-webview' })[0].props.source.uri,
  ).toBe(items[7]);
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '回到网站入口' })[0]
      .props.onPress(),
  );
  expect(tree.root.findAllByProps({ testID: 'test-webview' })).toHaveLength(0);
  expect(
    tree.root.findAllByProps({
      accessibilityLabel: `打开最近访问 ${items[3]}`,
    }),
  ).toHaveLength(0);
  await act(() => tree.unmount());
});

it('入口提供明确打开按钮；提交地址收起键盘，网页提供返回入口和刷新', async () => {
  mockInitialUrl = undefined;
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <InAppBrowserScreen />
      </ThemeProvider>,
    );
  });
  const button = () =>
    tree.root.findAllByProps({ accessibilityLabel: '打开网址或搜索小说' })[0];
  expect(button().props.disabled).toBe(true);
  await act(() => tree.root.findByType(TextInput).props.onChangeText(url));
  expect(button().props.disabled).toBe(false);
  await act(() => button().props.onPress());
  expect(dismiss).toHaveBeenCalled();
  expect(
    tree.root.findAllByProps({ testID: 'test-webview' })[0].props.source.uri,
  ).toBe(url);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '回到网站入口' }).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '刷新网页' }).length,
  ).toBeGreaterThan(0);
  await act(() => tree.unmount());
  dismiss.mockRestore();
});

it('识别预览表达当前识别数量，不把详情页的部分目录当作整本总章数', async () => {
  const { tree } = await open();
  expect(
    tree.root.findAllByProps({ children: '作者 · 已识别 6 项目录' }).length,
  ).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({ children: '作者 · 共 6 章' })).toHaveLength(
    0,
  );
  await act(() => tree.unmount());
});

it('导入处理中保持预览可见，完成后进入书籍详情', async () => {
  const { tree } = await open();
  let resolve!: (book: { id: string }) => void;
  mockAdd.mockImplementation(
    () =>
      new Promise(yes => {
        resolve = yes;
      }),
  );
  let pending!: Promise<void>;
  await act(() => {
    pending = tree.root
      .findAllByProps({ accessibilityLabel: '加入书架' })[0]
      .props.onPress();
  });
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '关闭书籍识别预览' })[0]
      .props.disabled,
  ).toBe(true);
  await act(async () => {
    resolve({ id: 'added' });
    await pending;
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', {
    bookId: 'added',
  });
  await act(() => tree.unmount());
});
