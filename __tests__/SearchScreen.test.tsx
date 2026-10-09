import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Keyboard, TextInput, Text } from 'react-native';
import SearchScreen from '../src/screens/SearchScreen';
import type {
  NovelSearchOptions,
  NovelSearchResult,
} from '../src/services/search/novelSearch';
import type { Book } from '../src/store/types/book';

const mockNavigate = jest.fn();
const mockSearch = jest.fn();
const mockAdd = jest.fn();
let mockBooks: Book[] = [];
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../src/services/search/novelSearch', () => ({
  isNovelSearchSupported: true,
  searchNovels: (...args: unknown[]) => mockSearch(...args),
}));
jest.mock('../src/store', () => ({
  searchHistoryAtom: require('jotai').atom([]),
  useAllBooks: () => mockBooks,
  useAddOnlineBook: () => mockAdd,
}));
jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({ theme: require('../src/theme/themes').lightTheme }),
}));
jest.mock('../src/components', () => ({
  Text: require('react-native').Text,
  Icon: () => null,
}));

const novel: NovelSearchResult = {
  url: 'https://tw.mingzw.net/mzwbook/10001.html',
  title: '夜无疆',
  author: '辰东',
  sourceName: '明智屋中文网',
};
const resultLabel = '夜无疆，作者 辰东，来源 明智屋中文网，加入书架';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('SearchScreen 搜索与入库交互', () => {
  let tree: Renderer.ReactTestRenderer;
  const control = (label: string) =>
    tree.root.findByProps({ accessibilityLabel: label });
  const text = () =>
    tree.root
      .findAllByType(Text)
      .map(item => item.props.children)
      .flat()
      .join('');
  const change = async (value: string) => {
    await act(() => tree.root.findByType(TextInput).props.onChangeText(value));
  };
  const submit = async () => {
    await act(() => control('搜索小说').props.onPress());
  };
  beforeEach(async () => {
    mockBooks = [];
    mockNavigate.mockReset();
    mockAdd.mockReset();
    mockSearch.mockReset();
    await act(() => {
      tree = Renderer.create(<SearchScreen />);
    });
  });
  afterEach(async () => {
    await act(() => tree.unmount());
  });

  it('输入后聚焦结果，提交时收起键盘，清空后恢复网站入口', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    mockSearch.mockResolvedValue([novel]);
    expect(control('打开网站导入')).toBeTruthy();
    await change('夜无疆');
    expect(
      tree.root.findAllByProps({ accessibilityLabel: '打开网站导入' }),
    ).toHaveLength(0);
    await submit();
    expect(dismiss).toHaveBeenCalled();
    expect(control(resultLabel)).toBeTruthy();
    await act(() => control('清空搜索内容').props.onPress());
    expect(control('打开网站导入')).toBeTruthy();
    dismiss.mockRestore();
  });

  it('先显示有效候选，添加失败保留列表和完成态，不误报搜索失败', async () => {
    const pending = deferred<NovelSearchResult[]>();
    mockSearch.mockReturnValue(pending.promise);
    await change('夜无疆');
    await submit();
    const options = mockSearch.mock.calls[0][1] as NovelSearchOptions;
    await act(() => options.onResults?.([novel]));
    expect(text()).toContain('已找到 1 本，正在继续搜索');
    mockAdd.mockRejectedValue(new Error('书源暂不可用'));
    await act(() => control(resultLabel).props.onPress());
    expect(options.isCancelled?.()).toBe(true);
    expect(text()).toContain('添加失败：书源暂不可用');
    expect(text()).not.toContain('搜索失败');
    expect(control(resultLabel).props.disabled).toBe(false);
    expect(control('搜索小说').props.disabled).toBe(false);
    await act(() => pending.resolve([]));
    expect(control(resultLabel)).toBeTruthy();
  });

  it('重复点击只入库一次，编辑输入后迟到入库不导航', async () => {
    const pending = deferred<Book>();
    mockSearch.mockResolvedValue([novel]);
    mockAdd.mockReturnValue(pending.promise);
    await change('夜无疆');
    await submit();
    const press = control(resultLabel).props.onPress;
    await act(() => {
      press();
      press();
    });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(control(resultLabel).props.disabled).toBe(true);
    await change('新的搜索');
    await act(() =>
      pending.resolve({
        id: 'test',
        title: novel.title,
        author: '辰东',
        addedAt: 1,
        updatedAt: 1,
        progress: 0,
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(text()).not.toContain('夜无疆');
    expect(control('搜索小说').props.disabled).toBe(false);
  });

  it('输入变更隔离分批回传和最终结果，清空恢复历史入口', async () => {
    const pending = deferred<NovelSearchResult[]>();
    mockSearch.mockReturnValue(pending.promise);
    await change('夜无疆');
    await submit();
    const options = mockSearch.mock.calls[0][1] as NovelSearchOptions;
    await change('新书');
    await act(() => {
      options.onResults?.([novel]);
      pending.resolve([novel]);
    });
    expect(text()).not.toContain('夜无疆');
    expect(text()).toContain('输入完成后点击');
    await act(() => control('清空搜索内容').props.onPress());
    expect(tree.root.findByType(TextInput).props.value).toBe('');
    expect(control('搜索小说').props.disabled).toBe(true);
  });

  it('搜索错误提供明确重试，已有小说打开详情而不再入库', async () => {
    mockSearch
      .mockRejectedValueOnce(new Error('暂时不可用'))
      .mockResolvedValue([novel]);
    await change('夜无疆');
    await submit();
    expect(text()).toContain('暂时不可用');
    await act(() => control('重新搜索小说').props.onPress());
    expect(mockSearch).toHaveBeenCalledTimes(2);
    mockBooks = [
      {
        id: 'exists',
        title: novel.title,
        author: '辰东',
        addedAt: 1,
        updatedAt: 1,
        progress: 0,
        source: { name: 'mingzw', bookUrl: novel.url },
      },
    ];
    await act(() => tree.update(<SearchScreen />));
    await act(() =>
      control(
        '夜无疆，作者 辰东，来源 明智屋中文网，已在书架，打开详情',
      ).props.onPress(),
    );
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('BookDetail', {
      bookId: 'exists',
    });
  });
});
