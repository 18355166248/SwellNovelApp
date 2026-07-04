declare module 'react-native-linear-gradient' {
  import * as React from 'react';
  import { ViewProps, StyleProp, ViewStyle } from 'react-native';

  export interface LinearGradientProps extends ViewProps {
    colors: string[];
    /** 0-1，与 colors 一一对应 */
    locations?: number[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    useAngle?: boolean;
    angle?: number;
    angleCenter?: { x: number; y: number };
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
  }

  const LinearGradient: React.ComponentType<LinearGradientProps>;
  export default LinearGradient;
}
