/**
 * 应用设置相关的原子状态
 */

import { atom } from 'jotai';
import { AppSettings } from '../types/settings';

// 默认应用设置
const defaultAppSettings: AppSettings = {
  theme: 'auto',
  language: 'zh-CN',
  notificationsEnabled: true,
  autoBackup: false,
  cacheSize: 0,
};

// 应用设置
export const appSettingsAtom = atom<AppSettings>(defaultAppSettings);

// 注意：isDarkModeAtom 的实际计算在 ThemeContext 中完成
// 这里保留一个基础版本，但主要逻辑在 ThemeContext 中
export const isDarkModeAtom = atom<boolean>(false);
