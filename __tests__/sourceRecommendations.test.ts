import {
  parseBookshukuRecommendations,
  parseMingzwRecommendations,
  parseBqqugeRecommendations,
} from '../src/services/discover/sourceRecommendations';

describe('书源推荐解析', () => {
  it('笔趣阁首页提取真实书名，过滤章节、相似域名与重复卡片', () => {
    expect(
      parseBqqugeRecommendations(
        '<li><p><a href="/1">夜无疆</a></p></li><a href="/1">夜无疆</a><a href="/1/100">第1章</a><a href="https://www.bqquge.org.fake.test/1">广告</a>',
      ),
    ).toEqual([
      {
        url: 'https://www.bqquge.org/1',
        title: '夜无疆',
        sourceName: '笔趣阁（bqquge）',
      },
    ]);
  });
  it('解析书库列表并提取书名、作者和详情页', () => {
    const items = parseBookshukuRecommendations(
      '<li><a href="http://wap.bookshuku.org/bookinfo/132737.html">[玄幻] <b>夜无疆</b><span>/</span>辰东</a></li>',
    );
    expect(items).toEqual([
      {
        url: 'http://wap.bookshuku.org/bookinfo/132737.html',
        title: '夜无疆',
        author: '辰东',
        sourceName: 'TXT图书下载网',
      },
    ]);
  });

  it('仅保留明智屋可加入书架的详情链接并去重', () => {
    const items = parseMingzwRecommendations(
      '<a href="/mibook/26.html">笨蛋美人替嫁后被疯批王爷宠上天</a>' +
        '<a href="/mibook/26.html">笨蛋美人替嫁后被疯批王爷宠上天 阅读&gt;&gt;</a>' +
        '<a href="/mzwbook/17482.html">凡人修仙传</a>',
    );
    expect(items).toEqual([
      {
        url: 'https://www.mingzw.net/mibook/26.html',
        title: '笨蛋美人替嫁后被疯批王爷宠上天',
        sourceName: '明智屋中文网',
      },
      {
        url: 'https://www.mingzw.net/mzwbook/17482.html',
        title: '凡人修仙传',
        sourceName: '明智屋中文网',
      },
    ]);
  });
});

jest.mock('../src/services/http/fetchHtml', () => ({ fetchHtml: jest.fn() }));
import { fetchHtml } from '../src/services/http/fetchHtml';
import { searchSourceCatalogs } from '../src/services/discover/sourceRecommendations';
const mockCatalogFetch = fetchHtml as jest.MockedFunction<typeof fetchHtml>;

describe('书源列表搜索', () => {
  beforeEach(() => mockCatalogFetch.mockReset());

  it('按作者匹配，单个站点失败仍保留有效书目', async () => {
    mockCatalogFetch.mockImplementation(async url => {
      if (url.includes('bookshuku'))
        return '<a href="http://wap.bookshuku.org/bookinfo/132737.html">夜无疆 / 辰东</a>';
      throw new Error('offline');
    });
    await expect(
      searchSourceCatalogs('辰 东', { timeoutMs: 5000 }),
    ).resolves.toEqual([
      {
        url: 'http://wap.bookshuku.org/bookinfo/132737.html',
        title: '夜无疆',
        author: '辰东',
        sourceName: 'TXT图书下载网',
      },
    ]);
  });

  it('所有站点都失败时抛错，成功列表无匹配时返回空', async () => {
    mockCatalogFetch.mockRejectedValue(new Error('offline'));
    await expect(searchSourceCatalogs('未知书名')).rejects.toThrow(
      '书源列表暂时不可用',
    );
    mockCatalogFetch.mockResolvedValue('<html></html>');
    await expect(searchSourceCatalogs('未知书名')).resolves.toEqual([]);
  });
});
