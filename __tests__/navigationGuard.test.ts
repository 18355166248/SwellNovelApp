import {
  isSameSiteNavigation,
  shouldBlockAdNavigation,
} from '../src/services/browserFetch/navigationGuard';

describe('browser navigation guard', () => {
  const catalog = 'http://wap.xuanhuange.info/book/1/2.html';

  it('允许同站目录、章节和子域导航', () => {
    expect(
      isSameSiteNavigation(catalog, 'http://wap.xuanhuange.info/read/3.html'),
    ).toBe(true);
    expect(
      isSameSiteNavigation(catalog, 'https://img.wap.xuanhuange.info/a'),
    ).toBe(true);
  });

  it('拦截玄幻阁目录页跳往广告域名', () => {
    expect(
      shouldBlockAdNavigation(catalog, 'https://ad.example.com/click'),
    ).toBe(true);
    expect(
      shouldBlockAdNavigation(
        catalog,
        'http://wap.xuanhuange.info/book/1/3.html',
      ),
    ).toBe(false);
  });
  it('笔趣阁保留同站阅读，拦截跨站广告且不影响通用浏览器', () => {
    const root = 'https://www.bqquge.org/1';
    expect(shouldBlockAdNavigation(root, 'https://ad.example.com/')).toBe(true);
    expect(shouldBlockAdNavigation(root, `${root}100.html`)).toBe(false);
    expect(shouldBlockAdNavigation('https://www.bing.com/', root)).toBe(false);
  });
});
