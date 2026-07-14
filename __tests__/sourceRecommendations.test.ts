import {
  parseBookshukuRecommendations,
  parseMingzwRecommendations,
} from '../src/services/discover/sourceRecommendations';

describe('书源推荐解析', () => {
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
        '<a href="/mibook/26.html">笨蛋美人替嫁后被疯批王爷宠上天 阅读&gt;&gt;</a>',
    );
    expect(items).toEqual([
      {
        url: 'https://www.mingzw.net/mibook/26.html',
        title: '笨蛋美人替嫁后被疯批王爷宠上天',
        sourceName: '明智屋中文网',
      },
    ]);
  });
});
