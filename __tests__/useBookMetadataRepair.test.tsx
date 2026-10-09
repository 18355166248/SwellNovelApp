import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { booksAtom } from '../src/store/atoms';
import { useBookMetadataRepair } from '../src/store/hooks/useBookMetadataRepair';
import { enrichBookMetadata } from '../src/services/recognize/enrichBookMetadata';

jest.mock('../src/services/recognize/enrichBookMetadata', () => ({
  ...jest.requireActual('../src/services/recognize/enrichBookMetadata'),
  enrichBookMetadata: jest.fn(),
}));

it.each(['progress', 'removed', 'unmounted'])(
  '资料响应迟到时保留 %s 状态，不写回旧书架快照',
  async state => {
    const store = createStore();
    const book = {
      id: 'test',
      title: '仙工开物',
      author: '佚名',
      progress: 3,
      addedAt: 1,
      updatedAt: 1,
      source: {
        name: 'xuanhuange',
        bookUrl: 'http://wap.xuanhuange.info/wapbook-192466/',
      },
    };
    store.set(booksAtom, [book]);
    let resolve!: (value: any) => void;
    jest.mocked(enrichBookMetadata).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    const signal = new AbortController().signal;
    function Harness() {
      useBookMetadataRepair(book.id, true, signal);
      return null;
    }
    let tree!: Renderer.ReactTestRenderer;
    await act(() => {
      tree = Renderer.create(
        <Provider store={store}>
          <Harness />
        </Provider>,
      );
    });
    await act(() => {
      if (state === 'removed') store.set(booksAtom, []);
      else if (state === 'unmounted') tree.unmount();
      else store.set(booksAtom, [{ ...book, progress: 42 }]);
    });
    await act(() =>
      resolve({
        book: {
          ...book,
          author: '蛊真人',
          cover: 'http://images.test/book.jpg',
        },
        report: {},
      }),
    );
    if (state === 'removed') expect(store.get(booksAtom)).toEqual([]);
    else if (state === 'unmounted')
      expect(store.get(booksAtom)).toEqual([book]);
    else
      expect(store.get(booksAtom)[0]).toMatchObject({
        progress: 42,
        author: '蛊真人',
        cover: 'http://images.test/book.jpg',
      });
    if (state !== 'unmounted') await act(() => tree.unmount());
  },
);
