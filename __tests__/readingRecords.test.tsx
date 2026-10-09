import React from 'react';
import {
  preserveReadingPosition,
  displayReadingRecords,
  migrateReadingRecords,
  readingRecordChapter,
} from '../src/utils/readingRecords';
import type { Book, Chapter, ReadingHistory } from '../src/store/types/book';
import Renderer, { act } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import {
  booksAtom,
  chaptersAtom,
  readingHistoryAtom,
} from '../src/store/atoms';
import { useOpenChapter } from '../src/store/hooks/useOpenChapter';
import { useUpdateReadingProgress } from '../src/store/hooks/useBooks';

it('目录跳转并继续阅读其他章后，原章的具体阅读位置仍独立保留', async () => {
  const store = createStore();
  store.set(booksAtom, [
    {
      id: 'b',
      title: '测试书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 25,
      currentChapterId: 'c1',
      lastReadAt: 2,
    },
  ]);
  store.set(chaptersAtom, {
    b: [1, 2].map(n => ({
      id: `c${n}`,
      bookId: 'b',
      title: `第${n}章`,
      content: '字'.repeat(1000),
      order: n - 1,
    })),
  });
  store.set(readingHistoryAtom, {
    b: { bookId: 'b', chapterId: 'c1', position: 500, updatedAt: 2 },
  });
  let open!: ReturnType<typeof useOpenChapter>;
  let update!: ReturnType<typeof useUpdateReadingProgress>;
  function Harness() {
    open = useOpenChapter();
    update = useUpdateReadingProgress();
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
  await act(() => open('b', 1));
  await act(() => update('b', 60, 'c2', 200));
  expect(store.get(readingHistoryAtom).b.chapterId).toBe('c2');
  expect(store.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
    chapterId: 'c1',
    position: 500,
    chapterTitle: '第1章',
  });
  // 返回记录既恢复字符位置，也保留这次离开第二章的位置。
  await act(() => open('b', 0, { restorePosition: 500 }));
  expect(store.get(readingHistoryAtom).b).toMatchObject({
    chapterId: 'c1',
    position: 500,
  });
  expect(store.get(booksAtom)[0].readingRecords?.[0]).toMatchObject({
    chapterId: 'c2',
    position: 200,
  });
  expect(store.get(booksAtom)[0].readingRecords?.[1]).toMatchObject({
    chapterId: 'c1',
    position: 500,
  });
  // 顺序翻章、预览、无效目标不应制造记录。
  const records = store.get(booksAtom)[0].readingRecords;
  await act(() => open('b', 1, { preservePreviousPosition: false }));
  await act(() => open('b', 0, { updateProgress: false }));
  await act(() => open('b', 99));
  expect(store.get(booksAtom)[0].readingRecords).toBe(records);
  await act(() => tree.unmount());
});

const book: Book = {
  id: 'b',
  title: '测试书',
  author: '作者',
  addedAt: 1,
  updatedAt: 1,
  progress: 0,
  currentChapterId: 'old',
};
const chapters: Chapter[] = [
  {
    id: 'old',
    bookId: 'b',
    title: '旧章',
    content: '正文'.repeat(500),
    order: 0,
    sourceUrl: 'http://wap.xuanhuange.info/wapbook-192466-63654391/',
  },
];
const history: ReadingHistory = {
  bookId: 'b',
  chapterId: 'old',
  position: 350,
  updatedAt: 2,
};

it('同章跳转也保留位置，重复落点去重，普通重开与加载中的错章不留记录', () => {
  expect(preserveReadingPosition(book, history, chapters, 'old')).toBe(book);
  expect(preserveReadingPosition(book, history, chapters, 'old', 350)).toBe(
    book,
  );
  const saved = preserveReadingPosition(book, history, chapters, 'old', 800);
  expect(saved.readingRecords?.[0].position).toBe(350);
  expect(preserveReadingPosition(saved, history, chapters, 'old', 800)).toBe(
    saved,
  );
  expect(
    preserveReadingPosition(
      book,
      { ...history, chapterId: 'loading' },
      chapters,
      'next',
    ),
  ).toBe(book);
  expect(
    preserveReadingPosition(
      { ...book, deletedAt: 3 },
      history,
      chapters,
      'next',
    ).readingRecords,
  ).toBeUndefined();
  expect(
    preserveReadingPosition(
      book,
      { ...history, position: NaN },
      chapters,
      'next',
    ),
  ).toBe(book);
});

it('多次跳转限制最近30个位置，并保留每条真实偏移', () => {
  let saved = book;
  for (let i = 0; i < 35; i++)
    saved = preserveReadingPosition(
      saved,
      { ...history, position: i, updatedAt: i },
      chapters,
      'next',
    );
  expect(saved.readingRecords).toHaveLength(30);
  expect(saved.readingRecords?.map(r => r.position)).toEqual(
    Array.from({ length: 30 }, (_, i) => 34 - i),
  );
  const viewed = displayReadingRecords(saved, history, chapters);
  expect(viewed[0]).toMatchObject({ current: true, position: 350 });
  expect(saved.readingRecords).toHaveLength(30);
});

it('目录重导入、改名、切换入口仍定位原章，原章删除不误套到邻近章', () => {
  const records = preserveReadingPosition(book, history, chapters, 'next')
    .readingRecords!;
  const next = [
    {
      ...chapters[0],
      id: 'new',
      title: '修正标题',
      sourceUrl: 'https://www.xuanhuange.info/read/192466/63654391.html',
      content: '',
    },
  ];
  const migrated = migrateReadingRecords(records, next)!;
  expect(migrated[0]).toMatchObject({
    chapterId: 'new',
    chapterTitle: '修正标题',
    position: 350,
  });
  expect(readingRecordChapter(migrated[0], next)?.id).toBe('new');
  const unrelated = [
    {
      ...next[0],
      id: 'old',
      sourceUrl: 'https://wap.xuanhuange.info/wapbook-192466-999/',
    },
  ];
  expect(migrateReadingRecords(records, unrelated)?.[0]).toBe(records[0]);
  expect(readingRecordChapter(records[0], unrelated)).toBeUndefined();
});
