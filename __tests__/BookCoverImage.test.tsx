import React from 'react';
import { Image, View } from 'react-native';
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

test.each([
  [300, 400, false],
  [360, 480, false],
  [302, 400, false],
  [400, 300, true],
  [200, 600, true],
])(
  '图片 %s×%s 仅在比例不匹配时启用同图模糊背景',
  async (width, height, backdrop) => {
    let tree!: Renderer.ReactTestRenderer;
    await act(() => {
      tree = Renderer.create(
        <BookCoverImage title="完整封面" uri="https://covers.test/1.jpg" />,
      );
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
    await act(() => {
      tree.root.findByType(View).props.onLayout({
        nativeEvent: { layout: { width: 100, height: 400 / 3 } },
      });
      tree.root
        .findByType(Image)
        .props.onLoad({ nativeEvent: { source: { width, height } } });
    });
    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(backdrop ? 2 : 1);
    const foreground = images.find(
      image => image.props.resizeMode === 'contain',
    )!;
    expect(foreground.props.accessibilityLabel).toBe('完整封面封面');
    if (backdrop) {
      expect(images[0].props.source).toEqual(foreground.props.source);
      expect(images[0].props.resizeMode).toBe('cover');
      expect(images[0].props.blurRadius).toBeGreaterThan(5);
      expect(images[0].props.accessible).toBe(false);
      expect(images[0].props.onError).toBeUndefined();
    }
    // 正常图和异常比例图都由前景错误统一退回定制封面。
    await act(() => foreground.props.onError());
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    await act(() => tree.unmount());
  },
);

test('布局恢复匹配比例后移除模糊背景，更新地址后重新判断', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <BookCoverImage title="测试" uri="https://covers.test/old.jpg" />,
    );
  });
  const onLayout = tree.root.findByType(View).props.onLayout;
  await act(() => {
    onLayout({ nativeEvent: { layout: { width: 100, height: 150 } } });
    tree.root
      .findByType(Image)
      .props.onLoad({ nativeEvent: { source: { width: 200, height: 100 } } });
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(2);
  await act(() =>
    onLayout({ nativeEvent: { layout: { width: 200, height: 100 } } }),
  );
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  await act(() =>
    onLayout({ nativeEvent: { layout: { width: 100, height: 150 } } }),
  );
  expect(tree.root.findAllByType(Image)).toHaveLength(2);
  await act(() =>
    tree.update(
      <BookCoverImage title="测试" uri="https://covers.test/new.jpg" />,
    ),
  );
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  expect(tree.root.findByType(Image).props.source.uri).toBe(
    'https://covers.test/new.jpg',
  );
  await act(() => tree.unmount());
});
