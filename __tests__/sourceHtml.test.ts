import {
  decodeEntities,
  matchOne,
  stripTags,
  toAbsolute,
} from '../src/services/source/html';

describe('source/html', () => {
  it('decodeEntities 解码命名/数字实体', () => {
    expect(decodeEntities('a&nbsp;b&amp;c&#39;d&#x41;')).toBe('a b&c\'dA');
  });

  it('stripTags 去除标签', () => {
    expect(stripTags('<p>你好<br/>世界</p>')).toBe('你好世界');
  });

  it('matchOne 取第一个捕获组', () => {
    expect(matchOne(/<b>(.*?)<\/b>/, 'x<b>书名</b>y')).toBe('书名');
    expect(matchOne(/<b>(.*?)<\/b>/, 'no match')).toBeUndefined();
  });

  it('toAbsolute 把相对/绝对 href 归一化', () => {
    const base = 'http://wap.bookshuku.org/read/160297.html';
    expect(toAbsolute(base, '/read/160297_1.html')).toBe(
      'http://wap.bookshuku.org/read/160297_1.html',
    );
    expect(toAbsolute(base, 'http://img.x.org/a.jpg')).toBe(
      'http://img.x.org/a.jpg',
    );
  });
});
