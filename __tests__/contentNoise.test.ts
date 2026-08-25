import {
  isNoiseLine,
  stripContentNoise,
  stripNoiseFragments,
} from '../src/services/source/contentNoise';

describe('正文噪声清理', () => {
  it('删除玄幻阁在正文里插的翻页提示与域名水印', () => {
    // 用户实际读到的《道诡异仙》第一章尾部。
    const raw = [
      '他睁开眼，看见白色的墙。',
      '(本章未完, 请点击下一页继续阅读)',
      '最新网址:wap.xuanhuange.info',
    ].join('\n');
    expect(stripContentNoise(raw)).toBe('他睁开眼，看见白色的墙。');
  });

  it('翻页提示的括号、逗号、全半角各种写法都能命中', () => {
    const variants = [
      '(本章未完, 请点击下一页继续阅读)',
      '（本章未完，请点击下一页继续阅读）',
      '(本章未完，请点击下一页继续阅读)',
      '【本章未完，点击下一页继续阅读】',
      '本章未完，请点击下一页继续阅读',
    ];
    for (const variant of variants) {
      expect(stripContentNoise(`正文一段。\n${variant}\n正文二段。`)).toBe(
        '正文一段。\n正文二段。',
      );
    }
  });

  it('翻页提示紧跟在正文末尾时只删提示，保留同一行的正文', () => {
    expect(
      stripNoiseFragments('他猛地回头。(本章未完, 请点击下一页继续阅读)').trim(),
    ).toBe('他猛地回头。');
  });

  it('域名水印的常见措辞都能整行删除', () => {
    for (const line of [
      '最新网址:wap.xuanhuange.info',
      '最新网址：www.example.com',
      '本站最新地址:abc.top',
      '记住本站网址：xyz.cc',
      '天才一秒记住本站地址',
      '手机版阅读网址：m.example.net',
      'wap.xuanhuange.info',
      'http://wap.xuanhuange.info/read/170446/',
    ]) {
      expect(isNoiseLine(line)).toBe(true);
    }
  });

  it('分页页码标记连同包裹的括号一起去掉', () => {
    expect(stripContentNoise('正文。(第1/3页)')).toBe('正文。');
    expect(stripContentNoise('正文。第 2 / 3 页')).toBe('正文。');
  });

  it('不误删正常正文，长段落即使含相似词也保留', () => {
    const lines = [
      '他说：“记住，本站着火了。”',
      '这本书最新的一章他还没看。',
      '她翻到下一页，继续读了下去。',
      '第三页纸被撕掉了。',
    ];
    expect(stripContentNoise(lines.join('\n'))).toBe(lines.join('\n'));
    for (const line of lines) {
      expect(isNoiseLine(line)).toBe(false);
    }
  });

  it('超长行不按整行规则删除，避免整段正文被误伤', () => {
    const long = `最新网址:${'某个很长的正文内容'.repeat(12)}`;
    expect(long.length).toBeGreaterThan(80);
    expect(isNoiseLine(long)).toBe(false);
  });

  it('清理后留下的空行被一并去掉', () => {
    const raw = '第一段。\n(本章未完, 请点击下一页继续阅读)\n\n第二段。';
    expect(stripContentNoise(raw)).toBe('第一段。\n第二段。');
  });

  it('纯正文反复清理结果稳定，不会越洗越短', () => {
    const text = '他睁开眼，看见白色的墙。\n第三页纸被撕掉了。';
    expect(stripContentNoise(stripContentNoise(text))).toBe(text);
  });
});
