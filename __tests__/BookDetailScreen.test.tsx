import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, TextInput } from 'react-native';
import { createStore, Provider } from 'jotai';
import BookDetailScreen from '../src/screens/BookDetailScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import {
  booksAtom,
  chaptersAtom,
  currentChapterIndexAtom,
  selectedBookIdAtom,
  readingHistoryAtom,
} from '../src/store/atoms';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};
const mockEnsureChapter = jest.fn();
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
    for (const label of ['快捷打开目录', '打开完整目录']) {
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
