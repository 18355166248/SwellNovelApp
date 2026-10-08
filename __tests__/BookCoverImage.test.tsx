import React from 'react';
import { Image } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { BookCoverImage } from '../src/components/BookCoverImage';

test('缺少封面时保留下层兜底，不发起图片加载', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(<BookCoverImage title="捞尸人" uri="  " />);
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  await act(() => tree.unmount());
});

test('失败时回退，封面更新后重新加载，旧图片事件不影响新封面', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <BookCoverImage title="夜无疆" uri=" https://example.com/old.jpg " />,
    );
  });
  const oldImage = tree.root.findByType(Image);
  expect(oldImage.props.source.uri).toBe('https://example.com/old.jpg');
  const failOldImage = oldImage.props.onError;
  await act(() => failOldImage());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  await act(() => {
    tree.update(
      <BookCoverImage title="夜无疆" uri="https://example.com/new.jpg" />,
    );
  });
  await act(() => failOldImage());
  expect(tree.root.findByType(Image).props.source.uri).toBe(
    'https://example.com/new.jpg',
  );
  await act(() => tree.unmount());
});
