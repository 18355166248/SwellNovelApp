import { searchNovels } from '../src/services/search/novelSearch';
import { searchNovels as searchNovelsWeb } from '../src/services/search/novelSearch.web';
import { fetchHtml } from '../src/services/http/fetchHtml';
import { searchSourceCatalogs } from '../src/services/discover/sourceRecommendations';

const { Buffer } = require('buffer');

jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));
jest.mock('../src/services/discover/sourceRecommendations', () => ({
  searchSourceCatalogs: jest.fn(),
}));

const mockFetch = fetchHtml as jest.MockedFunction<typeof fetchHtml>;
const mockCatalog = searchSourceCatalogs as jest.MockedFunction<
  typeof searchSourceCatalogs
>;
const mingzwUrl = 'https://tw.mingzw.net/mzwbook/17482.html';
const verifiedBook = {
  url: mingzwUrl,
  title: '凡人修仙传',
  author: '忘语',
  sourceName: '明智屋中文网',
};
const ddgHit = (url: string, title: string, author = '') =>
  `<a href='//duckduckgo.com/l/?uddg=${encodeURIComponent(
    url,
  )}&amp;rut=abc' class='external result__a'>${title}</a>` +
  (author ? `<a class='result__snippet'>作者：${author}，小说简介</a>` : '');
const queryFor = (url: string) => new URL(url).searchParams.get('q') ?? '';
const deferred = () => {
  let resolve!: (html: string) => void;
  const promise = new Promise<string>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
};

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue('<html></html>');
  mockCatalog.mockReset().mockResolvedValue([]);
});

describe.each([
  ['原生', searchNovels],
  ['Web', searchNovelsWeb],
])('%s 搜索策略', (_, search) => {
  it('精确已核验书名先展示，同时继续查其他书源，兼容书名号和空格', async () => {
    const onResults = jest.fn();
    mockFetch.mockImplementation(async url =>
      queryFor(url).includes('site:bookshuku.org')
        ? ddgHit('https://www.bookshuku.org/bookinfo/12345.html', '凡人修仙传')
        : '<html></html>',
    );
    const request = search('《凡人 修仙传》', { onResults });
    expect(onResults).toHaveBeenNthCalledWith(1, [verifiedBook]);
    const results = await request;
    expect(results[0]).toEqual(verifiedBook);
    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('书名简称保留已核验结果并继续搜索，不能只显示硬编码书目', async () => {
    mockFetch.mockImplementation(async url =>
      queryFor(url).includes('site:mingzw.net')
        ? ddgHit(
            'https://www.mingzw.net/mzwbook/12345.html',
            '凡人修仙传之仙界篇',
          )
        : '<html></html>',
    );
    const results = await search('凡人');
    expect(results[0]).toEqual(verifiedBook);
    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('每个根域独立查询，允许同书源镜像，过滤无关标题和伪造域名，并去重章节链接', async () => {
    mockFetch.mockImplementation(async url =>
      queryFor(url).includes('site:mingzw.net')
        ? ddgHit('https://tw.mingzw.net/mzwbook/39500.html', '夜无疆') +
          ddgHit('https://www.mingzw.net/mzwread/39500_123.html', '夜无疆') +
          ddgHit('https://www.mingzw.net/mzwbook/99999.html', '无关小说') +
          ddgHit(
            'https://www.mingzw.net.fake.test/mzwbook/67890.html',
            '夜无疆',
          )
        : '<html></html>',
    );
    const results = await search('夜 无疆');
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://tw.mingzw.net/mzwbook/39500.html');
    const queries = mockFetch.mock.calls.map(([url]) => queryFor(url));
    expect(queries.some(query => query.includes('site:bookshuku.org'))).toBe(
      true,
    );
    expect(queries.some(query => query.includes('site:xuanhuange.info'))).toBe(
      true,
    );
    expect(queries.every(query => !query.includes(' OR '))).toBe(true);
  });

  it('引擎已有结果时仍合并书源列表的其他入口，避免只能选失效站点', async () => {
    mockFetch.mockImplementation(async url =>
      queryFor(url).includes('site:mingzw.net')
        ? ddgHit('https://tw.mingzw.net/mzwbook/10001.html', '夜无疆')
        : '<html></html>',
    );
    mockCatalog.mockResolvedValue([
      {
        url: 'http://wap.bookshuku.org/bookinfo/10002.html',
        title: '夜无疆',
        sourceName: 'TXT图书下载网',
      },
    ]);
    expect(await search('夜无疆')).toHaveLength(2);
  });

  it('作者查询只采信明确作者字段，保持同名不同作者的候选可区分', async () => {
    mockFetch.mockImplementation(async url =>
      queryFor(url).includes('site:mingzw.net')
        ? ddgHit('https://tw.mingzw.net/mzwbook/10001.html', '夜无疆', '辰东') +
          ddgHit(
            'https://tw.mingzw.net/mzwbook/10002.html',
            '夜无疆',
            '其他作者',
          ) +
          ddgHit('https://tw.mingzw.net/mzwbook/10003.html', '无关小说')
        : '<html></html>',
    );
    const results = await search('辰东');
    expect(results).toEqual([
      {
        url: 'https://tw.mingzw.net/mzwbook/10001.html',
        title: '夜无疆',
        author: '辰东',
        sourceName: '明智屋中文网',
      },
    ]);
  });

  it('DDG 空结果后解析 Bing 跳转链接，兼容带属性 h2 和单引号', async () => {
    const encoded = Buffer.from(
      'https://www.mingzw.net/mzwbook/10001.html',
    ).toString('base64url');
    mockFetch.mockImplementation(async url =>
      url.includes('bing.com') && queryFor(url).includes('site:mingzw.net')
        ? `<li class='b_algo'><h2 class='title'><a href='https://www.bing.com/ck/a?u=a1${encoded}&amp;ntb=1'>夜无疆</a></h2><p>作者：辰东，小说简介</p></li>`
        : '<html></html>',
    );
    expect(await search('夜无疆')).toEqual([
      {
        url: 'https://tw.mingzw.net/mzwbook/10001.html',
        title: '夜无疆',
        author: '辰东',
        sourceName: '明智屋中文网',
      },
    ]);
  });

  it('单书源先完成时立即回传结果，其他书源失败不丢失有效候选', async () => {
    const pending = deferred();
    mockFetch.mockImplementation(url => {
      if (queryFor(url).includes('site:mingzw.net'))
        return Promise.resolve(
          ddgHit('https://tw.mingzw.net/mzwbook/10001.html', '夜无疆'),
        );
      return pending.promise;
    });
    const onResults = jest.fn();
    const result = search('夜无疆', { onResults });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onResults).toHaveBeenCalledWith([
      expect.objectContaining({ title: '夜无疆' }),
    ]);
    pending.resolve('<html></html>');
    await expect(result).resolves.toHaveLength(1);
    expect(mockCatalog).toHaveBeenCalledTimes(1);
  });

  it('输入变更后不回传旧结果，也不继续后备引擎或书库请求', async () => {
    const pending = deferred();
    mockFetch.mockReturnValue(pending.promise);
    let cancelled = false;
    const onResults = jest.fn();
    const result = search('夜无疆', {
      onResults,
      isCancelled: () => cancelled,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    cancelled = true;
    pending.resolve(
      ddgHit('https://tw.mingzw.net/mzwbook/10001.html', '夜无疆'),
    );
    await expect(result).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(onResults).not.toHaveBeenCalled();
    expect(mockCatalog).toHaveBeenCalledTimes(1);
  });

  it('搜索请求卡住有总等待上限，迟到结果不能替换已完成结果', async () => {
    jest.useFakeTimers();
    try {
      const pending = deferred();
      mockFetch.mockReturnValue(pending.promise);
      mockCatalog.mockResolvedValue([
        {
          url: 'http://wap.bookshuku.org/bookinfo/10001.html',
          title: '夜无疆',
          author: '辰东',
          sourceName: 'TXT图书下载网',
        },
      ]);
      const onResults = jest.fn();
      const result = search('夜无疆', { onResults });
      await jest.advanceTimersByTimeAsync(8000);
      await expect(result).resolves.toHaveLength(1);
      const calls = onResults.mock.calls.length;
      pending.resolve(
        ddgHit('https://tw.mingzw.net/mzwbook/10001.html', '夜无疆'),
      );
      await Promise.resolve();
      expect(onResults).toHaveBeenCalledTimes(calls);
    } finally {
      jest.useRealTimers();
    }
  });

  it('引擎和书源全部失败时返回可重试错误，不能误报无匹配', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    mockCatalog.mockRejectedValue(new Error('offline'));
    await expect(search('夜无疆')).rejects.toThrow('搜索服务暂时不可用');
  });
});
