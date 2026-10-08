import React from 'react';
import {
  Image,
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
  // 图片失败后露出下层的定制封面，避免坏链留下空白书籍。
  if (failed) return null;
  return (
    <Image
      accessibilityLabel={`${title}封面`}
      source={{ uri }}
      resizeMode="cover"
      fadeDuration={0}
      onError={() => setFailed(true)}
      style={[StyleSheet.absoluteFillObject, style]}
    />
  );
}

export function BookCoverImage({ uri, ...props }: Props) {
  const coverUri = uri?.trim();
  // 按地址重建加载状态，换源或更新封面后不沿用旧图片的失败状态。
  return coverUri ? (
    <CoverImage key={coverUri} uri={coverUri} {...props} />
  ) : null;
}
