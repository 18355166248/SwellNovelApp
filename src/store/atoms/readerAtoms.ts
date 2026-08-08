/**
 * 阅读器相关的原子状态
 */

import { atom } from 'jotai';
import { ReaderSettings, ReaderState } from '../types/reader';
import {
  FONT_SIZES,
  LINE_HEIGHTS,
  PARA_GAPS,
  READER_THEMES,
  getReaderChrome,
  isReaderNightTheme,
} from '../../theme/readerThemes';

// 默认阅读设置
const defaultReaderSettings: ReaderSettings = {
  theme: 'paper',
  dayTheme: 'paper',
  backgroundOpacity: 0.45,
  // FONT_SIZES 现从 16 起以 1px 步进，索引 4 → 20px（原默认字号）。
  fontSizeIndex: 4,
  lineHeightIndex: 1,
  pageMode: 'page',
};

// 阅读设置
export const readerSettingsAtom = atom<ReaderSettings>(defaultReaderSettings);

// 阅读器状态
export const readerStateAtom = atom<ReaderState>({
  currentBookId: null,
  currentChapterId: null,
  scrollPosition: 0,
  isToolbarVisible: false,
  isFullScreen: false,
});

// 当前章节内容
export const currentChapterContentAtom = atom<string>('');

// 当前章节索引
export const currentChapterIndexAtom = atom<number | null>(null);

// 是否正在加载章节
export const isLoadingChapterAtom = atom<boolean>(false);

// 由阅读设置派生出的展示用 token（背景/文字/行高/字号/工具栏配色）
export const readerDisplayAtom = atom((get) => {
  const s = get(readerSettingsAtom);
  const theme = READER_THEMES[s.theme];
  const chrome = getReaderChrome(s.theme);
  return {
    theme,
    chrome,
    isNight: isReaderNightTheme(s.theme),
    fontSize: FONT_SIZES[s.fontSizeIndex],
    titleSize: FONT_SIZES[s.fontSizeIndex] + 4,
    lineHeight: LINE_HEIGHTS[s.lineHeightIndex],
    paraGap: PARA_GAPS[s.lineHeightIndex],
  };
});
