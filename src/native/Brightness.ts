/**
 * 系统屏幕亮度的跨端封装。
 *
 * - iOS：底层用 UIScreen.brightness（0..1），直接改设备亮度。
 * - Android：底层改当前 Activity 窗口的 screenBrightness（0..1，应用窗口级，
 *   无需 WRITE_SETTINGS 权限），离开应用会自动恢复系统亮度。
 * - Web / 未接入原生模块：isSupported=false，全部为安全空操作（浏览器无权限调屏幕亮度）。
 */

import { NativeModules, Platform } from 'react-native';

interface BrightnessNative {
  getBrightness(): Promise<number>;
  setBrightness(value: number): void;
}

const native: BrightnessNative | undefined =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules.Brightness as BrightnessNative | undefined)
    : undefined;

export const isSupported = !!native;

/** 读取当前屏幕亮度（0..1）；不支持时返回 null。 */
export async function getBrightness(): Promise<number | null> {
  if (!native) return null;
  try {
    const v = await native.getBrightness();
    if (typeof v !== 'number' || Number.isNaN(v)) return null;
    return Math.max(0, Math.min(1, v));
  } catch {
    return null;
  }
}

/** 设置屏幕亮度（0..1）；不支持时空操作。 */
export function setBrightness(value: number): void {
  if (!native) return;
  const v = Math.max(0, Math.min(1, value));
  try {
    native.setBrightness(v);
  } catch {
    // 忽略：亮度设置失败不应影响阅读。
  }
}
