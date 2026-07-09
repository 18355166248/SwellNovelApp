import {
  extractChapterNumberFromTitle,
  parseChineseInteger,
  resolveChapterSearchIndex,
} from '../src/utils/chapterSearch';

const chapters = Array.from({ length: 757 }, (_, index) => ({
  title: `第${index + 1}章`,
  sourceUrl: `http://wap.bookshuku.org/read/160297_${index + 1}.html`,
}));

chapters[490] = {
  title: '第四百五十章',
  sourceUrl: 'http://wap.bookshuku.org/read/160297_491.html',
};
chapters[491] = {
  title: '第四百五十一章',
  sourceUrl: 'http://wap.bookshuku.org/read/160297_492.html',
};

describe('chapterSearch', () => {
  it('parseChineseInteger 解析中文章号', () => {
    expect(parseChineseInteger('十')).toBe(10);
    expect(parseChineseInteger('十一')).toBe(11);
    expect(parseChineseInteger('四百五十')).toBe(450);
    expect(parseChineseInteger('六百八十二')).toBe(682);
  });

  it('extractChapterNumberFromTitle 从标题提取真实章号', () => {
    expect(extractChapterNumberFromTitle('第四百五十章')).toBe(450);
    expect(extractChapterNumberFromTitle('第 451 章  标题')).toBe(451);
  });

  it('数字搜索优先匹配真实标题章号，避免按数组位置误滚动', () => {
    expect(resolveChapterSearchIndex(chapters, '450', 0)).toBe(490);
    expect(resolveChapterSearchIndex(chapters, '第四百五十', 0)).toBe(490);
  });

  it('标题章号不存在时才退回 sourceUrl 序号和数组序号', () => {
    expect(resolveChapterSearchIndex(chapters, '492', 0)).toBe(491);
    expect(resolveChapterSearchIndex(chapters, '700', 0)).toBe(699);
  });
});
