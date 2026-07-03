import { parseTxtChapters } from '../src/utils/txt';

describe('parseTxtChapters', () => {
  it('按常见中文章节标题切分正文', () => {
    const chapters = parseTxtChapters(
      'book',
      [
        '序言',
        '第1章 开始',
        '这里是第一章正文',
        '第二章 继续',
        '这里是第二章正文',
      ].join('\n'),
    );

    expect(chapters.map(c => c.title)).toEqual([
      '开始',
      '第1章 开始',
      '第二章 继续',
    ]);
    expect(chapters.map(c => c.content)).toEqual([
      '序言',
      '这里是第一章正文',
      '这里是第二章正文',
    ]);
  });

  it('无章节标题的大文本会拆成虚拟章节，避免阅读页一次处理整本书', () => {
    const content = `${'甲'.repeat(31000)}\n${'乙'.repeat(31000)}`;
    const chapters = parseTxtChapters('book', content);

    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toBe('开始');
    expect(chapters[1].title).toBe('开始（续2）');
    chapters.forEach(chapter => {
      expect(chapter.content.length).toBeLessThanOrEqual(31001);
    });
  });

  it('单行超长文本也会拆分', () => {
    const chapters = parseTxtChapters('book', '甲'.repeat(61000));

    expect(chapters).toHaveLength(3);
    chapters.forEach(chapter => {
      expect(chapter.content.length).toBeLessThanOrEqual(30000);
    });
  });

  it('超大单章在章节内拆分，后续章节重新从原标题开始计数', () => {
    const content = [
      '第一章 长章',
      '甲'.repeat(31000),
      '乙'.repeat(31000),
      '第二章 短章',
      '短内容',
    ].join('\n');
    const chapters = parseTxtChapters('book', content);

    expect(chapters[0].title).toBe('第一章 长章');
    expect(
      chapters
        .slice(1, -1)
        .every(c => c.title.startsWith('第一章 长章（续')),
    ).toBe(true);
    expect(chapters[chapters.length - 1].title).toBe('第二章 短章');
    expect(chapters[chapters.length - 1].content).toBe('短内容');
  });
});
