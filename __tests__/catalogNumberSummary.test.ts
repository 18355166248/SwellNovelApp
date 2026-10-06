import { catalogNumberSummary } from '../src/utils/catalogNumberSummary';
it('拆分、合章和公告分别统计，不把条目数当作真实章号', () => {
  const items = [
    '第1章',
    '第2章【上】',
    '第2章【下】',
    '第3-4章 合章',
    '休息一天',
    '第6章',
  ].map(title => ({ title }));
  expect(catalogNumberSummary(items)).toEqual({
    entries: 6,
    maxNumber: 6,
    coveredNumbers: 5,
    numberedEntries: 5,
    unnumberedEntries: 1,
    mergedExtraNumbers: 1,
    repeatedNumberEntries: 1,
    unmatchedNumbers: [5],
  });
  expect(items[2].title).toBe('第2章【下】');
});
it('中文和全角章号兼容，章名内数字不参与统计', () => {
  expect(
    catalogNumberSummary(
      [
        '第七百三十一章 东海',
        '第１２章',
        '第十一章',
        '第一千零一章',
        '感言：731天',
        '章名里第八章',
      ].map(title => ({ title })),
    ),
  ).toMatchObject({ maxNumber: 1001, coveredNumbers: 4, unnumberedEntries: 2 });
});
it('坏范围与卷标题不展开，完整顺序不报告章号缺失', () => {
  expect(
    catalogNumberSummary(
      ['第1章', '第2章', '第3章', '第一卷', '第9-1章', '第1-999999999章'].map(
        title => ({ title }),
      ),
    ),
  ).toMatchObject({ maxNumber: 3, unmatchedNumbers: [], unnumberedEntries: 3 });
});
