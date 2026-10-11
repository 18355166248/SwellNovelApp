import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, Keyboard, StyleSheet, TextInput } from 'react-native';
import BookCatalogModal from '../src/screens/bookDetail/BookCatalogModal';
import { ThemeProvider } from '../src/theme/ThemeContext';
import type { Chapter } from '../src/store/types/book';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/components', () => ({
  Text: require('../src/components/Text').Text,
  Icon: () => null,
}));

const chapters: Chapter[] = Array.from({ length: 1200 }, (_, index) => ({
  id: `c-${index}`,
  bookId: 'catalog-test',
  title: `第${index + 1}章 ${'很长的章节标题需要完整展示'.repeat(
    index === 1003 ? 6 : 1,
  )}`,
  order: index,
  content: '',
}));

let tree: Renderer.ReactTestRenderer;
const select = jest.fn();
async function mount(currentIndex = 1003, items = chapters) {
  await act(() => {
    tree = Renderer.create(
      <ThemeProvider>
        <BookCatalogModal
          chapters={items}
          currentIndex={currentIndex}
          onClose={() => {}}
          onSelect={select}
        />
      </ThemeProvider>,
    );
  });
}
async function press(label: string) {
  await act(() =>
    tree.root.findAllByProps({ accessibilityLabel: label })[0].props.onPress(),
  );
}
async function search(query: string) {
  await act(() => tree.root.findByType(TextInput).props.onChangeText(query));
}
afterEach(async () => {
  await act(() => tree?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
  select.mockClear();
});

it('完整展示长标题，四位目录序号不折行；选择仍使用原始目录索引', async () => {
  await mount();
  const props = tree.root.findByType(FlatList).props;
  expect(props.initialScrollIndex).toBe(1003);
  // 可变行高不能使用固定偏移，否则续读位置会落到错误章节。
  expect(props.getItemLayout).toBeUndefined();
  const row = props.renderItem({ item: props.data[1003] });
  const [number, title] = row.props.children;
  expect(number.props.children).toBe(1004);
  expect(number.props.numberOfLines).toBe(1);
  expect(StyleSheet.flatten(number.props.style).width).toBeGreaterThanOrEqual(
    36,
  );
  expect(title.props.children).toBe(chapters[1003].title);
  expect(title.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(row.props.style).height).toBeUndefined();
  await act(() => row.props.onPress());
  expect(select).toHaveBeenCalledWith(1003);
});

it('搜索从第一个结果开始，显示匹配数量，清空恢复续读位置', async () => {
  await mount();
  await search('第');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(0);
  expect(
    tree.root.findAllByProps({ children: '匹配 1200 / 1200 项' }).length,
  ).toBeGreaterThan(0);
  await search('1004');
  expect(
    tree.root
      .findByType(FlatList)
      .props.data.map((item: { index: number }) => item.index),
  ).toEqual([1003]);
  await press('清空章节搜索');
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(1003);
  expect(select).not.toHaveBeenCalled();
});

it('倒序浏览后定位续读会清空筛选，保留倒序并定位正确位置，不打开章节', async () => {
  await mount();
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await press('切换为倒序');
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(0);
  await search('不存在');
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(0);
  expect(
    tree.root.findByType(FlatList).props.initialScrollIndex,
  ).toBeUndefined();
  await press('定位续读章节');
  const props = tree.root.findByType(FlatList).props;
  expect(tree.root.findByType(TextInput).props.value).toBe('');
  expect(props.data[0].index).toBe(1199);
  expect(props.initialScrollIndex).toBe(196);
  expect(props.data[196].index).toBe(1003);
  expect(dismiss).toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

it('未测量远处行高时先靠近目标再定位；换搜索条件取消旧列表的延迟定位', async () => {
  jest.useFakeTimers();
  await mount();
  const instance = tree.root.findByType(FlatList).instance;
  const offset = jest
    .spyOn(instance, 'scrollToOffset')
    .mockImplementation(() => {});
  const index = jest
    .spyOn(instance, 'scrollToIndex')
    .mockImplementation(() => {});
  const fail = tree.root.findByType(FlatList).props.onScrollToIndexFailed;
  await act(() => fail({ index: 1003, averageItemLength: 70 }));
  expect(offset).toHaveBeenCalledWith({ offset: 70210, animated: false });
  await act(() => jest.advanceTimersByTime(100));
  expect(index).toHaveBeenCalledWith({ index: 1003, animated: false });
  index.mockClear();
  await act(() => fail({ index: 1003, averageItemLength: 72 }));
  await search('第2章');
  await act(() => jest.advanceTimersByTime(100));
  expect(index).not.toHaveBeenCalled();
});

it('空目录禁用定位；键盘提交只收起键盘，不意外进入阅读', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await mount(0, []);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '定位续读章节' })[0].props
      .disabled,
  ).toBe(true);
  await act(() => tree.root.findByType(TextInput).props.onSubmitEditing());
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(select).not.toHaveBeenCalled();
});
