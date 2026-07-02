/**
 * 跨端线性渐变（native 实现）
 * Web 端由同名 .web.tsx 用 CSS backgroundImage 实现，
 * webpack resolve.extensions 优先命中 .web.tsx。
 */
export { default as LinearGradient } from 'react-native-linear-gradient';
export type { LinearGradientProps } from 'react-native-linear-gradient';
