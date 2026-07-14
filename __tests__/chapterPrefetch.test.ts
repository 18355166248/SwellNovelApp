import {
  getForwardPrefetchIndices,
  READER_PREFETCH_AHEAD,
} from '../src/utils/chapterPrefetch';

describe('getForwardPrefetchIndices', () => {
  it('默认预取当前章之后三章', () => {
    expect(getForwardPrefetchIndices(4, 20)).toEqual([5, 6, 7]);
    expect(READER_PREFETCH_AHEAD).toBe(3);
  });

  it('到书末时自动截断且不越界', () => {
    expect(getForwardPrefetchIndices(8, 10)).toEqual([9]);
    expect(getForwardPrefetchIndices(9, 10)).toEqual([]);
  });

  it('空目录和禁用预取时返回空数组', () => {
    expect(getForwardPrefetchIndices(0, 0)).toEqual([]);
    expect(getForwardPrefetchIndices(0, 10, 0)).toEqual([]);
  });
});
