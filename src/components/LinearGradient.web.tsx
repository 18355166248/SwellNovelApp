/**
 * 跨端线性渐变（Web 实现）
 * react-native-linear-gradient 不支持 react-native-web，
 * 这里用 CSS linear-gradient 复刻 colors/locations/start/end 语义。
 */
import React from 'react';
import { View, ViewProps, StyleProp, ViewStyle } from 'react-native';

export interface LinearGradientProps extends ViewProps {
  colors: string[];
  /** 0-1，与 colors 一一对应 */
  locations?: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors,
  locations,
  start = { x: 0.5, y: 0 },
  end = { x: 0.5, y: 1 },
  style,
  children,
  ...rest
}) => {
  // 由 start/end 向量换算 CSS 渐变角度（CSS 0deg 指向上方，顺时针增大）
  const angleDeg =
    (Math.atan2(end.x - start.x, -(end.y - start.y)) * 180) / Math.PI;
  const stops = colors
    .map((c, i) =>
      locations && locations[i] != null ? `${c} ${locations[i] * 100}%` : c,
    )
    .join(', ');
  const backgroundImage = `linear-gradient(${angleDeg}deg, ${stops})`;

  return (
    <View {...rest} style={[style, { backgroundImage } as ViewStyle]}>
      {children}
    </View>
  );
};

export default LinearGradient;
