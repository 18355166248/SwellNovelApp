import React from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { createStore, Provider } from 'jotai';
import TestRenderer, { act } from 'react-test-renderer';
import { LibraryPersistence } from '../src/store/LibraryPersistence';
import {
  booksAtom,
  readingHistoryAtom,
  libraryHydratedAtom,
} from '../src/store/atoms';
import {
  loadLibrarySnapshot,
  saveLibraryMeta,
} from '../src/utils/libraryStorage';

jest.mock('../src/utils/libraryStorage', () => ({
  loadLibrarySnapshot: jest.fn(),
  saveLibraryMeta: jest.fn(async () => {}),
}));

const book = {
  id: 'saved-book',
  title: '退出续读',
  author: '作者',
  addedAt: 1,
  updatedAt: 1,
  progress: 0,
};

describe('书架与阅读进度退出保存', () => {
  let tree: TestRenderer.ReactTestRenderer;
  let store: ReturnType<typeof createStore>;
  let changeState: (state: AppStateStatus) => void;
  let remove: jest.Mock;
  let originalPlatform: string;
  const load = loadLibrarySnapshot as jest.Mock;
  const save = saveLibraryMeta as jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    save.mockClear();
    load.mockResolvedValue(null);
    originalPlatform = Platform.OS;
    store = createStore();
    remove = jest.fn();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, callback) => {
        changeState = callback;
        return { remove };
      });
  });

  afterEach(async () => {
    if (tree!) await act(() => tree.unmount());
    Platform.OS = originalPlatform as typeof Platform.OS;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function mount() {
    await act(async () => {
      tree = TestRenderer.create(
        <Provider store={store}>
          <LibraryPersistence />
        </Provider>,
      );
    });
    save.mockClear();
  }

  it('防抖未到期时切后台，仍保存刚加入的书和最新位置', async () => {
    await mount();
    await act(() => {
      store.set(booksAtom, [book]);
      store.set(readingHistoryAtom, {
        [book.id]: {
          bookId: book.id,
          chapterId: 'c1',
          position: 350,
          updatedAt: 2,
        },
      });
      changeState('background');
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        books: [book],
        readingHistory: expect.objectContaining({
          [book.id]: expect.objectContaining({ position: 350 }),
        }),
      }),
    );
    const count = save.mock.calls.length;
    await act(() => jest.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledTimes(count);
  });

  it('前台连续变更仍合并保存，卸载前提交最终状态', async () => {
    await mount();
    await act(() => store.set(booksAtom, [book]));
    await act(() => jest.advanceTimersByTime(300));
    await act(() => store.set(booksAtom, [{ ...book, progress: 25 }]));
    expect(save).not.toHaveBeenCalled();
    await act(() => tree.unmount());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].books[0].progress).toBe(25);
    expect(remove).toHaveBeenCalled();
  });

  it('已切后台后阅读器才结算位置，也不依赖 React 提交就开始保存', async () => {
    await mount();
    await act(() => changeState('background'));
    save.mockClear();
    await act(() => {
      store.set(readingHistoryAtom, {
        [book.id]: {
          bookId: book.id,
          chapterId: 'c1',
          position: 450,
          updatedAt: 3,
        },
      });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          readingHistory: expect.objectContaining({
            [book.id]: expect.objectContaining({ position: 450 }),
          }),
        }),
      );
    });
  });

  it('恢复未完成或失败时退出不会把原书架覆盖为空', async () => {
    load.mockRejectedValue(new Error('disk error'));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await mount();
    await act(() => changeState('background'));
    expect(store.get(libraryHydratedAtom)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('Web 刷新/隐藏页面不等待防抖，且移除事件监听', async () => {
    Platform.OS = 'web';
    const pageEvents = new Map<string, () => void>();
    const documentEvents = new Map<string, () => void>();
    (globalThis as any).window = {
      addEventListener: jest.fn((event, callback) =>
        pageEvents.set(event, callback),
      ),
      removeEventListener: jest.fn(),
    };
    (globalThis as any).document = {
      visibilityState: 'visible',
      addEventListener: jest.fn((event, callback) =>
        documentEvents.set(event, callback),
      ),
      removeEventListener: jest.fn(),
    };
    await mount();
    await act(() => {
      store.set(booksAtom, [book]);
      pageEvents.get('pagehide')!();
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ books: [book] }),
    );
    save.mockClear();
    await act(() => {
      (document as any).visibilityState = 'hidden';
      store.set(booksAtom, [{ ...book, progress: 50 }]);
      documentEvents.get('visibilitychange')!();
    });
    expect(save.mock.calls.at(-1)[0].books[0].progress).toBe(50);
    await act(() => tree.unmount());
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function),
    );
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
