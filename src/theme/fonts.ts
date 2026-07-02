import { Platform } from 'react-native';

/**
 * 衬线字体族（对应设计稿 Noto Serif SC）
 * - iOS 没有 'serif' 通用字体族，直接写会静默回退到系统无衬线字体，
 *   这里用系统自带的宋体「Songti SC」近似
 * - Android 的 'serif' 映射到 Noto Serif CJK
 * - Web（react-native-web）走 CSS 通用族回退链
 */
export const SERIF_FONT = Platform.select({
  ios: 'Songti SC',
  android: 'serif',
  default: "'Noto Serif SC', 'Songti SC', serif",
});
