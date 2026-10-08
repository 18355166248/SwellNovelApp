import React from 'react';
import {
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BookCoverImage } from './BookCoverImage';
import { SERIF_FONT } from '../theme/fonts';

// 主要书源的原图为 300×400 / 360×480，所有入口共用比例，页面只设置宽度。
export const BOOK_COVER_ASPECT_RATIO = 3 / 4;

type Props = {
  id: string;
  uri?: string;
  title: string;
  author?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const BOOK_COVER_ARTWORKS: Array<{
  source: ImageSourcePropType;
  ink: string;
}> = [
  { source: require('../assets/book-covers/cover-lychee.jpg'), ink: '#f2e4cf' },
  {
    source: require('../assets/book-covers/cover-botanical.jpg'),
    ink: '#292822',
  },
  {
    source: require('../assets/book-covers/cover-night-boat.jpg'),
    ink: '#f1e2c7',
  },
  {
    source: require('../assets/book-covers/cover-bookshop.jpg'),
    ink: '#292822',
  },
  {
    source: require('../assets/book-covers/cover-sunset-courtyard.jpg'),
    ink: '#f2dfc8',
  },
  {
    source: require('../assets/book-covers/cover-blue-alley.jpg'),
    ink: '#eee1cb',
  },
];

function coverArtworkForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
  }
  return BOOK_COVER_ARTWORKS[hash % BOOK_COVER_ARTWORKS.length];
}

function isShortChineseText(value: string) {
  const characters = Array.from(value.trim());
  return (
    characters.length > 0 &&
    characters.length <= 8 &&
    characters.filter(character => /[\u3400-\u9fff]/.test(character)).length /
      characters.length >=
      0.7
  );
}

function verticalCoverText(value: string) {
  return isShortChineseText(value)
    ? Array.from(value.trim()).join('\n')
    : value;
}

/** 书籍封面的唯一入口：定制底图、完整原图、异比例模糊背景和坏链回退统一维护。 */
export function BookCover({
  id,
  uri,
  title,
  author,
  compact = false,
  style,
}: Props) {
  const artwork = coverArtworkForId(id);
  const [width, setWidth] = React.useState(96);
  const vertical = !compact && isShortChineseText(title);
  // 竖排标题按实际封面高度缩字号，详情页和三列书架的可用空间不同，不能沿用固定字号。
  const titleSize = compact
    ? 10
    : vertical
    ? Math.max(
        8,
        Math.min(
          17,
          Math.floor(
            (width / BOOK_COVER_ASPECT_RATIO - 20) /
              Array.from(title.trim()).length,
          ) - 3,
        ),
      )
    : 15;
  return (
    <View
      style={[styles.frame, style]}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title}封面`}
      onLayout={
        compact
          ? undefined
          : ({ nativeEvent }) => {
              const nextWidth = nativeEvent.layout.width;
              if (nextWidth > 0) setWidth(nextWidth);
            }
      }
    >
      <ImageBackground
        source={artwork.source}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      >
        <View
          style={[
            styles.titleLayer,
            vertical && styles.verticalLayer,
            compact && styles.compactLayer,
          ]}
        >
          <Text
            numberOfLines={vertical ? 8 : 3}
            maxFontSizeMultiplier={1}
            style={[
              styles.title,
              {
                color: artwork.ink,
                fontSize: titleSize,
                lineHeight: titleSize + 3,
              },
            ]}
          >
            {vertical ? verticalCoverText(title) : title}
          </Text>
          {!compact && !!author && (
            <Text
              numberOfLines={5}
              maxFontSizeMultiplier={1}
              style={[
                styles.author,
                vertical && styles.verticalAuthor,
                { color: artwork.ink },
              ]}
            >
              {vertical
                ? verticalCoverText(
                    author === '本地导入' ? author : `${author}著`,
                  )
                : author}
            </Text>
          )}
        </View>
        {/* 定制图始终在下层，网络图片缺失或失败时立即露出，不需要各页面重复处理。 */}
        <BookCoverImage uri={uri} title={title} />
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: BOOK_COVER_ASPECT_RATIO,
    borderRadius: 7,
    overflow: 'hidden',
  },
  titleLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  verticalLayer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 7,
  },
  compactLayer: { paddingHorizontal: 5, paddingVertical: 6 },
  title: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  author: {
    fontFamily: SERIF_FONT,
    fontSize: 9,
    lineHeight: 11,
    marginTop: 6,
    opacity: 0.82,
    textAlign: 'center',
  },
  verticalAuthor: { alignSelf: 'flex-end', marginTop: 0 },
});
