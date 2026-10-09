import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useRecognizedBookMetadata } from '../src/services/recognize/useRecognizedBookMetadata';
import { enrichBookMetadata } from '../src/services/recognize/enrichBookMetadata';
import type { RecognizedBook } from '../src/services/recognize/recognizer';

jest.mock('../src/services/recognize/enrichBookMetadata', () => ({
  ...jest.requireActual('../src/services/recognize/enrichBookMetadata'),
  enrichBookMetadata: jest.fn(),
}));
const seed: RecognizedBook = {
  ok: true,
  isDetail: true,
  url: 'https://novel.test/book/1',
  host: 'novel.test',
  title: '测试小说全文阅读',
  chapters: [{ title: '第1章', url: 'https://novel.test/1/1' }],
};

it('预览补回封面后保留最新目录；同页自动重发不重复取资料，手动重识别可重试', async () => {
  let resolve!: (value: any) => void;
  jest
    .mocked(enrichBookMetadata)
    .mockReset()
    .mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
  let preview!: ReturnType<typeof useRecognizedBookMetadata>;
  function Harness({ book }: { book: RecognizedBook | null }) {
    preview = useRecognizedBookMetadata(book, true);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(<Harness book={seed} />);
  });
  expect(preview.loading).toBe(true);
  const latest = {
    ...seed,
    chapters: [
      ...seed.chapters,
      { title: '第2章', url: 'https://novel.test/1/2' },
    ],
  };
  await act(() => tree.update(<Harness book={latest} />));
  await act(() =>
    resolve({
      book: {
        ...seed,
        title: '测试小说',
        author: '作者',
        cover: 'https://img.test/cover.jpg',
      },
    }),
  );
  expect(preview.book).toMatchObject({
    title: '测试小说',
    cover: 'https://img.test/cover.jpg',
    metadataChecked: true,
  });
  expect(preview.book?.chapters).toBe(latest.chapters);
  await act(() => tree.update(<Harness book={{ ...latest }} />));
  expect(enrichBookMetadata).toHaveBeenCalledTimes(1);
  await act(() => tree.update(<Harness book={null} />));
  await act(() => tree.update(<Harness book={seed} />));
  expect(enrichBookMetadata).toHaveBeenCalledTimes(2);
  await act(() => tree.unmount());
});

it('切站会取消旧预览补全，旧书迟到响应不能显示在新书卡片', async () => {
  let finishOld!: (value: any) => void;
  let oldSignal!: AbortSignal;
  jest
    .mocked(enrichBookMetadata)
    .mockReset()
    .mockImplementationOnce((_, options) => {
      oldSignal = options!.signal!;
      return new Promise(done => {
        finishOld = done;
      });
    })
    .mockImplementation(() => new Promise(() => {}));
  let preview!: ReturnType<typeof useRecognizedBookMetadata>;
  function Harness({ book }: { book: RecognizedBook }) {
    preview = useRecognizedBookMetadata(book, true);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(<Harness book={seed} />);
  });
  const next = { ...seed, url: 'https://novel.test/book/2', title: '另一本书' };
  await act(() => tree.update(<Harness book={next} />));
  expect(oldSignal.aborted).toBe(true);
  await act(() =>
    finishOld({ book: { ...seed, cover: 'https://old.test/cover.jpg' } }),
  );
  expect(preview.book).toBe(next);
  await act(() => tree.unmount());
});
