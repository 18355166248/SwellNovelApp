import { formatFollowResult } from '../src/utils/followResult';

it('有新章仍明确展示部分书检查失败和离线缓存失败', () => {
  expect(
    formatFollowResult({ updated: 3, cached: 1, failed: 2, cacheFailed: 2 }),
  ).toBe(
    '发现 3 个新章节，已自动缓存 1 章，2 本检查失败，2 章缓存失败，可阅读时重试',
  );
});
it('全部无更新才显示已是最新', () => {
  expect(formatFollowResult({ updated: 0, cached: 0, failed: 0 })).toBe(
    '追更书籍已是最新',
  );
  expect(formatFollowResult({ updated: 0, cached: 0, failed: 1 })).toBe(
    '1 本检查失败',
  );
});
