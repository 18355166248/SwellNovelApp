import {
  expandRecognizedCatalog,
  getRecognitionTargetUrl,
  parseRecognizedChaptersHtml,
  parseRecognizedPageUrlsHtml,
  recognizeBookHtml,
} from '../src/services/recognize/recognizer';

const PAGE_TWO = `
  <a href="/book/9/11.html">第十一章 山门</a>
  <a href="/book/9/12.html">第十二章 夜谈</a>`;

describe('browser catalog recognizer', () => {
  it('玄幻阁详情页自动换算到同书号目录页', () => {
    expect(getRecognitionTargetUrl('http://wap.xuanhuange.info/info-170446/')).toBe(
      'http://wap.xuanhuange.info/wapbook-170446/',
    );
    expect(getRecognitionTargetUrl('http://wap.xuanhuange.info/wapbook-170446/')).toBe(
      'http://wap.xuanhuange.info/wapbook-170446/',
    );
    expect(getRecognitionTargetUrl('http://example.com/info-170446/')).toBe(
      'http://example.com/info-170446/',
    );
  });

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

  it('可从隐藏 WebView 回传的 HTML 兜底识别书籍目录', () => {
    const book = recognizeBookHtml(
      `<html><head><title>测试小说 - 章节列表</title></head><body>
        <h1>测试小说章节列表</h1>
        <a href="/book/9/1.html">第一章 开始</a>
        <a href="/book/9/2.html">第二章 继续</a>
        <a href="/book/9/3.html">第三章 转折</a>
        <a href="/book/9/4.html">第四章 相遇</a>
        <a href="/book/9/5.html">第五章 结束</a>
      </body></html>`,
      'http://wap.example.com/book/9.html',
    );

    expect(book.isDetail).toBe(true);
    expect(book.title).toBe('测试小说章节列表');
    expect(book.chapters).toHaveLength(5);
  });

  it('根据玄幻阁的页数文案与下一页链接补齐 27 页目录', () => {
    const pages = parseRecognizedPageUrlsHtml(
      `<div class="page"><a href="/wapbook-170446_2/">下一页</a><a href="/wapbook-170446_27/">尾页</a></div>
       <div>(第1/27页)当前40条/页</div>`,
      'http://wap.xuanhuange.info/wapbook-170446/',
    );

    expect(pages).toHaveLength(26);
    expect(pages[0]).toBe('http://wap.xuanhuange.info/wapbook-170446_2/');
    expect(pages.at(-1)).toBe('http://wap.xuanhuange.info/wapbook-170446_27/');
  });
});
