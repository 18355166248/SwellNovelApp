import {
  isSameSiteNavigation,
  isRequestedBrowserNavigation,
  shouldBlockAdNavigation,
} from '../src/services/browserFetch/navigationGuard';

describe('browser navigation guard', () => {
  const catalog = 'http://wap.bookshuku.org/book/1/2.html';

  it('允许同站目录、章节和子域导航', () => {
    expect(
      isSameSiteNavigation(catalog, 'http://wap.bookshuku.org/read/3.html'),
    ).toBe(true);
    expect(
      isSameSiteNavigation(catalog, 'https://img.wap.bookshuku.org/a'),
    ).toBe(true);
  });

  it('拦截已适配站点目录页跳往广告域名', () => {
    expect(
      shouldBlockAdNavigation(catalog, 'https://ad.example.com/click'),
    ).toBe(true);
    expect(
      shouldBlockAdNavigation(
        catalog,
        'http://wap.bookshuku.org/book/1/3.html',
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

it.each(['bookshuku.org', 'mingzw.net', 'bqquge.org'])(
  '%s 首页/搜索结果拦截外域广告，允许移动/桌面/镜像与协议切换',
  root => {
    const home = `http://wap.${root}/`;
    expect(shouldBlockAdNavigation(home, 'https://qdfg039.com:118/')).toBe(
      true,
    );
    expect(
      shouldBlockAdNavigation(home, `https://www.${root}/search.html`),
    ).toBe(false);
    expect(shouldBlockAdNavigation(home, `https://tw.${root}/book/19`)).toBe(
      false,
    );
    expect(
      shouldBlockAdNavigation(home, `https://${root}.evil.test/book/19`),
    ).toBe(true);
  },
);

it('地址栏授权只对应提交的网址，不放行加载期间的广告跳转', () => {
  const target = 'https://www.bqquge.org';
  expect(isRequestedBrowserNavigation(target, `${target}/`)).toBe(true);
  expect(isRequestedBrowserNavigation(target, 'https://ad.test/')).toBe(false);
  expect(isRequestedBrowserNavigation('', target)).toBe(false);
});

it.each([
  'intent://ad#Intent;end',
  'itms-services://ad',
  // eslint-disable-next-line no-script-url
  'javascript:alert(1)',
  'file:///tmp/ad.html',
  'data:text/html,ad',
])('禁止网页通过非网页协议跳转：%s', target => {
  expect(shouldBlockAdNavigation('https://www.bqquge.org/19', target)).toBe(
    true,
  );
  expect(shouldBlockAdNavigation('https://example.test/', target)).toBe(true);
});

it('验证组件的 about:blank 不视为外部 App 跳转', () => {
  expect(
    shouldBlockAdNavigation('https://www.bqquge.org/19', 'about:blank'),
  ).toBe(false);
});
