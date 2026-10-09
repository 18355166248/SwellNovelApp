import { JSDOM } from 'jsdom';
import {
  RECOGNIZER_JS,
  expandRecognizedCatalog,
  recognizeBookHtml,
} from '../src/services/recognize/recognizer';

const origin = 'https://tw.mingzw.net';
const pageUrl = (bookId: number, page: number) =>
  origin + '/mzwchapter/' + bookId + (page === 1 ? '' : '_' + page) + '/';

/** 本地构造的分页路径及目录矩阵只检查解析边界，不作为多本真实小说的网络验收。 */
function catalog(bookId: number, page: number, totalPages: number) {
  const chapterUrls = Array.from(
    { length: 6 },
    (_, index) =>
      origin +
      '/mzwread/' +
      bookId +
      '_' +
      (60000000 + page * 10 + index) +
      '.html',
  );
  const chapterLinks = chapterUrls
    .map(
      (url, index) =>
        '<a href="' +
        url +
        '">' +
        (index === 0 ? '上架感言' : '第' + (page * 6 + index) + '章 测试') +
        '</a>',
    )
    .join('');
  // 分页栏的“首页”就是本书目录，不是第一份分页模板。
  const html =
    '<h1>回归书籍 ' +
    bookId +
    '</h1>' +
    chapterLinks +
    '<a href="/mzwread/999999_60000000.html">第1章 推荐书籍</a>' +
    '<script>var advertisement = \'<a href="/mzwread/' +
    bookId +
    '_69999999.html">第999章 脚本字符串</a>\';</script>' +
    '<div class="page">' +
    '<a href="' +
    pageUrl(bookId, 1) +
    '">首页</a>' +
    '<a href="' +
    pageUrl(bookId, Math.min(page + 1, totalPages)) +
    '">下一页</a>' +
    '<a href="' +
    pageUrl(bookId, totalPages) +
    '">尾页</a></div>' +
    '<div>第 ' +
    page +
    '/' +
    totalPages +
    ' 页</div>';
  return { html, chapterUrls };
}

function recognizeDom(html: string, url: string) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  // JSDOM 不做布局；目录页文案用 textContent 代替 innerText，站点脚本不执行。
  Object.defineProperty(dom.window.document.body, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const posted = jest.fn();
  Object.defineProperty(dom.window, 'ReactNativeWebView', {
    value: { postMessage: posted },
  });
  try {
    dom.window.eval(RECOGNIZER_JS);
    expect(posted).toHaveBeenCalledTimes(1);
    return JSON.parse(posted.mock.calls[0][0]);
  } finally {
    dom.window.close();
  }
}

it.each([
  [19, 1, 3],
  [192466, 1, 27],
  [170446, 14, 27],
  [200001, 1, 150],
  [200002, 150, 200],
])(
  '书号 %i 从第 %i/%i 页识别时 DOM 与 HTML 的章节、全部分页一致',
  (bookId, page, total) => {
    const url = pageUrl(bookId, page);
    const { html, chapterUrls } = catalog(bookId, page, total);
    const expectedPages = Array.from({ length: total }, (_, i) => i + 1)
      .filter(number => number !== page)
      .map(number => origin + '/mzwchapter/' + bookId + '_' + number + '/');
    for (let repeat = 0; repeat < 3; repeat++) {
      const htmlResult = recognizeBookHtml(html, url);
      const domResult = recognizeDom(html, url);
      for (const result of [htmlResult, domResult]) {
        expect(result.isDetail).toBe(true);
        expect(
          result.chapters.map((chapter: { url: string }) => chapter.url),
        ).toEqual(chapterUrls);
        expect(result.pageUrls).toEqual(expectedPages);
      }
    }
  },
);

it.each([
  '<div>第1/201页</div><a href="/mzwchapter/192466_2/">下一页</a>',
  '<div>第1/27页</div><a href="/mzwchapter/999999_2/">下一页</a>',
  '<div>第1/27页</div>',
  '<div>第28/27页</div><a href="/mzwchapter/192466_2/">下一页</a>',
])('分页范围或链接无法确认时显式失败，不把当前页当完整目录：%s', pager => {
  const url = pageUrl(192466, 1);
  const { html } = catalog(192466, 1, 1);
  const markup = html.slice(0, html.indexOf('<div class="page">')) + pager;
  expect(() => recognizeBookHtml(markup, url)).toThrow('无法确认完整目录');
  expect(recognizeDom(markup, url)).toMatchObject({ ok: false, chapters: [] });
});

it('从中间页开始合并 27 页时顺序正确，不请求其他书、不漏页、不混入脚本伪章节', async () => {
  const bookId = 192466,
    total = 27,
    page = 14;
  const url = pageUrl(bookId, page);
  const first = recognizeBookHtml(catalog(bookId, page, total).html, url);
  const fetchPage = jest.fn(async (target: string) => {
    const match = new RegExp(
      '^' + origin + '/mzwchapter/' + bookId + '_(\\d+)/$',
    ).exec(target);
    if (!match) throw new Error('非法分页 ' + target);
    return catalog(bookId, Number(match[1]), total).html;
  });
  const result = await expandRecognizedCatalog(first, fetchPage);
  const expected = Array.from(
    { length: total },
    (_, index) => catalog(bookId, index + 1, total).chapterUrls,
  ).flat();
  expect(result.chapters.map(chapter => chapter.url)).toEqual(expected);
  expect(fetchPage).toHaveBeenCalledTimes(total - 1);
  expect(new Set(result.chapters.map(chapter => chapter.url)).size).toBe(
    total * 6,
  );
});
