/**
 * 应用方向的跨端封装。方向由阅读页显式切换，不监听设备姿态，避免拿手机时页面跟着旋转。
 */

import { NativeModules, Platform } from 'react-native';

export type AppOrientation = 'portrait' | 'landscape';

interface OrientationNative {
  lockTo(orientation: AppOrientation): void;
}
const native: OrientationNative | undefined =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules.Orientation as OrientationNative | undefined)
    : undefined;

export const isSupported = !!native;

/** 锁定到指定方向；不支持的端安全忽略。 */
export function lockTo(orientation: AppOrientation): void {
  try {
    native?.lockTo(orientation);
  } catch {
    // 方向切换失败不能阻断阅读流程，页面继续沿用当前方向。
  }
}
