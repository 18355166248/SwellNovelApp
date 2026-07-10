/**
 * 阅读字体目录：系统预设 + 可远程下载字体。平台无关的纯数据 + 取值辅助。
 *
 * - system：使用各平台自带字体族；“系统默认”显式映射到平台默认族。
 * - remote：运行时下载 TTF 并注册（Web 用 FontFace，原生用 ReaderFontLoader），
 *   注册后以 remote.family 引用。见 services/fonts/fontManager。
 */

export interface FontDef {
  key: string;
  label: string;
  kind: 'system' | 'remote';
  /** 系统预设各平台字体族；缺省表示用平台默认字体。 */
  system?: { ios?: string; android?: string; web?: string };
  /** 远程字体：支持直接 TTF/OTF，或从 ZIP 中解出指定字体文件。 */
  remote?: {
    family: string;
    url: string;
    sizeMB?: number;
    fileExtension?: 'ttf' | 'otf';
    archiveEntry?: string;
  };
}

/** 默认字体：与旧行为一致（衬线宋体）。 */
export const DEFAULT_FONT_KEY = 'serif';

export const FONTS: FontDef[] = [
  {
    key: 'serif',
    label: '宋体',
    kind: 'system',
    system: {
      // Fabric 对字体族静默回退，使用 iOS 的精确 PostScript 名称更可靠。
      ios: 'STSongti-SC-Regular',
      android: 'serif',
      web: "'Noto Serif SC', 'Songti SC', serif",
    },
  },
  {
    key: 'kai',
    label: '楷体',
    kind: 'remote',
    // iOS 的系统楷体属于可选字体，未安装时会静默回退成宋体；使用开源文楷
    // 保证 iOS/Android 都能得到稳定且明显不同的楷体效果。
    remote: {
      family: 'LXGWWenKaiLite',
      url: 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@main/fonts/TTF/LXGWWenKaiLite-Regular.ttf',
      sizeMB: 13,
    },
  },
  {
    key: 'fangsong',
    label: '仿宋',
    kind: 'remote',
    remote: {
      family: 'ZhuqueFangsong-Regular',
      url: 'https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip',
      sizeMB: 6,
      archiveEntry: 'ZhuqueFangsong-Regular.ttf',
    },
  },
  {
    key: 'sourcehanserif',
    label: '思源宋体',
    kind: 'remote',
    remote: {
      family: 'SourceHanSerifCN-Regular',
      url: 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/2.003R/SubsetOTF/CN/SourceHanSerifCN-Regular.otf',
      sizeMB: 12,
      fileExtension: 'otf',
    },
  },
  {
    key: 'hei',
    label: '黑体',
    kind: 'system',
    system: {
      ios: 'STHeitiSC-Light',
      android: 'sans-serif',
      web: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
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
];

export function getFontDef(key?: string): FontDef {
  // 兼容旧设置：移除“系统默认”后回到宋体，原 Lite 档合并到新的楷体档。
  const migratedKey =
    key === 'system' ? DEFAULT_FONT_KEY : key === 'lxgwlite' ? 'kai' : key;
  return (
    FONTS.find(f => f.key === migratedKey) ||
    FONTS.find(f => f.key === DEFAULT_FONT_KEY)!
  );
}
