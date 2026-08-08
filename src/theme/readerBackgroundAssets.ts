import type { ImageSourcePropType } from 'react-native';
import type { ReaderThemeKey } from './readerThemes';

/**
 * 意境背景使用独立位图，正文仍由阅读器原生排版覆盖在上层。
 * 映射与主题 token 分离，避免状态层/Jest 在读取纯配色时加载大图资源。
 */
export const READER_BACKGROUND_ARTWORK: Partial<
  Record<ReaderThemeKey, ImageSourcePropType>
> = {
  lake: require('../assets/reader-backgrounds/lake-ripple.jpg'),
  cosmos: require('../assets/reader-backgrounds/cosmic-night-v1.jpg'),
  bamboo: require('../assets/reader-backgrounds/bamboo-wall-v4.jpg'),
  sunset: require('../assets/reader-backgrounds/river-sunset-v4.jpg'),
};

/**
 * 透明边缘装饰单独覆盖在翻页容器上方。FlatList 的原生分页单元可能遮住底层背景图，
 * 因此这里只保留右上角或底部的透明素材，既保证可见，也不改变正文底色和对比度。
 */
export const READER_BACKGROUND_DECORATION: Partial<
  Record<ReaderThemeKey, ImageSourcePropType>
> = {
  bamboo: require('../assets/reader-backgrounds/bamboo-corner-v1.png'),
  sunset: require('../assets/reader-backgrounds/sunset-river-v1.png'),
};

/**
 * 浓度直接映射到图片透明度：0 完全隐藏、0.5 半透明、1 保留原图强度。
 * 不再针对个别主题额外放大，避免滑杆中段就饱和、后半段看不出变化。
 */
export function getReaderArtworkOpacity(
  _theme: ReaderThemeKey,
  intensity: number,
): number {
  return Math.max(0, Math.min(1, intensity));
}
