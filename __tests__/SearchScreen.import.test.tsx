import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import SearchScreen from '../src/screens/SearchScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { searchNovels } from '../src/services/search/novelSearch';
import type { Book } from '../src/store/types/book';

const mockNavigation = { navigate: jest.fn(), push: jest.fn() };
const mockAdd = jest.fn();
let mockBooks: Book[] = [];
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));
jest.mock('../src/store', () => ({
  ...jest.requireActual('../src/store'),
  useAllBooks: () => mockBooks,
  useAddOnlineBook: () => mockAdd,
}));
jest.mock('../src/components', () => ({
  Text: require('../src/components/Text').Text,
  Icon: () => null,
}));
jest.mock('../src/services/search/novelSearch', () => ({
  isNovelSearchSupported: true,
  searchNovels: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockBooks = [];
  mockAdd.mockResolvedValue({ id: 'added' });
});
it.each([
  ['http://wap.xuanhuange.info/info-192466/', true],
  ['https://www.bqquge.org/123/', false],
])('搜索结果 %s 与粘贴链接的入库能力选择一致', async (url, browser) => {
  jest
    .mocked(searchNovels)
    .mockResolvedValue([
      { url, title: '测试小说', author: '作者', sourceName: '测试站' },
    ]);
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <ThemeProvider>
        <SearchScreen />
      </ThemeProvider>,
    );
  });
  await act(() =>
    tree.root.findByType(TextInput).props.onChangeText('测试小说'),
  );
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: '搜索小说' })[0]
      .props.onPress(),
  );
  const row = tree.root.findAll(
    n =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.includes('来源 测试站'),
  )[0];
  await act(async () => row.props.onPress());
  if (browser) {
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('InAppBrowser', {
      initialUrl: url,
    });
  } else {
    expect(mockAdd).toHaveBeenCalledWith(url);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', {
      bookId: 'added',
    });
  }
  await act(() => tree.unmount());
});

it('已入库的玄幻阁搜索结果直接续用原书，不再次导入或打开网页', async () => {
  const url = 'http://wap.xuanhuange.info/info-192466/';
  mockBooks = [
    {
      id: 'existing',
      title: '测试小说',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 0,
      source: {
        name: 'xuanhuange',
        bookUrl: 'http://wap.xuanhuange.info/wapbook-192466/',
      },
    },
  ];
  jest
    .mocked(searchNovels)
    .mockResolvedValue([{ url, title: '测试小说', sourceName: '测试站' }]);
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <ThemeProvider>
        <SearchScreen />
      </ThemeProvider>,
    );
  });
  await act(() =>
    tree.root.findByType(TextInput).props.onChangeText('测试小说'),
  );
  await act(async () =>
    tree.root
      .findAllByProps({ accessibilityLabel: '搜索小说' })[0]
      .props.onPress(),
  );
  await act(async () =>
    tree.root
      .findAll(
        n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('来源 测试站'),
      )[0]
      .props.onPress(),
  );
  expect(mockAdd).not.toHaveBeenCalled();
  expect(mockNavigation.navigate).toHaveBeenCalledWith('BookDetail', {
    bookId: 'existing',
  });
  await act(() => tree.unmount());
});

it('网站导入每次打开新的入口页面，不继承之前链接的路由参数', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(() => {
    tree = Renderer.create(
      <ThemeProvider>
        <SearchScreen />
      </ThemeProvider>,
    );
  });
  const entry = tree.root.findAllByProps({
    accessibilityLabel: '打开网站导入',
  })[0];
  await act(() => entry.props.onPress());
  await act(() => entry.props.onPress());
  expect(mockNavigation.push.mock.calls).toEqual([
    ['InAppBrowser'],
    ['InAppBrowser'],
  ]);
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
  await act(() => tree.unmount());
});
