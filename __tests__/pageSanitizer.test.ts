import { JSDOM } from 'jsdom';
import { PAGE_SANITIZER_JS } from '../src/services/browserFetch/pageSanitizer';

// 执行真正送给 WKWebView 的脚本，在 DOM 上断言效果与保留内容，避免只测规则常量。
let dom: JSDOM;
function page(html: string, url = 'https://www.bqquge.org/19') {
  dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  return dom.window.document;
}
function install() {
  dom.window.eval(PAGE_SANITIZER_JS);
}
function hidden(id: string) {
  return !!dom.window.document.getElementById(id)?.closest('[data-nvl-hidden]');
}
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 220));
}
afterEach(() => {
  dom?.window.close();
});

it('隐藏无标记图片外链和广告 frame，保留搜索、封面、目录、正文', () => {
  const doc = page(`
    <form id="search" action="/so/"><input name="q"><button>搜索</button></form>
    <div id="cover" class="cover"><img src="https://cdn.test/book.jpg"></div>
    <a id="recommend" href="/2"><img src="/files/cover/2.jpg"></a>
    <div id="banner"><a href="https://random-ad.test"><img src="https://random-cdn.test/banner.gif"></a></div>
    <iframe id="frame" src="/random-frame"></iframe>
    <a id="chapter" href="/19/100">第1章 赚钱与下载APP</a>
    <article id="body">他看到了成人视频广告，转身离开。这是书籍正文。</article>
    <a id="normal" href="/so/小说">搜书</a>`);
  install();
  expect(hidden('banner')).toBe(true);
  expect(hidden('frame')).toBe(true);
  for (const id of [
    'search',
    'cover',
    'recommend',
    'chapter',
    'body',
    'normal',
  ])
    expect(hidden(id)).toBe(false);
  expect(doc.querySelector('#chapter')?.getAttribute('href')).toBe('/19/100');
  expect(doc.querySelectorAll('a[href]')).toHaveLength(4);
});

it('站内中转宽幅图也隐藏，横向 Logo 和 CDN 封面保留', () => {
  const doc = page(
    `<a id="banner" href="/go"><img id="wide" src="/random.gif"></a><img id="logo" src="/images/logo.png"><img id="cover" src="https://cdn.test/cover/19.jpg">`,
  );
  for (const id of ['wide', 'logo', 'cover'])
    Object.defineProperty(doc.getElementById(id), 'getBoundingClientRect', {
      value: () => ({ width: 360, height: 90 }),
    });
  install();
  expect(hidden('banner')).toBe(true);
  expect(hidden('logo')).toBe(false);
  expect(hidden('cover')).toBe(false);
});

it('隐藏固定背景横幅、透明点击网格和成人短推广，不隐藏导航及验证码', () => {
  page(`<style>.floating{position:fixed;background-image:url(/banner.jpg)}</style>
    <div id="banner" class="floating"></div>
    <div id="grid" style="position:fixed;opacity:0.01;width:10vw;height:8vw;z-index:100"></div>
    <div id="nav" style="position:fixed"><a href="/19/100">下一章</a><button>目录</button></div>
    <a id="adult" href="/go">成人直播 免费观看</a>
    <div class="cf-turnstile" id="challenge"><iframe src="https://challenges.cloudflare.com/widget"></iframe></div>
    <iframe id="captcha" src="https://www.google.com/recaptcha/api2/anchor"></iframe>`);
  install();
  for (const id of ['banner', 'grid', 'adult']) expect(hidden(id)).toBe(true);
  for (const id of ['nav', 'challenge', 'captcha'])
    expect(hidden(id)).toBe(false);
});

it('不能因为容器广告标记、短文字就误伤搜索或章节相邻内容', () => {
  page(`<div class="ad" id="container"><form><input></form><a href="/19/1">第一章</a><a id="ad" href="https://random.test">立即下载APP</a></div>
    <div id="mixed"><img src="/files/cover/19.jpg"><a id="promo" href="https://random.test">免费领取</a></div>`);
  install();
  expect(hidden('container')).toBe(false);
  expect(hidden('mixed')).toBe(false);
  expect(hidden('ad')).toBe(true);
  expect(hidden('promo')).toBe(true);
});

it.each([
  ['https://wap.bookshuku.org/bookinfo/19.html', '/read/19_1.html'],
  ['https://tw.mingzw.net/mzwchapter/19.html', '/miread/19_1.html'],
])('保留 %s 章节与封面，隐藏广告推广', (url, chapter) => {
  page(
    `<a id="chapter" href="${chapter}">第1章 成人直播</a><div class="cover" id="cover"><img src="/image/19.jpg"></div><a id="ad" href="https://ad.test">立即下载APP</a>`,
    url,
  );
  install();
  expect(hidden('chapter')).toBe(false);
  expect(hidden('cover')).toBe(false);
  expect(hidden('ad')).toBe(true);
});

it('通用网页保留普通图片、外部书籍推荐和正常 frame，隐藏明确广告', () => {
  page(
    `<a id="book" href="https://books.test/1"><img src="https://cdn.test/cover/1.jpg"></a><iframe id="embed" src="https://video.test/player"></iframe><a id="ad" href="https://ad.test">立即下载APP</a><img id="image" src="/illustration.jpg">`,
    'https://example.test/',
  );
  install();
  for (const id of ['book', 'embed', 'image']) expect(hidden(id)).toBe(false);
  expect(hidden('ad')).toBe(true);
});

it('新插入、延迟填充及广告脚本重写样式均重新隐藏；重复注入只有一个观察器', async () => {
  const doc = page('<div id="mount"></div>');
  install();
  install();
  doc.getElementById('mount')!.innerHTML =
    '<a id="late" href="https://random.test"></a>';
  await settle();
  doc.getElementById('late')!.innerHTML = '<img src="/unmarked.jpg">';
  await settle();
  expect(hidden('late')).toBe(true);
  const late = doc.getElementById('late') as HTMLElement;
  late.style.setProperty('display', 'block', 'important');
  await settle();
  expect(late.style.display).toBe('none');
  expect(doc.querySelectorAll('#__nvl_clean_style')).toHaveLength(1);
});

it('只清理变动子树；修改单张广告不再次扫描整本长目录', async () => {
  const doc = page(
    `<div id="catalog">${Array.from(
      { length: 1500 },
      (_, i) => `<a href="/19/${i + 1}">第${i + 1}章</a>`,
    ).join('')}</div><img id="late" src="/placeholder">`,
  );
  // 先确定性跑完唯一一次 1.5 秒布局补查，再测广告更新；真实计时在高负载下会串到断言阶段。
  jest.useFakeTimers();
  const timer = jest
    .spyOn(dom.window, 'setTimeout')
    .mockImplementation(
      (handler, delay) =>
        setTimeout(handler as () => void, delay) as unknown as number,
    );
  try {
    install();
    await jest.advanceTimersByTimeAsync(1800);
    const scan = jest.spyOn(doc, 'querySelectorAll');
    doc
      .getElementById('late')!
      .setAttribute('src', 'https://googleadservices.com/banner.gif');
    await jest.advanceTimersByTimeAsync(160);
    expect(hidden('late')).toBe(true);
    expect(scan).not.toHaveBeenCalled();
    expect(doc.querySelectorAll('#catalog a')).toHaveLength(1500);
  } finally {
    timer.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('阻止广告点击和脚本弹窗，正常 target=_blank 章节改为当前页', () => {
  const doc = page(
    '<a id="chapter" href="/19/100" target="_blank">第一章</a><a id="ad" href="https://random.test">广告</a>',
  );
  install();
  expect(dom.window.open('https://random.test')).toBeNull();
  const click = new dom.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  doc.getElementById('ad')!.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect((doc.getElementById('chapter') as HTMLAnchorElement).target).toBe(
    '_self',
  );
});

it('清除笔趣阁注入的底部空白样式，保留站点正常排版样式', () => {
  const doc = page(
    '<style id="cdngkfrp_style_id">body{position:initial !important;min-height:800px !important;padding-bottom:100px !important;}</style><style id="layout">body{color:black}</style>',
  );
  install();
  expect(doc.getElementById('cdngkfrp_style_id')).toBeNull();
  expect(doc.getElementById('layout')).not.toBeNull();
});

it('隐藏随机 class 宽幅空浮层的宿主，覆盖普通 DOM 无法读取的封闭广告', () => {
  const doc = page(
    '<style>.random{position:fixed;bottom:0}</style><div id="host" class="random"></div><div id="small" class="random"></div>',
  );
  const host = doc.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = '<a href="https://random.test"><img src="/adult.jpg"></a>';
  Object.defineProperty(host, 'getBoundingClientRect', {
    value: () => ({ width: 402, height: 121 }),
  });
  Object.defineProperty(doc.getElementById('small'), 'getBoundingClientRect', {
    value: () => ({ width: 32, height: 32 }),
  });
  install();
  expect(host.shadowRoot).toBeNull();
  expect(hidden('host')).toBe(true);
  expect(hidden('small')).toBe(false);
});

it('广告敏感词出现在正常书名封面时仍保留封面', () => {
  page(
    '<a href="/19" id="book"><img alt="成人直播之旅" src="/files/cover/19.jpg"></a>',
  );
  install();
  expect(hidden('book')).toBe(false);
});

it('原本向新窗口提交的站内搜索表单仍在当前页提交', () => {
  const doc = page(
    '<form id="search" action="/search" target="_blank"><input></form>',
  );
  install();
  doc
    .getElementById('search')!
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  expect((doc.getElementById('search') as HTMLFormElement).target).toBe(
    '_self',
  );
  expect(hidden('search')).toBe(false);
});
