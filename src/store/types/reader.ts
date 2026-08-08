/**
 * 阅读器相关类型定义
 */

import {
  ReaderDayThemeKey,
  ReaderThemeKey,
} from '../../theme/readerThemes';

export interface ReaderSettings {
  theme: ReaderThemeKey; // 阅读背景主题：素色与意境背景共用同一主题状态机
  dayTheme?: ReaderDayThemeKey; // 最近一次日间背景；退出夜间模式时恢复。可选以兼容旧版持久化数据。
  backgroundOpacity?: number; // 意境背景浓度 0..1；旧数据缺省时使用 0.45。
  fontSizeIndex: number; // 字号档位，索引对应 theme/readerThemes.ts 中的 FONT_SIZES
  lineHeightIndex: number; // 行间距档位：紧凑/适中/宽松
  pageMode: 'scroll' | 'page'; // 翻页方式：上下滚动 / 左右翻页
  brightness?: number; // 阅读亮度覆盖 0..1；undefined 表示跟随系统（不覆盖）。仅原生生效。
  fullscreen?: boolean; // 全屏/沉浸偏好：Web 隐藏浏览器 chrome，原生隐藏状态栏。持久化后自动恢复。
  fontKey?: string; // 阅读字体档位，对应 theme/fontCatalog.ts 的 FONTS；缺省用默认宋体。
}

export interface ReaderState {
  currentBookId: string | null;
  currentChapterId: string | null;
  scrollPosition: number; // 滚动位置
  isToolbarVisible: boolean; // 工具栏是否显示
  isFullScreen: boolean; // 是否全屏
}
