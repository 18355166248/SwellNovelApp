import React from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

type Props = {
  uri?: string;
  title: string;
  style?: StyleProp<ImageStyle>;
};

function CoverImage({ uri, title, style }: Props & { uri: string }) {
  const [failed, setFailed] = React.useState(false);
  const [imageSize, setImageSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);
  const [frame, setFrame] = React.useState({ width: 0, height: 0 });
  // 图片失败后露出下层的定制封面，避免坏链留下空白书籍。
  if (failed) return null;
  // 只有比例不匹配、留白超过 2% 时才铺模糊背景，避免标准封面重复渲染和像素舍入误判。
  const needsBackdrop =
    imageSize && frame.width > 0 && frame.height > 0
      ? Math.abs(
          Math.log(
            imageSize.width / imageSize.height / (frame.width / frame.height),
          ),
        ) > Math.log(1.02)
      : false;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.frame, style]}
      onLayout={({ nativeEvent }) =>
        setFrame({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
        })
      }
    >
      {needsBackdrop && (
        <>
          <Image
            source={{ uri }}
            resizeMode="cover"
            blurRadius={12}
            fadeDuration={0}
            accessible={false}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, styles.backdropShade]} />
        </>
      )}
      {/* 只有背景允许裁切，前景始终完整展示；加载失败则整层退回定制封面。 */}
      <Image
        accessibilityLabel={`${title}封面`}
        source={{ uri }}
        resizeMode="contain"
        fadeDuration={0}
        onLoad={({ nativeEvent }) => {
          const { width, height } = nativeEvent.source;
          if (width > 0 && height > 0) setImageSize({ width, height });
        }}
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#eee9de', overflow: 'hidden' },
  backdropShade: { backgroundColor: 'rgba(0,0,0,.12)' },
});

export function BookCoverImage({ uri, ...props }: Props) {
  const coverUri = uri?.trim();
  // 按地址重建加载状态，换源或更新封面后不沿用旧图片的失败状态。
  return coverUri ? (
    <CoverImage key={coverUri} uri={coverUri} {...props} />
  ) : null;
}
