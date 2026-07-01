/**
 * 阅读器专属主题（与 App 整体明暗主题独立）
 * 对应设计稿 SwellNovel.dc.html 中的 THEMES / chrome 配置
 */

export type ReaderThemeKey = 'paper' | 'gray' | 'green' | 'night';

export interface ReaderThemeTokens {
  bg: string;
  text: string;
  sub: string;
  hair: string;
  label: string;
}

export const READER_THEMES: Record<ReaderThemeKey, ReaderThemeTokens> = {
  paper: { bg: '#f3ead6', text: '#33302a', sub: '#9a8f76', hair: 'rgba(0,0,0,.1)', label: '米白' },
  gray: { bg: '#e7e5de', text: '#2c2c2a', sub: '#8c8a82', hair: 'rgba(0,0,0,.1)', label: '浅灰' },
  green: { bg: '#d5e2d1', text: '#293227', sub: '#6f7d68', hair: 'rgba(0,0,0,.1)', label: '护眼' },
  night: { bg: '#16191a', text: '#b3b0a7', sub: '#6a6f6c', hair: 'rgba(255,255,255,.12)', label: '夜间' },
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

export const FONT_SIZES = [16, 18, 20, 22, 25];
export const LINE_HEIGHTS = [1.6, 1.85, 2.15];
export const PARA_GAPS = [14, 18, 22];

export function getReaderChrome(themeKey: ReaderThemeKey): ReaderChromeTokens {
  return themeKey === 'night' ? CHROME_NIGHT : CHROME_DAY;
}

/** 书脊/封面渐变的纯色近似（RN 无内建 CSS 渐变，取深色端）*/
export const COVER_PALETTES = [
  { solid: '#a8823f', ink: '#2a2013' },
  { solid: '#28453f', ink: '#e7efe9' },
  { solid: '#5c4132', ink: '#f0e6dc' },
  { solid: '#374a5f', ink: '#e2e9f0' },
  { solid: '#6a4444', ink: '#f2e3e3' },
  { solid: '#465435', ink: '#e9efdd' },
];

export function paletteForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}
