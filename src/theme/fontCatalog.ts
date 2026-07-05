/**
 * 阅读字体目录：系统预设 + 可远程下载字体。平台无关的纯数据 + 取值辅助。
 *
 * - system：用各平台自带字体族（'system' 档为 undefined，走平台默认）。
 * - remote：运行时下载 TTF 并注册（Web 用 FontFace，原生用 expo-font），
 *   注册后以 remote.family 引用。见 services/fonts/fontManager。
 */

export interface FontDef {
  key: string;
  label: string;
  kind: 'system' | 'remote';
  /** 系统预设各平台字体族；缺省表示用平台默认字体。 */
  system?: { ios?: string; android?: string; web?: string };
  /** 远程字体：注册用 family + TTF 下载地址（+ 体积提示，MB）。 */
  remote?: { family: string; url: string; sizeMB?: number };
}

/** 默认字体：与旧行为一致（衬线宋体）。 */
export const DEFAULT_FONT_KEY = 'serif';

export const FONTS: FontDef[] = [
  { key: 'system', label: '系统默认', kind: 'system' },
  {
    key: 'serif',
    label: '宋体',
    kind: 'system',
    system: {
      ios: 'Songti SC',
      android: 'serif',
      web: "'Noto Serif SC', 'Songti SC', serif",
    },
  },
  {
    key: 'hei',
    label: '黑体',
    kind: 'system',
    system: {
      ios: 'Heiti SC',
      android: 'sans-serif',
      web: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
  },
  {
    key: 'kai',
    label: '楷体',
    kind: 'system',
    system: { ios: 'Kaiti SC', android: 'serif', web: "'Kaiti SC', 'KaiTi', serif" },
  },
  {
    key: 'lxgw',
    label: '霞鹜文楷',
    kind: 'remote',
    remote: {
      family: 'LXGWWenKai',
      url: 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai@v1.510/fonts/TTF/LXGWWenKai-Regular.ttf',
      sizeMB: 19,
    },
  },
  {
    key: 'lxgwlite',
    label: '霞鹜文楷 Lite',
    kind: 'remote',
    remote: {
      family: 'LXGWWenKaiLite',
      url: 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@main/fonts/TTF/LXGWWenKaiLite-Regular.ttf',
      sizeMB: 9,
    },
  },
];

export function getFontDef(key?: string): FontDef {
  return (
    FONTS.find(f => f.key === key) ||
    FONTS.find(f => f.key === DEFAULT_FONT_KEY)!
  );
}
