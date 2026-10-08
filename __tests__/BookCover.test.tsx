import React from 'react';
import { Image, ImageBackground } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { BookCover } from '../src/components/BookCover';
import { BookCoverImage } from '../src/components/BookCoverImage';

test.each([false, true])(
  '完整封面 compact=%s 的坏链统一退回定制封面',
  async compact => {
    let tree!: Renderer.ReactTestRenderer;
    await act(() => {
      tree = Renderer.create(
        <BookCover
          id="local-book"
          title="捞尸人"
          author="本地导入"
          compact={compact}
          uri="https://covers.test/broken.jpg"
        />,
      );
    });
    const artwork = tree.root.findByType(ImageBackground).props.source;
    const imageLayer = tree.root.findByType(BookCoverImage);
    expect(imageLayer.findByType(Image).props.resizeMode).toBe('contain');
    await act(() => imageLayer.findByType(Image).props.onError());
    expect(imageLayer.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findByType(ImageBackground).props.source).toEqual(artwork);
    expect(
      tree.root.findAllByProps({ children: '捞\n尸\n人' }).length +
        tree.root.findAllByProps({ children: '捞尸人' }).length,
    ).toBeGreaterThan(0);
    await act(() => tree.unmount());
  },
);

test('无网络封面的同一本书在大小封面中复用同一底图', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <BookCover id="local-book" title="捞尸人" author="本地导入" />,
    );
  });
  const artwork = tree.root.findByType(ImageBackground).props.source;
  expect(
    tree.root.findByType(BookCoverImage).findAllByType(Image),
  ).toHaveLength(0);
  await act(() =>
    tree.update(<BookCover id="local-book" title="捞尸人" compact />),
  );
  expect(tree.root.findByType(ImageBackground).props.source).toEqual(artwork);
  expect(
    tree.root.findByType(BookCoverImage).findAllByType(Image),
  ).toHaveLength(0);
  await act(() => tree.unmount());
});
