import { createStore } from 'jotai';
import {
  activeBooksAtom,
  booksAtom,
  deletedBooksAtom,
} from '../src/store/atoms';
import type { Book } from '../src/store/types/book';

const book = (id: string, overrides: Partial<Book> = {}): Book => ({
  id,
  title: `书${id}`,
  author: '作者',
  addedAt: 0,
  updatedAt: 0,
  progress: 42,
  ...overrides,
});

describe('回收站的书架可见性', () => {
  it('打了删除标记的书从书架消失，出现在回收站', () => {
    const store = createStore();
    store.set(booksAtom, [
      book('a'),
      book('b', { deletedAt: 1000 }),
      book('c'),
    ]);

    expect(store.get(activeBooksAtom).map(b => b.id)).toEqual(['a', 'c']);
    expect(store.get(deletedBooksAtom).map(b => b.id)).toEqual(['b']);
  });

  it('回收站按删除时间倒序，最近删的在最前面', () => {
    const store = createStore();
    store.set(booksAtom, [
      book('early', { deletedAt: 1000 }),
      book('latest', { deletedAt: 3000 }),
      book('middle', { deletedAt: 2000 }),
    ]);

    expect(store.get(deletedBooksAtom).map(b => b.id)).toEqual([
      'latest',
      'middle',
      'early',
    ]);
  });

  it('删除标记不改变书本身的阅读进度，还原后原样恢复', () => {
    const store = createStore();
    store.set(booksAtom, [book('a', { deletedAt: 1000, progress: 66 })]);
    expect(store.get(activeBooksAtom)).toHaveLength(0);

    // 还原＝清掉标记，其余字段不动。
    store.set(booksAtom, prev =>
      prev.map(item => ({ ...item, deletedAt: undefined })),
    );
    const restored = store.get(activeBooksAtom);
    expect(restored).toHaveLength(1);
    expect(restored[0].progress).toBe(66);
    expect(store.get(deletedBooksAtom)).toHaveLength(0);
  });

  it('书架为空但回收站有书时两个列表互不影响', () => {
    const store = createStore();
    store.set(booksAtom, [book('a', { deletedAt: 1 }), book('b', { deletedAt: 2 })]);
    expect(store.get(activeBooksAtom)).toEqual([]);
    expect(store.get(deletedBooksAtom)).toHaveLength(2);
  });
});
