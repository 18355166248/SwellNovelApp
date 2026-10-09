import { JSDOM } from 'jsdom';
import {
  RECOGNIZER_JS,
  expandRecognizedCatalog,
  getRecognitionTargetUrl,
  parseRecognizedChaptersHtml,
  parseRecognizedPageUrlsHtml,
  recognizeBookHtml,
} from '../src/services/recognize/recognizer';

it('明智屋真实布局的 DOM 与 HTML 路径都读取书名作者封面，跳过 Logo 和其他书封面', () => {
  const url = 'https://tw.mingzw.net/mzwchapter/42628.html';
  const html = `<h1 class="logo"><img alt="明智屋小說網"></h1>
    <i class="novel-name">《測試小說》</i>
    <dl><dt>作者:</dt><dd><a href="/mzwlist/作者.html">測試作者</a></dd></dl>
    <img src="/images/mzwid/999.jpg"><img src="/images/mzwid/42628.jpg">
    ${Array.from(
      { length: 5 },
      (_, i) => `<a href="/mzwread/42628_${i + 1}.html">第${i + 1}章</a>`,
    ).join('')}`;
  const expected = {
    title: '測試小說',
    author: '測試作者',
    cover: 'https://tw.mingzw.net/images/mzwid/42628.jpg',
    isDetail: true,
  };
  expect(recognizeBookHtml(html, url)).toMatchObject(expected);
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const posted = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage: posted },
  });
  dom.window.eval(RECOGNIZER_JS);
  expect(JSON.parse(posted.mock.calls[0][0])).toMatchObject(expected);
  dom.window.close();
});

const PAGE_TWO = `
  <a href="/book/9/11.html">第十一章 山门</a>
  <a href="/book/9/12.html">第十二章 夜谈</a>`;

it.each(['/wapbook-192466/', '/wapbook-192466_2/'])(
  '仙工开物的手机章节在 %s 的 DOM 与 HTML 识别结果一致',
  path => {
    const origin = 'http://wap.xuanhuange.info';
    const url = origin + path;
    // 首章地址由用户提供；其余为回归样本，不代表已抓取真实全书。
    const chapters = Array.from({ length: 5 }, (_, index) => ({
      title: index === 0 ? '第1章：垂髫客' : `第${index + 1}章 测试章节`,
      url: `${origin}/wapbook-192466-${63654391 + index}/`,
    }));
    const html = `<h1>仙工开物</h1>${chapters
      .map(chapter => `<a href="${chapter.url}">${chapter.title}</a>`)
      .join('')}
      <a href="/read/192466/63654391.html">第1章 旧路由别名</a>
      <a href="/wapbook-999999-63654391/">第1章 其他书</a>
      <a href="https://ad.test/wapbook-192466-63654396/">第6章 广告</a>
      <a href="/read/192466-63654396/">第6章 错误混合路由</a>
      <a href="/wapbook-192466/63654396.html">第6章 错误混合路由</a>
      <a href="/wapbook-192466-63654396/">下一章</a>`;
    const expected = { isDetail: true, chapters };
    expect(recognizeBookHtml(html, url)).toMatchObject(expected);
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    const posted = jest.fn();
    Object.defineProperty(dom.window, 'ReactNativeWebView', {
      value: { postMessage: posted },
    });
    try {
      dom.window.eval(RECOGNIZER_JS);
      expect(JSON.parse(posted.mock.calls[0][0])).toMatchObject(expected);
    } finally {
      dom.window.close();
    }
  },
);

it.each([
  [
    '<div class="bookdetail"><img src="/files/cover/book.jpg"></div>',
    'https://www.bqquge.org/files/cover/book.jpg',
  ],
  [
    '<div class="cover"><img src="//img.bookshuku.org/Cover/19.jpg"></div>',
    'https://img.bookshuku.org/Cover/19.jpg',
  ],
  [
    '<div id="fmimg"><img src="placeholder.jpg" data-src="/real.jpg?a=1&amp;b=2"></div>',
    'https://www.bqquge.org/real.jpg?a=1&b=2',
  ],
  [
    '<meta property="og:image" content="/meta.jpg"><div class="cover"><img src="/other.jpg"></div>',
    'https://www.bqquge.org/meta.jpg',
  ],
  [
    '<img src="/advertisement.jpg"><script>var fake=\'<div class="cover"><img src="/fake.jpg"></div>\';</script>',
    '',
  ],
  ['<div class="cover"><img src="javascript:alert(1)"></div>', ''],
])('网页和 HTML 回退路径统一提取实际封面：%s', (markup, cover) => {
  const url = 'https://www.bqquge.org/19';
  const html = `<h1>测试书籍</h1>${markup}`;
  expect(recognizeBookHtml(html, url).cover).toBe(cover);
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const posted = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage: posted },
  });
  dom.window.eval(RECOGNIZER_JS);
  expect(JSON.parse(posted.mock.calls[0][0]).cover).toBe(cover);
  dom.window.close();
});

describe('browser catalog recognizer', () => {
  it.each([
    ['bookshuku.org', '/bookinfo/19.html', '/read/19_', '.html'],
    ['mingzw.net', '/mzwchapter/19.html', '/mzwread/19_', '.html'],
    ['wap.xuanhuange.info', '/wapbook-19/', '/read/19/', '.html'],
    ['wap.xuanhuange.info', '/wapbook-19/', '/wapbook-19-', '/'],
    ['www.bqquge.org', '/19', '/19/', ''],
  ])(
    '%s 的 DOM 与 HTML 识别保留长标题和感言、排除其他书及站外广告',
    (host, bookPath, prefix, suffix) => {
      const base = `https://${host}${bookPath}`;
      const anchors = [
        {
          textContent: '第1章 开始',
          href: `https://${host}${prefix}1${suffix}`,
        },
        { textContent: '上架感言', href: `https://${host}${prefix}2${suffix}` },
        {
          textContent: `第2章 ${'长标题'.repeat(30)}`,
          href: `https://${host}${prefix}3${suffix}`,
        },
        {
          textContent: '第一章 其他书',
          href: `https://${host}${prefix.replace('19', '99')}1${suffix}`,
        },
        {
          textContent: '第二章 广告',
          href: `https://ad.test${prefix}4${suffix}`,
        },
        { textContent: '下一章', href: `https://${host}${prefix}5${suffix}` },
      ];
      // 同书同章的镜像及路由别名只保留首次出现的位置和标题。
      if (host === 'mingzw.net')
        anchors.push({
          textContent: '上架感言',
          href: 'https://tw.mingzw.net/miread/19_2.html',
        });
      const html = anchors
        .map(anchor => `<a href="${anchor.href}">${anchor.textContent}</a>`)
        .join('');
      const expected = anchors
        .slice(0, 3)
        .map(anchor => ({ title: anchor.textContent, url: anchor.href }));
      expect(parseRecognizedChaptersHtml(html, base)).toEqual(expected);
      const posted = jest.fn();
      // eslint-disable-next-line no-new-func
      Function(
        'window',
        'document',
        'location',
        RECOGNIZER_JS,
      )(
        { ReactNativeWebView: { postMessage: posted } },
        {
          querySelectorAll: () => anchors,
          querySelector: () => null,
          body: { innerText: '' },
          title: '测试书',
        },
        new URL(base),
      );
      expect(JSON.parse(posted.mock.calls[0][0]).chapters).toEqual(expected);
    },
  );
  it('DOM 识别脚本的下一页和尾页链接不会扰乱完整分页顺序', () => {
    const posted = jest.fn();
    const origin = 'http://wap.xuanhuange.info';
    const anchors = [
      { textContent: '下一页', href: `${origin}/wapbook-170446_2/` },
      { textContent: '尾页', href: `${origin}/wapbook-170446_4/` },
    ].map(anchor => ({
      ...anchor,
      parentElement: { querySelectorAll: () => anchors },
    }));
    const doc = {
      querySelectorAll: () => anchors,
      querySelector: () => null,
      body: { innerText: '第1/4页' },
      title: '测试书',
    };
    // 测试真实注入字符串的语法及回传；不只验证 TS 辅助函数，防止转义丢失让整段脚本失效。
    // eslint-disable-next-line no-new-func
    Function(
      'window',
      'document',
      'location',
      RECOGNIZER_JS,
    )(
      { ReactNativeWebView: { postMessage: posted } },
      doc,
      new URL(`${origin}/wapbook-170446/`),
    );
    expect(JSON.parse(posted.mock.calls[0][0]).pageUrls).toEqual(
      [2, 3, 4].map(page => `${origin}/wapbook-170446_${page}/`),
    );
  });

  it.each([1, 2])(
    '从第 %i 页导入时按页码合并，不将尾页夹在中间',
    async currentPage => {
      const base = 'http://wap.xuanhuange.info/wapbook-170446';
      const url = (page: number) =>
        page === 1 ? `${base}/` : `${base}_${page}/`;
      const chapter = (page: number) => ({
        title: `第${page}章`,
        url: `http://wap.xuanhuange.info/read/170446/${page}.html`,
      });
      const result = await expandRecognizedCatalog(
        {
          ok: true,
          isDetail: true,
          url: url(currentPage),
          host: 'wap.xuanhuange.info',
          chapters: [chapter(currentPage)],
          pageUrls: [4, 2, 3, 1].map(url),
        },
        async pageUrl => {
          const page = [1, 2, 3, 4].find(number => url(number) === pageUrl)!;
          return `<a href="${chapter(page).url}">${chapter(page).title}</a>`;
        },
      );
      expect(result.chapters.map(item => item.title)).toEqual(
        [1, 2, 3, 4].map(page => `第${page}章`),
      );
    },
  );

  it('分页返回相同章节时明确失败，不能把失效分页当完整目录', async () => {
    jest.useFakeTimers();
    try {
      const request = expandRecognizedCatalog(
        {
          ok: true,
          isDetail: true,
          url: 'https://example.com/book-9/',
          host: 'example.com',
          chapters: [
            { title: '第一章', url: 'https://example.com/chapter-1.html' },
          ],
          pageUrls: ['https://example.com/book-9_2/'],
        },
        async () => '<a href="/chapter-1.html">第一章</a>',
      );
      // 先挂拒绝监听，再推进重试计时器，避免未处理拒绝；断言在下方等待。
      // eslint-disable-next-line jest/valid-expect
      const expectation = expect(request).rejects.toThrow('目录分页可能失效');
      await jest.advanceTimersByTimeAsync(2000);
      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });
  it('玄幻阁详情页自动换算到同书号目录页', () => {
    expect(
      getRecognitionTargetUrl('http://wap.xuanhuange.info/info-170446/'),
    ).toBe('http://wap.xuanhuange.info/wapbook-170446/');
    expect(
      getRecognitionTargetUrl('http://wap.xuanhuange.info/wapbook-170446/'),
    ).toBe('http://wap.xuanhuange.info/wapbook-170446/');
    expect(getRecognitionTargetUrl('http://example.com/info-170446/')).toBe(
      'http://example.com/info-170446/',
    );
  });

  it('从分页 HTML 提取并归一化章节链接', () => {
    expect(
      parseRecognizedChaptersHtml(
        PAGE_TWO,
        'http://wap.example.com/book/9/2.html',
      ),
    ).toEqual([
      { title: '第十一章 山门', url: 'http://wap.example.com/book/9/11.html' },
      { title: '第十二章 夜谈', url: 'http://wap.example.com/book/9/12.html' },
    ]);
  });

  it('相对上级路径和 query 章节地址按标准 URL 解析，拒绝非网页协议', () => {
    expect(
      parseRecognizedChaptersHtml(
        `
      <a href="../chapter/1.html">第一章 开始</a>
      <a href="?chapter=2&amp;mode=read">第二章 继续</a>
      <a href="javascript:alert(1)">第三章 广告</a>`,
        'https://example.com/book/9/catalog.html',
      ),
    ).toEqual([
      { title: '第一章 开始', url: 'https://example.com/book/chapter/1.html' },
      {
        title: '第二章 继续',
        url: 'https://example.com/book/9/catalog.html?chapter=2&mode=read',
      },
    ]);
  });

  it('分页模板不能使用站外广告的下一页链接', () => {
    expect(() =>
      parseRecognizedPageUrlsHtml(
        '<a href="https://ad.example/book-9_2/">下一页</a><div>第1/3页</div>',
        'https://example.com/book-9/',
      ),
    ).toThrow('无法确认完整目录');
  });

  it('合并全部分页后才返回目录，章节链接去重', async () => {
    const progress: string[] = [];
    const merged = await expandRecognizedCatalog(
      {
        ok: true,
        isDetail: true,
        url: 'http://wap.example.com/book/9/1.html',
        host: 'wap.example.com',
        chapters: [
          { title: '第一章 开始', url: 'http://wap.example.com/book/9/1.html' },
        ],
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
    expect(book.title).toBe('测试小说');
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

it.each([
  ['bookshuku.org', '/read/19_', '.html'],
  ['mingzw.net', '/mzwread/19_', '.html'],
  ['wap.xuanhuange.info', '/read/19/', '.html'],
  ['wap.xuanhuange.info', '/wapbook-19-', '/'],
  ['www.bqquge.org', '/19/', ''],
])(
  '%s 的首页及搜索页不会把推荐区最新章节识别成一本书',
  (host, prefix, suffix) => {
    const anchors = Array.from({ length: 6 }, (_, index) => ({
      textContent: `第${index + 1}章 推荐小说最新章`,
      href: `https://${host}${prefix}${index + 1}${suffix}`,
    }));
    const html = anchors
      .map(anchor => `<a href="${anchor.href}">${anchor.textContent}</a>`)
      .join('');
    for (const path of ['/', '/search.html']) {
      const url = `https://${host}${path}`;
      expect(recognizeBookHtml(html, url).isDetail).toBe(false);
      expect(parseRecognizedChaptersHtml(html, url)).toEqual([]);
      const posted = jest.fn();
      // 验证最终 WebView 脚本的页面类型判断，防止只修复 HTML 备用链路。
      // eslint-disable-next-line no-new-func
      Function(
        'window',
        'document',
        'location',
        RECOGNIZER_JS,
      )(
        { ReactNativeWebView: { postMessage: posted } },
        {
          querySelectorAll: () => anchors,
          querySelector: () => null,
          body: { innerText: '' },
          title: '网站首页',
        },
        new URL(url),
      );
      expect(JSON.parse(posted.mock.calls[0][0]).isDetail).toBe(false);
      expect(JSON.parse(posted.mock.calls[0][0]).chapters).toEqual([]);
    }
  },
);
