/**
 * 阅读器相关类型定义
 */

import { ReaderThemeKey } from '../../theme/readerThemes';

export interface ReaderSettings {
  theme: ReaderThemeKey; // 阅读背景主题：米白/浅灰/护眼/夜间
  fontSizeIndex: number; // 字号档位，索引对应 theme/readerThemes.ts 中的 FONT_SIZES
  lineHeightIndex: number; // 行间距档位：紧凑/适中/宽松
  pageMode: 'scroll' | 'page'; // 翻页方式：上下滚动 / 左右翻页
}

export interface ReaderState {
  currentBookId: string | null;
  currentChapterId: string | null;
  scrollPosition: number; // 滚动位置
  isToolbarVisible: boolean; // 工具栏是否显示
  isFullScreen: boolean; // 是否全屏
}
