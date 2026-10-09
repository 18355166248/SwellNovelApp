import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, ScrollView, TextInput } from 'react-native';
import { createStore, Provider } from 'jotai';
import BookDetailScreen from '../src/screens/BookDetailScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { Text as AppText } from '../src/components/Text';
import {
  booksAtom,
  chaptersAtom,
  currentChapterIndexAtom,
  selectedBookIdAtom,
  readingHistoryAtom,
  appSettingsAtom,
} from '../src/store/atoms';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};
const mockEnsureChapter = jest.fn();
const mockCheckUpdate = jest.fn();
const mockCacheWhole = jest.fn();
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { bookId: 'catalog-test' } }),
  useIsFocused: () => mockFocused,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/components', () => ({
  Text: require('../src/components/Text').Text,
  Icon: () => null,
  LinearGradient: () => null,
  BookCover: () => null,
}));
jest.mock('../src/store', () => ({
  ...jest.requireActual('../src/store'),
  useEnsureChapterContent: () => mockEnsureChapter,
  useCheckBookUpdate: () => mockCheckUpdate,
  useCacheWholeBook: () => mockCacheWhole,
}));
// 页面交互用例不发起资料网络请求；补资料的抓取/取消/合并由独立回归与真机验证。
jest.mock('../src/store/hooks/useBookMetadataRepair', () => ({
  useBookMetadataRepair: jest.fn(),
}));

it('browses, searches and closes the catalog without opening a reader or changing progress; selection opens the correct chapter', async () => {
  jest.clearAllMocks();
  mockFocused = true;
  const store = createStore();
  const chapters = Array.from({ length: 30 }, (_, index) => ({
    id: `chapter-${index}`,
    bookId: 'catalog-test',
    title: `第${index + 1}章 故事`,
    content: '',
    order: index,
    sourceUrl: `https://example.com/${index}.html`,
  }));
  store.set(booksAtom, [
    {
      id: 'catalog-test',
      title: '测试小说',
      author: '作者',
      description: '第一段故事。<br/><br/>第二段故事。',
      addedAt: 1,
      updatedAt: 1,
      progress: 25,
      currentChapterId: chapters[8].id,
      source: { name: 'bookshuku', bookUrl: 'https://example.com/book' },
    },
  ]);
  store.set(chaptersAtom, { 'catalog-test': chapters });
  store.set(selectedBookIdAtom, 'another-book');
  store.set(currentChapterIndexAtom, 3);
  const originalBooks = store.get(booksAtom);
  const originalHistory = store.get(readingHistoryAtom);
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <Provider store={store}>
        <ThemeProvider>
          <BookDetailScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  const press = async (label: string) => {
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })[0]
        .props.onPress(),
    );
  };
  expect(
    tree.root.findAllByProps({ children: '第一段故事。\n\n第二段故事。' })
      .length,
  ).toBeGreaterThan(0);
  await press('快捷打开目录');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(8);
  await press('关闭章节目录');
  await press('更多书籍操作');
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '删除书籍' }).length,
  ).toBeGreaterThan(0);
  await press('关闭更多菜单');
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '删除书籍' }),
  ).toHaveLength(0);
  await press('更多书籍操作');
  await press('删除书籍');
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '关闭更多菜单' }),
  ).toHaveLength(0);
  await press('取消移到回收站');
  expect(store.get(booksAtom)).toBe(originalBooks);
  // 失焦后再次返回详情，临时遮罩不能留存并拦截其他入口。
  await press('更多书籍操作');
  mockFocused = false;
  const screen = () => (
    <Provider store={store}>
      <ThemeProvider>
        <BookDetailScreen />
      </ThemeProvider>
    </Provider>
  );
  await act(() => tree.update(screen()));
  mockFocused = true;
  await act(() => tree.update(screen()));
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '关闭更多菜单' }),
  ).toHaveLength(0);
  await press('打开完整目录');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(8);
  await act(() => tree.root.findByType(TextInput).props.onChangeText('第20章'));
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(1);
  expect(tree.root.findByType(FlatList).props.data[0].index).toBe(19);
  await press('切换为倒序');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(0);
  await press('关闭章节目录');
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  expect(mockEnsureChapter).not.toHaveBeenCalled();
  expect(store.get(booksAtom)).toBe(originalBooks);
  expect(store.get(readingHistoryAtom)).toBe(originalHistory);
  expect(store.get(selectedBookIdAtom)).toBe('another-book');
  expect(store.get(currentChapterIndexAtom)).toBe(3);
  await press('打开完整目录');
  const props = tree.root.findByType(FlatList).props;
  await act(() => props.renderItem({ item: props.data[19] }).props.onPress());
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Reader', {
    bookId: 'catalog-test',
  });
  expect(store.get(currentChapterIndexAtom)).toBe(19);
  await act(() => tree.unmount());
});

it('同一帧连点缓存仅启动一个任务，第二次点击立即停止该任务', async () => {
  jest.clearAllMocks();
  mockFocused = true;
  const store = createStore();
  store.set(booksAtom, [
    {
      id: 'catalog-test',
      title: '测试书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 0,
      source: {
        name: 'xuanhuange',
        bookUrl: 'http://wap.xuanhuange.info/wapbook-192466/',
      },
    },
  ]);
  store.set(chaptersAtom, {
    'catalog-test': [
      {
        id: 'c',
        bookId: 'catalog-test',
        title: '第1章',
        order: 0,
        content: '',
        sourceUrl: 'http://wap.xuanhuange.info/wapbook-192466-1/',
      },
    ],
  });
  let finish!: (result: {
    done: number;
    total: number;
    cancelled?: boolean;
  }) => void;
  mockCacheWhole.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <Provider store={store}>
        <ThemeProvider>
          <BookDetailScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  const press = tree.root.findAllByProps({
    accessibilityLabel: '缓存全本',
  })[0].props.onPress;
  let pending!: Promise<void>;
  await act(() => {
    pending = press();
    press();
  });
  expect(mockCacheWhole).toHaveBeenCalledTimes(1);
  expect(mockCacheWhole.mock.calls[0][2].aborted).toBe(true);
  await act(async () => {
    finish({ done: 0, total: 1, cancelled: true });
    await pending;
  });
  expect(
    tree.root.findAllByProps({ children: '已停止，缓存了 0/1 项正文' }).length,
  ).toBeGreaterThan(0);
  await act(() => tree.unmount());
});

it.each(['loading', 'repair'])(
  'blocks both catalog entries while the catalog is %s',
  async state => {
    jest.clearAllMocks();
    mockFocused = true;
    const store = createStore();
    store.set(booksAtom, [
      {
        id: 'catalog-test',
        title: '测试小说',
        author: '作者',
        addedAt: 1,
        updatedAt: 1,
        progress: 0,
        source: { name: 'bookshuku', bookUrl: 'https://example.com/book' },
      },
    ]);
    store.set(chaptersAtom, {
      'catalog-test':
        state === 'repair'
          ? [
              {
                id: 'bad-chapter',
                bookId: 'catalog-test',
                title: '分节阅读 1',
                content: '',
                order: 0,
                sourceUrl: 'https://example.com/1.html',
              },
            ]
          : [],
    });
    let tree!: Renderer.ReactTestRenderer;
    await act(() => {
      tree = Renderer.create(
        <Provider store={store}>
          <ThemeProvider>
            <BookDetailScreen />
          </ThemeProvider>
        </Provider>,
      );
    });
    for (const label of [
      '快捷打开目录',
      '打开完整目录',
      '从底部打开章节目录',
    ]) {
      const entry = tree.root.findAllByProps({ accessibilityLabel: label })[0];
      expect(entry.props.accessibilityState.disabled).toBe(true);
      // 即便回调已排队，处理器也必须再次检查目录状态。
      await act(() => entry.props.onPress());
      expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    }
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(mockEnsureChapter).not.toHaveBeenCalled();
    await act(() => tree.unmount());
  },
);

it('长书已阅读但总进度为0%时显示续读，未知网站也能检查更新', async () => {
  jest.clearAllMocks();
  mockFocused = true;
  const store = createStore();
  store.set(booksAtom, [
    {
      id: 'catalog-test',
      title: '长书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 0,
      lastReadAt: 2,
      currentChapterId: 'started',
      source: { name: 'novel.test', bookUrl: 'https://novel.test/catalog' },
    },
  ]);
  store.set(chaptersAtom, {
    'catalog-test': [
      {
        id: 'started',
        bookId: 'catalog-test',
        title: '第2章',
        content: '',
        order: 0,
        sourceUrl: 'https://novel.test/2.html',
      },
    ],
  });
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <Provider store={store}>
        <ThemeProvider>
          <BookDetailScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  expect(
    tree.root.findAllByProps({ children: '阅读中' }).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '继续阅读 第2章' }).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '检查书籍更新' }).length,
  ).toBeGreaterThan(0);
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '继续阅读 第2章' })[0]
      .props.onPress(),
  );
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Reader', {
    bookId: 'catalog-test',
  });
  mockCheckUpdate.mockRejectedValueOnce(new Error('书源目录不完整'));
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: '检查书籍更新' })[0]
      .props.onPress(),
  );
  expect(
    tree.root.findAllByProps({ children: '检查更新失败：书源目录不完整' })
      .length,
  ).toBeGreaterThan(0);
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '回到原网页更新章节目录' })[0]
      .props.onPress(),
  );
  expect(mockNavigation.navigate).toHaveBeenCalledWith('InAppBrowser', {
    initialUrl: 'https://novel.test/catalog',
  });
  await act(() => tree.unmount());
});

it.each(['light', 'dark'] as const)(
  '详情滑到第二屏仍可打开目录，%s 主题状态栏随固定导航切换',
  async theme => {
    jest.clearAllMocks();
    mockFocused = true;
    const store = createStore();
    store.set(appSettingsAtom, { ...store.get(appSettingsAtom), theme });
    store.set(booksAtom, [
      {
        id: 'catalog-test',
        title: '长简介测试书',
        author: '作者',
        description: '小说简介。'.repeat(100),
        addedAt: 1,
        updatedAt: 1,
        progress: 25,
        currentChapterId: 'c1',
      },
    ]);
    store.set(chaptersAtom, {
      'catalog-test': [
        {
          id: 'c1',
          bookId: 'catalog-test',
          title: '第一章',
          content: '正文',
          order: 0,
        },
      ],
    });
    const before = store.get(booksAtom);
    let tree!: Renderer.ReactTestRenderer;
    await act(() => {
      tree = Renderer.create(
        <Provider store={store}>
          <ThemeProvider>
            <BookDetailScreen />
          </ThemeProvider>
        </Provider>,
      );
    });
    const scroll = tree.root.findByType(ScrollView);
    expect(
      scroll.findAllByProps({ accessibilityLabel: '快捷打开目录' }),
    ).toHaveLength(0);
    await act(() =>
      tree.root
        .findByProps({ testID: 'book-detail-hero' })
        .props.onLayout({ nativeEvent: { layout: { height: 240 } } }),
    );
    await act(() =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } }),
    );
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({
      statusBarStyle: theme === 'light' ? 'dark' : 'light',
    });
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '快捷打开目录' })[0]
        .props.onPress(),
    );
    expect(tree.root.findAllByType(FlatList).length).toBeGreaterThan(0);
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '关闭章节目录' })[0]
        .props.onPress(),
    );
    expect(store.get(booksAtom)).toBe(before);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    await act(() =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } }),
    );
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({
      statusBarStyle: 'light',
    });
    await act(() => tree.unmount());
  },
);

it('长简介默认收起，可展开全部和再次收起，不改变阅读位置', async () => {
  jest.clearAllMocks();
  mockFocused = true;
  const store = createStore();
  const description = '第一段故事。\n\n'.repeat(30);
  store.set(booksAtom, [
    {
      id: 'catalog-test',
      title: '长简介书',
      author: '作者',
      description,
      addedAt: 1,
      updatedAt: 1,
      progress: 25,
    },
  ]);
  store.set(chaptersAtom, { 'catalog-test': [] });
  const before = store.get(booksAtom);
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <Provider store={store}>
        <ThemeProvider>
          <BookDetailScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  expect(
    tree.root
      .findAllByType(AppText)
      .find(node => node.props.children === description.trim())!.props
      .numberOfLines,
  ).toBe(4);
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '展开内容简介' })[0]
      .props.onPress(),
  );
  expect(
    tree.root
      .findAllByType(AppText)
      .find(node => node.props.children === description.trim())!.props
      .numberOfLines,
  ).toBeUndefined();
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityLabel: '收起内容简介' })[0]
      .props.onPress(),
  );
  expect(
    tree.root
      .findAllByType(AppText)
      .find(node => node.props.children === description.trim())!.props
      .numberOfLines,
  ).toBe(4);
  expect(store.get(booksAtom)).toBe(before);
  await act(() => tree.unmount());
});

it('详情页查看记录不改续读，选择后恢复字符偏移并保留刚离开的位置', async () => {
  jest.clearAllMocks();
  mockFocused = true;
  const store = createStore();
  store.set(booksAtom, [
    {
      id: 'catalog-test',
      title: '测试小说',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 75,
      currentChapterId: 'c2',
      readingRecords: [
        {
          id: 'saved',
          bookId: 'catalog-test',
          chapterId: 'c1',
          chapterTitle: '第一章',
          position: 500,
          updatedAt: 2,
        },
      ],
    },
  ]);
  store.set(chaptersAtom, {
    'catalog-test': [1, 2].map(n => ({
      id: `c${n}`,
      bookId: 'catalog-test',
      title: `第${n}章`,
      content: '字'.repeat(1000),
      order: n - 1,
    })),
  });
  store.set(readingHistoryAtom, {
    'catalog-test': {
      bookId: 'catalog-test',
      chapterId: 'c2',
      position: 200,
      updatedAt: 3,
    },
  });
  const original = store.get(readingHistoryAtom);
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <Provider store={store}>
        <ThemeProvider>
          <BookDetailScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  const press = async (label: string) => {
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })[0]
        .props.onPress(),
    );
  };
  await press('查看阅读记录');
  expect(store.get(readingHistoryAtom)).toBe(original);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  await press('返回跳转前位置 第1章');
  expect(store.get(readingHistoryAtom)['catalog-test']).toMatchObject({
    chapterId: 'c1',
    position: 500,
  });
  expect(store.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
    chapterId: 'c2',
    position: 200,
  });
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Reader', {
    bookId: 'catalog-test',
  });
  await act(() => tree.unmount());
});
