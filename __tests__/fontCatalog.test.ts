import {
  DEFAULT_FONT_KEY,
  FONTS,
  getFontDef,
} from '../src/theme/fontCatalog';

describe('fontCatalog', () => {
  it('不再展示系统默认与重复的 Lite 字体档', () => {
    expect(FONTS.map(font => font.key)).toEqual([
      'serif',
      'kai',
      'fangsong',
      'sourcehanserif',
      'hei',
      'lxgw',
    ]);
  });

  it('把旧字体设置迁移到仍然有效的档位', () => {
    expect(getFontDef('system').key).toBe(DEFAULT_FONT_KEY);
    expect(getFontDef('lxgwlite').key).toBe('kai');
  });

  it('楷体使用可下载字体，避免系统字体缺失后回退宋体', () => {
    const kai = getFontDef('kai');
    expect(kai.kind).toBe('remote');
    expect(kai.remote?.family).toBe('LXGWWenKaiLite');
  });

  it('仿宋从官方 ZIP 解压，思源宋体使用官方 OTF', () => {
    expect(getFontDef('fangsong').remote?.archiveEntry).toBe(
      'ZhuqueFangsong-Regular.ttf',
    );
    expect(getFontDef('sourcehanserif').remote?.fileExtension).toBe('otf');
  });
});
