import {
  expandRecognizedCatalog,
  parseRecognizedChaptersHtml,
} from '../src/services/recognize/recognizer';

const PAGE_TWO = `
  <a href="/book/9/11.html">第十一章 山门</a>
  <a href="/book/9/12.html">第十二章 夜谈</a>`;

describe('browser catalog recognizer', () => {
  it('从分页 HTML 提取并归一化章节链接', () => {
    expect(
      parseRecognizedChaptersHtml(PAGE_TWO, 'http://wap.example.com/book/9/2.html'),
    ).toEqual([
      { title: '第十一章 山门', url: 'http://wap.example.com/book/9/11.html' },
      { title: '第十二章 夜谈', url: 'http://wap.example.com/book/9/12.html' },
    ]);
  });

  it('合并全部分页后才返回目录，章节链接去重', async () => {
    const progress: string[] = [];
    const merged = await expandRecognizedCatalog(
      {
        ok: true,
        isDetail: true,
        url: 'http://wap.example.com/book/9/1.html',
        host: 'wap.example.com',
        chapters: [{ title: '第一章 开始', url: 'http://wap.example.com/book/9/1.html' }],
        pageUrls: [
          'http://wap.example.com/book/9/1.html',
          'http://wap.example.com/book/9/2.html',
        ],
      },
      async url => {
        expect(url).toBe('http://wap.example.com/book/9/2.html');
        return PAGE_TWO;
      },
      (done, total) => progress.push(`${done}/${total}`),
    );

    expect(progress).toEqual(['1/1']);
    expect(merged.chapters).toHaveLength(3);
    expect(merged.pageUrls).toEqual([]);
  });
});
