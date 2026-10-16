import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  AppState,
  Dimensions,
  Alert,
  FlatList,
  ScrollView,
  TextInput,
  Text,
  type AppStateStatus,
} from 'react-native';
import { createStore, Provider } from 'jotai';
import ReaderScreen from '../src/screens/ReaderScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import {
  booksAtom,
  bookmarksAtom,
  chaptersAtom,
  selectedBookIdAtom,
  currentChapterIndexAtom,
  currentChapterContentAtom,
  readerSettingsAtom,
  readingHistoryAtom,
} from '../src/store/atoms';
import { ONLINE_CONTENT_VERSION } from '../src/services/source/contentQuality';
import type { Chapter } from '../src/store/types/book';
import { startReadingSession } from '../src/utils/readingSession';
import type { ReaderPageData } from '../src/utils/paginate';

jest.setTimeout(15000);
jest.mock('../src/utils/devLog', () => ({ devInfo: jest.fn() }));

const mockNavigationListeners = new Map<string, Set<() => void>>();
const mockNavigation = {
  addListener: jest.fn((event: string, callback: () => void) => {
    const listeners =
      mockNavigationListeners.get(event) ?? new Set<() => void>();
    listeners.add(callback);
    mockNavigationListeners.set(event, listeners);
    return () => {
      listeners.delete(callback);
    };
  }),
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
};
const mockEnsureChapter = jest.fn();
const mockLoadNextPage = jest.fn();
let mockReaderFocused = true;
let mockOpenDrawer = false;
jest.mock('../src/utils/readingSession', () => ({
  startReadingSession: jest.fn(() => jest.fn()),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({
    params: { bookId: 'paging-test', openDrawer: mockOpenDrawer },
  }),
  useIsFocused: () => mockReaderFocused,
}));
let mockSafeAreaBottom = 0;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: mockSafeAreaBottom,
    left: 0,
  }),
}));
jest.mock('../src/components', () => ({
  Icon: () => null,
  Text: require('../src/components/Text').Text,
}));
jest.mock('../src/services/webdav/useWebDavAutoBackup', () => ({
  useWebDavAutoBackup: () => ({ trackReadingPosition: jest.fn() }),
}));
jest.mock('../src/services/fonts/useReaderFontFamily', () => ({
  useReaderFontFamily: () => 'serif',
}));
jest.mock('../src/services/fonts/fontManager', () => ({
  isAnyFontLoading: () => false,
  isFontReady: () => true,
  isFontLoading: () => false,
  fontFamilyFor: () => 'serif',
  ensureFont: async () => {},
}));
jest.mock('../src/store', () => ({
  ...jest.requireActual('../src/store'),
  useEnsureChapterContent: () => mockEnsureChapter,
  useLoadNextChapterPage: () => mockLoadNextPage,
}));

const body = Array.from({ length: 50 }, (_, index) =>
  `第${index}段测试文字，翻页后必须继续显示完整内容。`.repeat(8),
).join('\n');
const makeChapter = (index: number, content = body): Chapter => ({
  id: `paging-chapter-${index}`,
  bookId: 'paging-test',
  title: `第${index + 1}章`,
  content,
  order: index,
  contentVersion: ONLINE_CONTENT_VERSION,
});

describe('ReaderScreen paging interactions', () => {
  let tree: Renderer.ReactTestRenderer;
  let store: ReturnType<typeof createStore>;
  const list = () => tree.root.findByType(FlatList);
  const visible = async () => {
    const props = list().props;
    await act(() =>
      props.onViewableItemsChanged({
        viewableItems: [
          { item: props.data[props.initialScrollIndex], isViewable: true },
        ],
      }),
    );
    await act(() => jest.advanceTimersByTime(20));
  };
  const press = (x: number) => {
    const props = list().props;
    const item = props.renderItem({ item: props.data[0], index: 0 });
    item.props.children.props.onPress({
      nativeEvent: { locationX: x },
      stopPropagation: jest.fn(),
    });
  };
  const mount = async (
    initial = 0,
    online = false,
    chapterList = [makeChapter(0), makeChapter(1)],
    options: { pageMode?: 'page' | 'scroll'; position?: number } = {},
  ) => {
    store = createStore();
    store.set(booksAtom, [
      {
        id: 'paging-test',
        title: '翻页测试',
        author: '测试',
        addedAt: 1,
        updatedAt: 1,
        progress: 0,
        ...(online
          ? {
              source: {
                name: 'bookshuku',
                bookUrl: 'https://www.bookshuku.org/book/test',
              },
            }
          : {}),
      },
    ]);
    store.set(selectedBookIdAtom, 'paging-test');
    store.set(chaptersAtom, { 'paging-test': chapterList });
    store.set(currentChapterIndexAtom, initial);
    store.set(currentChapterContentAtom, chapterList[initial].content);
    if (options.pageMode) {
      store.set(readerSettingsAtom, value => ({
        ...value,
        pageMode: options.pageMode!,
      }));
    }
    if (options.position != null) {
      store.set(readingHistoryAtom, {
        'paging-test': {
          bookId: 'paging-test',
          chapterId: chapterList[initial].id,
          position: options.position,
          updatedAt: 1,
        },
      });
    }
    await act(() => {
      tree = Renderer.create(
        <Provider store={store}>
          <ThemeProvider>
            <ReaderScreen />
          </ThemeProvider>
        </Provider>,
      );
    });
    if (options.pageMode !== 'scroll') await visible();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockSafeAreaBottom = 0;
    mockReaderFocused = true;
    mockOpenDrawer = false;
    mockNavigationListeners.clear();
    (startReadingSession as jest.Mock).mockClear();
    mockEnsureChapter
      .mockReset()
      .mockImplementation(() => new Promise(() => {}));
    mockLoadNextPage
      .mockReset()
      .mockImplementation(() => new Promise(() => {}));
  });
  afterEach(async () => {
    if (tree) await act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('目录预览不请求当前章、可见标题或后续正文，选章后才加载', async () => {
    mockOpenDrawer = true;
    await mount(0, true, [makeChapter(0, ''), makeChapter(1, '')], {
      pageMode: 'scroll',
    });
    await act(() => jest.advanceTimersByTime(2000));
    expect(mockEnsureChapter).not.toHaveBeenCalled();
    expect(mockLoadNextPage).not.toHaveBeenCalled();
    expect(startReadingSession).not.toHaveBeenCalled();
    const directory = tree.root.findByType(FlatList).props;
    await act(() =>
      directory.renderItem({ item: directory.data[1] }).props.onPress(),
    );
    expect(mockEnsureChapter).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(40));
    expect(mockEnsureChapter).toHaveBeenCalledWith(
      'paging-test',
      1,
      expect.any(Object),
    );
  });

  it('书架只预览目录时跳到别章，也保护上次真实阅读位置', async () => {
    mockOpenDrawer = true;
    await mount(0, true, [makeChapter(0, ''), makeChapter(1, '')], {
      pageMode: 'scroll',
      position: 1500,
    });
    const directory = tree.root.findByType(FlatList).props;
    await act(() =>
      directory.renderItem({ item: directory.data[1] }).props.onPress(),
    );
    await act(() => jest.advanceTimersByTime(40));
    expect(store.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
      chapterId: 'paging-chapter-0',
      position: 1500,
    });
  });

  it('目录跳转后可从记录恢复原章原页，返回时同时保留离开章的位置', async () => {
    await mount(0, false, undefined, { position: 1500 });
    const initialPage = list().props.initialScrollIndex;
    const originalPosition =
      store.get(readingHistoryAtom)['paging-test'].position;
    expect(initialPage).toBeGreaterThan(0);
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '目录' })[0]
        .props.onPress(),
    );
    const directory = tree.root
      .findAllByType(FlatList)
      .find(node => node.props.data?.[0]?.c)!;
    await act(() =>
      directory.props
        .renderItem({ item: directory.props.data[1] })
        .props.onPress(),
    );
    await act(() => jest.advanceTimersByTime(40));
    await visible();
    expect(store.get(readingHistoryAtom)['paging-test'].chapterId).toBe(
      'paging-chapter-1',
    );
    expect(store.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
      chapterId: 'paging-chapter-0',
      position: originalPosition,
    });
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '记录' })[0]
        .props.onPress(),
    );
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '返回跳转前位置 第1章' })[0]
        .props.onPress(),
    );
    await act(() => jest.advanceTimersByTime(40));
    await visible();
    expect(list().props.initialScrollIndex).toBe(initialPage);
    expect(store.get(readingHistoryAtom)['paging-test']).toMatchObject({
      chapterId: 'paging-chapter-0',
      position: originalPosition,
    });
    expect(store.get(booksAtom)[0].readingRecords?.[0].chapterId).toBe(
      'paging-chapter-1',
    );
  });

  it('pauses reading time in the directory and when another screen covers the reader', async () => {
    await mount();
    const session = startReadingSession as jest.Mock;
    expect(session).toHaveBeenCalledTimes(1);
    const stop = session.mock.results[0].value;
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '目录' })[0]
        .props.onPress(),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '关闭章节目录' })[0]
        .props.onPress(),
    );
    expect(session).toHaveBeenCalledTimes(2);
    const resumedStop = session.mock.results[1].value;
    const count = session.mock.calls.length;
    mockReaderFocused = false;
    await act(() =>
      tree.update(
        <Provider store={store}>
          <ThemeProvider>
            <ReaderScreen />
          </ThemeProvider>
        </Provider>,
      ),
    );
    expect(session).toHaveBeenCalledTimes(count);
    expect(resumedStop).toHaveBeenCalledTimes(1);
  });

  it('原生返回过渡开始就取消正文加载，不等待页面卸载', async () => {
    let finish!: (chapter: Chapter) => void;
    mockEnsureChapter.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await mount(0, true, [makeChapter(0, '')], { pageMode: 'scroll' });
    const signal = mockEnsureChapter.mock.calls[0][2].signal as AbortSignal;
    expect(
      tree.root.findAllByProps({ accessibilityLabel: '取消加载并返回' }).length,
    ).toBeGreaterThan(0);
    expect(signal.aborted).toBe(false);
    await act(() => {
      mockNavigationListeners
        .get('beforeRemove')!
        .forEach(callback => callback());
    });
    expect(signal.aborted).toBe(true);
    // 模拟不支持取消的旧解析器迟到成功；返回过渡期间不能重新激活阅读状态。
    await act(() => finish(makeChapter(0)));
    expect(startReadingSession).not.toHaveBeenCalled();
  });

  it('does not start reading time for an uncached chapter while loading', async () => {
    await mount(0, true, [makeChapter(0, '')], { pageMode: 'scroll' });
    expect(startReadingSession).not.toHaveBeenCalled();
  });

  it('advances three times within one React batch and rejects old animation endpoints', async () => {
    await mount();
    await act(() => {
      press(1000);
      press(1000);
      press(1000);
    });
    const props = list().props;
    const offset = props.data[3].startOffset;
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(0);
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 1).offset },
        },
      }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(0);
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 3).offset },
        },
      }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(offset);
  });

  it('waits for uncached previous content before choosing its last page', async () => {
    await mount(1, true, [makeChapter(0, ''), makeChapter(1)]);
    const oldProps = list().props;
    await act(() => press(0));
    await act(() => jest.advanceTimersByTime(40));
    expect(store.get(currentChapterIndexAtom)).toBe(0);
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    await act(() =>
      store.set(chaptersAtom, {
        'paging-test': [makeChapter(0), makeChapter(1)],
      }),
    );
    const props = list().props;
    expect(props.initialScrollIndex).toBe(props.data.length - 1);
    await visible();
    const landingOffset = props.data[props.data.length - 1].startOffset;
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      landingOffset,
    );
    await act(() =>
      oldProps.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 0 } },
      }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      landingOffset,
    );
  });

  it('retains the previous-chapter last-page intent after a failed load and retry', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockEnsureChapter.mockRejectedValueOnce(new Error('offline'));
      await mount(1, true, [makeChapter(0, ''), makeChapter(1)]);
      await act(() => press(0));
      await act(() => jest.advanceTimersByTime(40));
      const retry = tree.root.findAllByProps({
        accessibilityLabel: '重新加载当前章节',
      })[0];
      expect(retry).toBeDefined();
      await act(() => retry.props.onPress());
      await act(() =>
        store.set(chaptersAtom, {
          'paging-test': [makeChapter(0), makeChapter(1)],
        }),
      );
      expect(list().props.initialScrollIndex).toBe(
        list().props.data.length - 1,
      );
      await visible();
      expect(list().props.scrollEnabled).toBe(true);
    } finally {
      warning.mockRestore();
    }
  });

  it('loads a remaining source subpage at the final chapter once, without skipping its appended text', async () => {
    const partial = {
      ...makeChapter(0),
      nextPageUrl: 'https://example.test/chapter/1-2',
    };
    let finish!: (chapter: Chapter) => void;
    mockLoadNextPage.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await mount(0, false, [partial]);
    const props = list().props;
    const lastOffset = props.getItemLayout(null, props.data.length - 1).offset;
    await act(() =>
      props.onScrollBeginDrag({
        nativeEvent: { contentOffset: { x: lastOffset } },
      }),
    );
    await act(() => {
      props.onScroll({
        nativeEvent: { contentOffset: { x: lastOffset + 30 } },
      });
      props.onScroll({
        nativeEvent: { contentOffset: { x: lastOffset + 50 } },
      });
    });
    expect(mockLoadNextPage).toHaveBeenCalledTimes(1);
    expect(store.get(currentChapterIndexAtom)).toBe(0);
    const complete = makeChapter(0, `${body}\n${body}`);
    await act(() => {
      store.set(chaptersAtom, { 'paging-test': [complete] });
      finish(complete);
    });
    await visible();
    expect(list().props.initialScrollIndex).toBeGreaterThan(0);
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      Array.from(body.replace(/\n/g, '')).length,
    );
  });

  it('reserves measured multiline heading space without losing body text or the reading anchor', async () => {
    await mount(0, false, [
      { ...makeChapter(0), title: '第30章：只有一个人的榜单' },
    ]);
    const heading = () => {
      const props = list().props;
      const page = props.renderItem({ item: props.data[0], index: 0 });
      return page.props.children.props.children[0];
    };
    const bodyText = (pages: ReaderPageData[]) =>
      pages
        .flatMap(page => page.blocks.map(block => block.text))
        .join('')
        .replace(/[\n　]/g, '');
    const before = list().props.data;
    await act(() =>
      heading().props.onLayout({ nativeEvent: { layout: { height: 260 } } }),
    );
    const after = list().props.data;
    expect(after[1].startOffset).toBeLessThan(before[1].startOffset);
    expect(bodyText(after)).toBe(bodyText(before));
    await visible();
    await act(() => {
      for (let i = 0; i < 3; i++) press(1000);
    });
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: list().props.getItemLayout(null, 3).offset },
        },
      }),
    );
    const position = store.get(readingHistoryAtom)['paging-test'].position;
    await act(() =>
      heading().props.onLayout({ nativeEvent: { layout: { height: 280 } } }),
    );
    await visible();
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      position,
    );
  });

  it('keeps the progress row above the gesture area outside the body budget', async () => {
    mockSafeAreaBottom = 34;
    await mount();
    const props = list().props;
    const page = props.renderItem({ item: props.data[1], index: 1 });
    expect(page.props.style[1].paddingBottom).toBe(56);
  });

  it('repaginates a native extra line without dropping content or moving the reading anchor', async () => {
    await mount();
    await act(() => {
      for (let i = 0; i < 3; i++) press(1000);
    });
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: 3 * list().props.getItemLayout(null, 3).length },
        },
      }),
    );
    const position = store.get(readingHistoryAtom)['paging-test'].position;
    const props = list().props;
    const before: ReaderPageData[] = props.data;
    const page = props.renderItem({ item: before[3], index: 3 });
    const measuredBody = page.props.children.props.children[1];
    const lineHeight =
      measuredBody.props.children[0].props.style.lineHeight *
      Dimensions.get('window').fontScale;
    const panel = page.props.style[1];
    const availableHeight =
      Dimensions.get('window').height - panel.paddingTop - panel.paddingBottom;
    await act(() =>
      measuredBody.props.onLayout({
        nativeEvent: { layout: { height: availableHeight + lineHeight * 0.2 } },
      }),
    );
    await act(() => jest.advanceTimersByTime(20));
    const after: ReaderPageData[] = list().props.data;
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after[3].startOffset).toBe(before[3].startOffset);
    expect(after[4].startOffset).toBeLessThan(before[4].startOffset);
    const content = (data: ReaderPageData[]) =>
      data
        .flatMap(item =>
          item.blocks.map(block => block.text.replace(/[\n　]/g, '')),
        )
        .join('');
    expect(content(after)).toBe(content(before));
    await visible();
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      position,
    );
    // 重排前的旧页回调不能继续缩小新会话的正文预算。
    await act(() =>
      measuredBody.props.onLayout({
        nativeEvent: { layout: { height: availableHeight + lineHeight * 5 } },
      }),
    );
    expect(list().props.data).toBe(after);
  });

  it('ignores an earlier mounted page measurement after turning forward', async () => {
    await mount();
    await act(() => {
      for (let i = 0; i < 3; i++) press(1000);
    });
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: 3 * list().props.getItemLayout(null, 3).length },
        },
      }),
    );
    const props = list().props;
    const before: ReaderPageData[] = props.data;
    const currentStart = before[3].startOffset;
    const previousPage = props.renderItem({ item: before[1], index: 1 });
    const panel = previousPage.props.style[1];
    const availableHeight =
      Dimensions.get('window').height - panel.paddingTop - panel.paddingBottom;
    await act(() =>
      previousPage.props.children.props.children[1].props.onLayout({
        nativeEvent: { layout: { height: availableHeight + 20 } },
      }),
    );
    // 虚拟列表保留前后页；已翻过页面的迟到测量不能移动当前页首、重建列表。
    expect(list().props.data).toBe(before);
    expect(list().props.data[list().props.initialScrollIndex].startOffset).toBe(
      currentStart,
    );
  });

  it('defers an overflowing target page measurement until the turn animation ends', async () => {
    await mount();
    await act(() => press(1000));
    const props = list().props;
    const before: ReaderPageData[] = props.data;
    const target = props.renderItem({ item: before[1], index: 1 });
    const panel = target.props.style[1];
    const availableHeight =
      Dimensions.get('window').height - panel.paddingTop - panel.paddingBottom;
    await act(() =>
      target.props.children.props.children[1].props.onLayout({
        nativeEvent: { layout: { height: availableHeight + 20 } },
      }),
    );
    expect(list().props.data).toBe(before);
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 1).length },
        },
      }),
    );
    await act(() => jest.advanceTimersByTime(20));
    const after: ReaderPageData[] = list().props.data;
    expect(after[1].startOffset).toBe(before[1].startOffset);
    expect(after[2].startOffset).toBeLessThan(before[2].startOffset);
    expect(list().props.initialScrollIndex).toBe(1);
    expect(list().props.scrollEnabled).toBe(true);
    expect(
      tree.root.findAllByProps({ testID: 'reader-page-preparing' }),
    ).toHaveLength(0);
  });

  it('retains unchanged prefetched heights across another page correction without reusing changed body heights', async () => {
    await mount();
    await act(() => {
      for (let i = 0; i < 3; i++) press(1000);
    });
    const before: ReaderPageData[] = list().props.data;
    const measureOverflow = (index: number) => {
      const props = list().props;
      const page = props.renderItem({ item: props.data[index], index });
      const panel = page.props.style[1];
      const budget =
        Dimensions.get('window').height -
        panel.paddingTop -
        panel.paddingBottom;
      page.props.children.props.children[1].props.onLayout({
        nativeEvent: { layout: { height: budget + 20 } },
      });
    };
    const settle = async (index: number) => {
      const props = list().props;
      await act(() =>
        props.onMomentumScrollEnd({
          nativeEvent: {
            contentOffset: { x: props.getItemLayout(null, index).offset },
          },
        }),
      );
    };
    await act(() => {
      measureOverflow(1);
      measureOverflow(3);
    });
    await settle(3);
    await act(() => jest.advanceTimersByTime(20));
    const afterThird: ReaderPageData[] = list().props.data;
    expect(afterThird[4].startOffset).toBeLessThan(before[4].startOffset);
    // 原生端同一尺寸不会再触发 onLayout；再次落定也不能用旧高度二次缩短正文。
    await settle(3);
    expect(list().props.data).toBe(afterThird);
    await act(() => {
      press(0);
      press(0);
    });
    await settle(1);
    await act(() => jest.advanceTimersByTime(20));
    const afterFirst: ReaderPageData[] = list().props.data;
    expect(afterFirst[1].startOffset).toBe(before[1].startOffset);
    expect(afterFirst[2].startOffset).toBeLessThan(before[2].startOffset);
    expect(list().props.scrollEnabled).toBe(true);
  });

  it.each(['body-first', 'text-first', 'text-only'])(
    'uses native line boundaries with %s callbacks',
    async order => {
      await mount(0, false, [makeChapter(0, '测试正文'.repeat(2000))]);
      await act(() => press(1000));
      const props = list().props;
      await act(() =>
        props.onMomentumScrollEnd({
          nativeEvent: {
            contentOffset: { x: props.getItemLayout(null, 1).offset },
          },
        }),
      );
      const page = props.renderItem({ item: props.data[1], index: 1 });
      const bodyView = page.props.children.props.children[1];
      const nativeText = bodyView.props.children[0];
      const panel = page.props.style[1];
      const budget =
        Dimensions.get('window').height -
        panel.paddingTop -
        panel.paddingBottom;
      const text = nativeText.props.children;
      const measureBody = () =>
        bodyView.props.onLayout({
          nativeEvent: { layout: { height: budget + 20 } },
        });
      const measureText = () =>
        nativeText.props.onTextLayout({
          nativeEvent: {
            lines: [
              { text: text.slice(0, 10), y: 0, height: budget / 2 },
              { text: text.slice(10), y: budget / 2, height: budget / 2 + 20 },
            ],
          },
        });
      await act(() => {
        if (order === 'text-only') {
          measureText();
        } else if (order === 'body-first') {
          measureBody();
          measureText();
        } else {
          measureText();
          measureBody();
        }
      });
      await act(() => jest.advanceTimersByTime(20));
      expect(list().props.data[1].startOffset).toBe(props.data[1].startOffset);
      expect(list().props.data[2].startOffset).toBe(
        props.data[1].startOffset + 10,
      );
      const textOf = (pages: ReaderPageData[]) =>
        pages
          .flatMap(p => p.blocks.map(b => b.text.replace(/[\n　]/g, '')))
          .join('');
      expect(textOf(list().props.data)).toBe(textOf(props.data));
    },
  );

  it('keeps displayed progress at the settled page while rapid clicks accumulate targets', async () => {
    await mount();
    const label = () =>
      tree.root
        .findAllByType(Text)
        .map(node => node.props.children)
        .find(value => typeof value === 'string' && value.startsWith('本章 '));
    await act(() => {
      press(1000);
      press(1000);
      press(1000);
    });
    expect(label()).toMatch(/^本章 1 \/ /);
    const props = list().props;
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 3).offset },
        },
      }),
    );
    expect(label()).toMatch(/^本章 4 \/ /);
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      props.data[3].startOffset,
    );
  });

  it('shows the physical page during animation without losing the accumulated target', async () => {
    await mount();
    const label = () =>
      tree.root
        .findAllByType(Text)
        .map(node => node.props.children)
        .find(value => typeof value === 'string' && value.startsWith('本章 '));
    await act(() => {
      press(1000);
      press(1000);
      press(1000);
    });
    const props = list().props;
    await act(() =>
      props.onScroll({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 2).offset },
        },
      }),
    );
    expect(label()).toMatch(/^本章 3 \/ /);
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      props.data[2].startOffset,
    );
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 1).offset },
        },
      }),
    );
    expect(label()).toMatch(/^本章 3 \/ /);
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 3).offset },
        },
      }),
    );
    expect(label()).toMatch(/^本章 4 \/ /);
  });

  it('recovers native taps captured during an animation without double turns', async () => {
    await mount();
    await act(() => press(1000));
    const props = list().props;
    const x = props.getItemLayout(null, 0).length - 5;
    await act(() => {
      for (let i = 0; i < 9; i++) {
        const start = {
          pageX: x,
          pageY: 300,
          timestamp: 1000 + i * 200,
          touches: [{}],
        };
        const end = { ...start, timestamp: start.timestamp + 100, touches: [] };
        props.onTouchStart({ nativeEvent: start });
        props.onTouchEnd({ nativeEvent: end, stopPropagation: jest.fn() });
        // 若同一次触摸随后又触发 Text.onPress，也不能多翻一页。
        const page = props.renderItem({ item: props.data[0], index: 0 });
        page.props.children.props.onPress({
          nativeEvent: end,
          stopPropagation: jest.fn(),
        });
      }
    });
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 10).offset },
        },
      }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      props.data[10].startOffset,
    );
  });

  it('defers a prefetched chapter heading measurement until its first page settles', async () => {
    await mount();
    await act(() => {
      press(1000);
      press(1000);
      press(1000);
    });
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: list().props.getItemLayout(null, 3).offset },
        },
      }),
    );
    const props = list().props;
    const before: ReaderPageData[] = props.data;
    const first = props.renderItem({ item: before[0], index: 0 });
    await act(() =>
      first.props.children.props.children[0].props.onLayout({
        nativeEvent: { layout: { height: 260 } },
      }),
    );
    expect(list().props.data).toBe(before);
    expect(list().props.scrollEnabled).toBe(true);
    await act(() => {
      press(0);
      press(0);
      press(0);
    });
    expect(list().props.data).toBe(before);
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 0 } },
      }),
    );
    expect(list().props.data[1].startOffset).toBeLessThan(
      before[1].startOffset,
    );
    expect(list().props.initialScrollIndex).toBe(0);
    expect(list().props.scrollEnabled).toBe(true);
  });

  it('does not remove a line when native reflow still fits in the body area', async () => {
    await mount();
    const props = list().props;
    const before = props.data;
    const page = props.renderItem({ item: before[1], index: 1 });
    const panel = page.props.style[1];
    const availableHeight =
      Dimensions.get('window').height - panel.paddingTop - panel.paddingBottom;
    await act(() =>
      page.props.children.props.children[1].props.onLayout({
        nativeEvent: { layout: { height: availableHeight - 2 } },
      }),
    );
    expect(list().props.data).toBe(before);
  });

  it('ignores heading measurements from a previous chapter', async () => {
    await mount();
    const props = list().props;
    const oldHeading = props.renderItem({ item: props.data[0], index: 0 }).props
      .children.props.children[0];
    await act(() => store.set(currentChapterIndexAtom, 1));
    const nextPages = list().props.data;
    await act(() =>
      oldHeading.props.onLayout({ nativeEvent: { layout: { height: 400 } } }),
    );
    expect(list().props.data).toBe(nextPages);
  });

  it('requires the new layout to be visible and keeps its character anchor', async () => {
    await mount();
    await act(() => {
      for (let i = 0; i < 4; i++) press(1000);
    });
    const oldProps = list().props;
    await act(() =>
      list().props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: list().props.getItemLayout(null, 4).offset },
        },
      }),
    );
    const position = store.get(readingHistoryAtom)['paging-test'].position;
    await act(() =>
      store.set(readerSettingsAtom, value => ({
        ...value,
        fontSizeIndex: value.fontSizeIndex + 1,
      })),
    );
    expect(list().props.scrollEnabled).toBe(false);
    await act(() =>
      oldProps.onViewableItemsChanged({
        viewableItems: [{ item: oldProps.data[4], isViewable: true }],
      }),
    );
    await act(() => jest.advanceTimersByTime(20));
    expect(list().props.scrollEnabled).toBe(false);
    await visible();
    expect(list().props.scrollEnabled).toBe(true);
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      position,
    );
  });

  it('does not finish a short final chapter while its source has another subpage', async () => {
    await mount(0, false, [
      {
        ...makeChapter(0, '这一页只是本章的一部分。'),
        nextPageUrl: 'https://example.test/chapter/1-2',
      },
    ]);
    expect(store.get(booksAtom)[0].progress).toBeLessThan(100);
    expect(store.get(booksAtom)[0].finishedAt).toBeUndefined();
  });

  it('retries the missing source subpage and resumes at the appended text', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const partial = {
      ...makeChapter(0),
      nextPageUrl: 'https://example.test/chapter/1-2',
    };
    let finish!: (chapter: Chapter) => void;
    mockLoadNextPage
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      );
    try {
      await mount(0, false, [partial]);
      const props = list().props;
      const lastOffset = props.getItemLayout(
        null,
        props.data.length - 1,
      ).offset;
      await act(() =>
        props.onScrollBeginDrag({
          nativeEvent: { contentOffset: { x: lastOffset } },
        }),
      );
      await act(() =>
        props.onScroll({
          nativeEvent: { contentOffset: { x: lastOffset + 30 } },
        }),
      );
      expect(mockLoadNextPage).toHaveBeenCalledTimes(1);
      const retry = tree.root.findAllByProps({
        accessibilityLabel: '重新加载当前章节',
      })[0];
      await act(() => retry.props.onPress());
      expect(mockLoadNextPage).toHaveBeenCalledTimes(2);
      const complete = makeChapter(0, `${body}\n追加内容。`.repeat(3));
      await act(() => {
        store.set(chaptersAtom, { 'paging-test': [complete] });
        finish(complete);
      });
      await visible();
      expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
        Array.from(body.replace(/\n/g, '')).length,
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('same-chapter scroll bookmark actually scrolls, including repeated jumps and pending old progress', async () => {
    await mount(0, false, undefined, { pageMode: 'scroll' });
    const scroll = () =>
      tree.root
        .findAllByType(ScrollView)
        .find(node => node.props.testID === 'reader-scroll-view')!;
    const scrollTo = jest.spyOn(scroll().instance, 'scrollTo');
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
      store.set(bookmarksAtom, {
        'paging-test': [
          {
            id: 'target',
            bookId: 'paging-test',
            chapterId: 'paging-chapter-0',
            position: 1200,
            createdAt: 1,
          },
        ],
      });
    });
    await act(() => jest.advanceTimersByTime(20));
    const jump = async () => {
      await act(() =>
        tree.root
          .findByProps({ testID: 'reader-scroll-view' })
          .props.children.props.onPress(),
      );
      await act(() =>
        tree.root
          .findAllByProps({ accessibilityLabel: '目录' })[0]
          .props.onPress(),
      );
      await act(() =>
        tree.root
          .findAllByProps({
            accessibilityLabel: '书签',
            accessibilityRole: 'tab',
          })[0]
          .props.onPress(),
      );
      await act(() =>
        tree.root
          .findAllByProps({ accessibilityLabel: '跳转到第1章的书签' })[0]
          .props.onPress(),
      );
      await act(() => jest.advanceTimersByTime(20));
    };
    await act(() =>
      scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 4000 } } }),
    );
    scrollTo.mockClear();
    await jump();
    expect(scrollTo).toHaveBeenCalledWith({
      y: Math.round((1200 / Array.from(body.replace(/\n/g, '')).length) * 4400),
      animated: false,
    });
    await act(() => jest.advanceTimersByTime(150));
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(1200);
    scrollTo.mockClear();
    await jump();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockRestore();
  });

  const openNoteTab = async () => {
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '目录' })[0]
        .props.onPress(),
    );
    await act(() =>
      tree.root
        .findAllByProps({
          accessibilityLabel: '摘抄',
          accessibilityRole: 'tab',
        })[0]
        .props.onPress(),
    );
  };

  it('viewing and editing a saved note preserves the reading position and its remapped chapter reference', async () => {
    await mount(0, false, undefined, { position: 1500 });
    const saved = {
      id: 'note-1',
      bookId: 'paging-test',
      chapterId: 'paging-chapter-1',
      position: 200,
      createdAt: 1,
      excerpt: '另一章的摘抄',
      note: '旧笔记',
    };
    await act(() => store.set(bookmarksAtom, { 'paging-test': [saved] }));
    const before = store.get(readingHistoryAtom)['paging-test'];
    await openNoteTab();
    await act(() =>
      tree.root.findByProps({ testID: 'excerpt-item-note-1' }).props.onPress(),
    );
    expect(store.get(currentChapterIndexAtom)).toBe(0);
    expect(store.get(readingHistoryAtom)['paging-test']).toEqual(before);
    const input = tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === '摘抄笔记')!;
    await act(() => {
      input.props.onChangeText('修改后的笔记');
      store.set(bookmarksAtom, {
        'paging-test': [
          { ...saved, chapterId: 'paging-chapter-0', position: 300 },
        ],
      });
    });
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '保存摘抄笔记' })[0]
        .props.onPress(),
    );
    expect(store.get(bookmarksAtom)['paging-test']).toEqual([
      {
        ...saved,
        chapterId: 'paging-chapter-0',
        position: 300,
        note: '修改后的笔记',
      },
    ]);
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      before.position,
    );
    expect(store.get(booksAtom)[0].readingRecords).toBeUndefined();
  });

  it('shows unavailable-chapter notes and confirms abandoning changed text', async () => {
    await mount();
    await act(() =>
      store.set(bookmarksAtom, {
        'paging-test': [
          {
            id: 'missing-note',
            bookId: 'paging-test',
            chapterId: 'removed-chapter',
            position: 80,
            createdAt: 1,
            excerpt: '仍需保留的摘抄',
            note: '原笔记',
          },
        ],
      }),
    );
    await openNoteTab();
    await act(() =>
      tree.root
        .findByProps({ testID: 'excerpt-item-missing-note' })
        .props.onPress(),
    );
    expect(
      tree.root.findAllByProps({ accessibilityLabel: '返回摘抄原文' })[0].props
        .disabled,
    ).toBe(true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const input = tree.root
        .findAllByType(TextInput)
        .find(node => node.props.accessibilityLabel === '摘抄笔记')!;
      await act(() => input.props.onChangeText('未保存的笔记'));
      await act(() =>
        tree.root
          .findAllByProps({ accessibilityLabel: '关闭摘抄与笔记' })[0]
          .props.onPress(),
      );
      expect(alert).toHaveBeenCalledWith(
        '放弃修改？',
        expect.any(String),
        expect.any(Array),
      );
      expect(
        tree.root.findAllByProps({ accessibilityLabel: '摘抄笔记' }).length,
      ).toBeGreaterThan(0);
      const buttons = alert.mock.calls[0][2]!;
      await act(() =>
        buttons.find(button => button.text === '放弃修改')!.onPress!(),
      );
      expect(
        tree.root.findAllByProps({ accessibilityLabel: '摘抄笔记' }),
      ).toHaveLength(0);
      expect(store.get(bookmarksAtom)['paging-test'][0].note).toBe('原笔记');
    } finally {
      alert.mockRestore();
    }
  });

  it('confirms bookmark deletion and preserves the same-chapter excerpt', async () => {
    await mount();
    const plain = {
      id: 'plain',
      bookId: 'paging-test',
      chapterId: 'paging-chapter-0',
      position: 50,
      createdAt: 1,
    };
    const excerpt = {
      ...plain,
      id: 'excerpt',
      excerpt: '同章摘抄',
      note: '需要保留',
    };
    await act(() =>
      store.set(bookmarksAtom, { 'paging-test': [plain, excerpt] }),
    );
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '目录' })[0]
        .props.onPress(),
    );
    await act(() =>
      tree.root
        .findAllByProps({
          accessibilityLabel: '书签',
          accessibilityRole: 'tab',
        })[0]
        .props.onPress(),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      await act(() =>
        tree.root
          .findAllByProps({ accessibilityLabel: '跳转到第1章的书签' })[0]
          .props.onLongPress(),
      );
      expect(store.get(bookmarksAtom)['paging-test']).toEqual([plain, excerpt]);
      const buttons = alert.mock.calls[0][2]!;
      await act(() =>
        buttons.find(button => button.text === '删除')!.onPress!(),
      );
      expect(store.get(bookmarksAtom)['paging-test']).toEqual([excerpt]);
    } finally {
      alert.mockRestore();
    }
  });

  it('keeps the scroll resume anchor through first-frame zero offsets and changed measurements', async () => {
    await mount(0, false, undefined, { pageMode: 'scroll', position: 1200 });
    const scroll = () => tree.root.findByType(ScrollView);
    await act(() =>
      scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(1200);
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    const beforeLayoutChange = scroll().props;
    await act(() => {
      beforeLayoutChange.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
      beforeLayoutChange.onContentSizeChange(300, 5100);
    });
    await act(() => jest.advanceTimersByTime(150));
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(1200);
    await act(() =>
      scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 2200 } } }),
    );
    await act(() => jest.advanceTimersByTime(150));
    expect(
      store.get(readingHistoryAtom)['paging-test'].position,
    ).toBeGreaterThan(1200);
  });

  it('rejects an old scroll container and its throttled callback after changing chapters', async () => {
    await mount(0, false, undefined, { pageMode: 'scroll' });
    const scroll = () => tree.root.findByType(ScrollView);
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    await act(() => jest.advanceTimersByTime(20));
    const oldProps = scroll().props;
    await act(() =>
      oldProps.onScroll({ nativeEvent: { contentOffset: { y: 4000 } } }),
    );
    await act(() => {
      store.set(currentChapterIndexAtom, 1);
      store.set(currentChapterContentAtom, body);
    });
    await act(() => {
      oldProps.onLayout({ nativeEvent: { layout: { height: 600 } } });
      oldProps.onContentSizeChange(300, 100);
      oldProps.onScroll({ nativeEvent: { contentOffset: { y: 4400 } } });
      oldProps.onMomentumScrollEnd();
      jest.advanceTimersByTime(150);
    });
    expect(store.get(readingHistoryAtom)['paging-test']).toMatchObject({
      chapterId: 'paging-chapter-1',
      position: 0,
    });
    expect(store.get(booksAtom)[0].progress).toBe(50);
  });

  it('滚动节流尚未写回时跳目录，记录保存屏幕实际位置并可返回', async () => {
    await mount(0, false, undefined, { pageMode: 'scroll' });
    const scroll = () =>
      tree.root
        .findAllByType(ScrollView)
        .find(node => node.props.testID === 'reader-scroll-view')!;
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    await act(() => jest.advanceTimersByTime(20));
    await act(() =>
      scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 2200 } } }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(0);
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '目录' })[0]
        .props.onPress(),
    );
    const directory = tree.root.findByType(FlatList).props;
    await act(() =>
      directory.renderItem({ item: directory.data[1] }).props.onPress(),
    );
    const position = Math.round(Array.from(body.replace(/\n/g, '')).length / 2);
    expect(store.get(booksAtom)[0].readingRecords?.[0].position).toBe(position);
    await act(() => jest.advanceTimersByTime(40));
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    await act(() => jest.advanceTimersByTime(20));
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '记录' })[0]
        .props.onPress(),
    );
    await act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '返回跳转前位置 第1章' })[0]
        .props.onPress(),
    );
    await act(() => jest.advanceTimersByTime(40));
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    await act(() => jest.advanceTimersByTime(20));
    expect(store.get(readingHistoryAtom)['paging-test']).toMatchObject({
      chapterId: 'paging-chapter-0',
      position,
    });
  });

  it('saves the latest scroll offset synchronously when leaving before the throttle expires', async () => {
    await mount(0, false, undefined, { pageMode: 'scroll' });
    const scroll = () => tree.root.findByType(ScrollView);
    await act(() => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      scroll().props.onContentSizeChange(300, 5000);
    });
    await act(() => jest.advanceTimersByTime(20));
    await act(() =>
      scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 2200 } } }),
    );
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(0);
    await act(() => tree.unmount());
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
      Math.round(Array.from(body.replace(/\n/g, '')).length / 2),
    );
  });

  it('saves the pending scroll offset when iOS becomes inactive', async () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, callback) => {
        listeners.push(callback);
        return { remove: jest.fn() };
      });
    try {
      await mount(0, false, undefined, { pageMode: 'scroll' });
      const scroll = () => tree.root.findByType(ScrollView);
      await act(() => {
        scroll().props.onLayout({ nativeEvent: { layout: { height: 600 } } });
        scroll().props.onContentSizeChange(300, 5000);
      });
      await act(() => jest.advanceTimersByTime(20));
      await act(() =>
        scroll().props.onScroll({
          nativeEvent: { contentOffset: { y: 2200 } },
        }),
      );
      await act(() => listeners.forEach(listener => listener('inactive')));
      expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(
        Math.round(Array.from(body.replace(/\n/g, '')).length / 2),
      );
    } finally {
      spy.mockRestore();
    }
  });
});
