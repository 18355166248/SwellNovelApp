import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  AppState,
  FlatList,
  ScrollView,
  type AppStateStatus,
} from 'react-native';
import { createStore, Provider } from 'jotai';
import ReaderScreen from '../src/screens/ReaderScreen';
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

jest.setTimeout(15000);
jest.mock('../src/utils/devLog', () => ({ devInfo: jest.fn() }));

const mockNavigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
};
const mockEnsureChapter = jest.fn();
const mockLoadNextPage = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { bookId: 'paging-test' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/components', () => ({ Icon: () => null }));
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
          <ReaderScreen />
        </Provider>,
      );
    });
    if (options.pageMode !== 'scroll') await visible();
  };

  beforeEach(() => {
    jest.useFakeTimers();
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

  it('advances three times within one React batch and rejects old animation endpoints', async () => {
    await mount();
    await act(() => {
      press(1000);
      press(1000);
      press(1000);
    });
    const props = list().props;
    const offset = props.data[3].startOffset;
    expect(store.get(readingHistoryAtom)['paging-test'].position).toBe(offset);
    await act(() =>
      props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: props.getItemLayout(null, 1).offset },
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

  it('requires the new layout to be visible and keeps its character anchor', async () => {
    await mount();
    await act(() => {
      for (let i = 0; i < 4; i++) press(1000);
    });
    const oldProps = list().props;
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
