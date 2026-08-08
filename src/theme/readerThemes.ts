/**
 * 阅读器专属主题（与 App 整体明暗主题独立）
 * 对应设计稿 SwellNovel.dc.html 中的 THEMES / chrome 配置
 */

export type ReaderThemeKey =
  | 'paper'
  | 'gray'
  | 'green'
  | 'lake'
  | 'cosmos'
  | 'bamboo'
  | 'sunset'
  | 'night';
export type ReaderNightThemeKey = 'night' | 'cosmos';
export type ReaderDayThemeKey = Exclude<ReaderThemeKey, ReaderNightThemeKey>;

export function isReaderNightTheme(
  theme: ReaderThemeKey,
): theme is ReaderNightThemeKey {
  return theme === 'night' || theme === 'cosmos';
}

/**
 * 阅读背景切换状态机：进入夜间前保留当前日间背景，退出时才能恢复用户原选择。
 * 旧版设置没有 dayTheme 时回退米白，保证历史数据仍可直接读取。
 */
export function resolveReaderThemeChange(
  currentTheme: ReaderThemeKey,
  dayTheme: ReaderDayThemeKey | undefined,
  nextTheme: ReaderThemeKey,
): { theme: ReaderThemeKey; dayTheme: ReaderDayThemeKey } {
  if (!isReaderNightTheme(nextTheme)) {
    return { theme: nextTheme, dayTheme: nextTheme };
  }
  return {
    theme: nextTheme,
    dayTheme: isReaderNightTheme(currentTheme)
      ? dayTheme ?? 'paper'
      : currentTheme,
  };
}

export interface ReaderThemeTokens {
  bg: string;
  text: string;
  sub: string;
  hair: string;
  label: string;
  category: 'solid' | 'scenic';
}

export const READER_THEMES: Record<ReaderThemeKey, ReaderThemeTokens> = {
  paper: {
    bg: '#f3ead6',
    text: '#33302a',
    sub: '#9a8f76',
    hair: 'rgba(0,0,0,.1)',
    label: '米白',
    category: 'solid',
  },
  gray: {
    bg: '#e7e5de',
    text: '#2c2c2a',
    sub: '#8c8a82',
    hair: 'rgba(0,0,0,.1)',
    label: '浅灰',
    category: 'solid',
  },
  green: {
    bg: '#d5e2d1',
    text: '#293227',
    sub: '#6f7d68',
    hair: 'rgba(0,0,0,.1)',
    label: '护眼',
    category: 'solid',
  },
  lake: {
    bg: '#eef5ef',
    text: '#27443c',
    sub: '#718a80',
    hair: 'rgba(39,68,60,.12)',
    label: '一叶漾波',
    category: 'scenic',
  },
  cosmos: {
    bg: '#0b0d0e',
    text: '#b9bab7',
    sub: '#747977',
    hair: 'rgba(255,255,255,.12)',
    label: '星河苍穹',
    category: 'scenic',
  },
  bamboo: {
    bg: '#f1f5f4',
    text: '#254750',
    sub: '#71868b',
    hair: 'rgba(37,71,80,.12)',
    label: '清筠扫壁',
    category: 'scenic',
  },
  sunset: {
    bg: '#faf7f0',
    text: '#315252',
    sub: '#8a877c',
    hair: 'rgba(49,82,82,.12)',
    label: '长河落日',
    category: 'scenic',
  },
  night: {
    bg: '#16191a',
    text: '#b3b0a7',
    sub: '#6a6f6c',
    hair: 'rgba(255,255,255,.12)',
    label: '夜间',
    category: 'solid',
  },
};

export interface ReaderChromeTokens {
  bg: string;
  ink: string;
  hair: string;
  sheetBg: string;
  sheetInk: string;
  sheetSub: string;
  field: string;
}

const CHROME_DAY: ReaderChromeTokens = {
  bg: 'rgba(250,248,242,.97)',
  ink: '#33302a',
  hair: 'rgba(0,0,0,.09)',
  sheetBg: '#faf8f2',
  sheetInk: '#33302a',
  sheetSub: '#8a8578',
  field: 'rgba(0,0,0,.05)',
};

const CHROME_NIGHT: ReaderChromeTokens = {
  bg: 'rgba(30,34,35,.97)',
  ink: '#d8d5cc',
  hair: 'rgba(255,255,255,.1)',
  sheetBg: '#22272a',
  sheetInk: '#d8d5cc',
  sheetSub: '#8b908c',
  field: 'rgba(255,255,255,.06)',
};

// 字号按 1px 连续步进，加减逐档不跳（16…40）。
export const FONT_SIZES = Array.from(
  { length: 40 - 16 + 1 },
  (_, i) => 16 + i,
);
export const LINE_HEIGHTS = [1.6, 1.85, 2.15];
export const PARA_GAPS = [14, 18, 22];

/** 设计稿阅读器/书架共用强调色 */
export const NOVEL_ACCENT = '#2e6b5e';
export const NOVEL_GOLD = '#c9a15e';
export const NOVEL_DANGER = '#c25a3a';

/** 设计稿公共渐变 */
export const DETAIL_HERO_GRADIENT: string[] = ['#264a44', '#1a3330'];
export const CONTINUE_CARD_GRADIENT: string[] = ['#1f3d3a', '#2c5049'];
export const CONTINUE_CARD_GRADIENT_DIRECTION = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const DRAWER_WIDTH = '80%';

export function getReaderChrome(themeKey: ReaderThemeKey): ReaderChromeTokens {
  return isReaderNightTheme(themeKey) ? CHROME_NIGHT : CHROME_DAY;
}

/** 书脊/封面渐变色板（对应设计稿 linear-gradient(160deg, from, to)）*/
export const COVER_PALETTES = [
  { from: '#c9a15e', to: '#8a6b34', ink: '#2a2013' },
  { from: '#3a5c56', to: '#1f3d3a', ink: '#e7efe9' },
  { from: '#7d5a48', to: '#4a3527', ink: '#f0e6dc' },
  { from: '#4a5a6e', to: '#2f4257', ink: '#e2e9f0' },
  { from: '#8a5a5a', to: '#573434', ink: '#f2e3e3' },
  { from: '#5a6b45', to: '#374528', ink: '#e9efdd' },
];

/** 设计稿 160deg 渐变对应的 RN start/end 向量 */
export const COVER_GRADIENT_DIRECTION = {
  start: { x: 0.15, y: 0 },
  end: { x: 0.85, y: 1 },
} as const;

export function paletteForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
  }
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}
