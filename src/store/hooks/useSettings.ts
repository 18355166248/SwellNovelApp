/**
 * 应用设置相关的自定义 Hooks
 */

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { appSettingsAtom, isDarkModeAtom } from '../atoms';
import { AppSettings } from '../types/settings';

/**
 * 获取应用设置
 */
export const useAppSettings = () => {
  return useAtomValue(appSettingsAtom);
};

/**
 * 更新应用设置
 */
export const useUpdateAppSettings = () => {
  const setSettings = useSetAtom(appSettingsAtom);
  
  return (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };
};

/**
 * 切换主题
 */
export const useToggleTheme = () => {
  const [settings, setSettings] = useAtom(appSettingsAtom);
  
  return () => {
    const currentTheme = settings.theme;
    let nextTheme: 'light' | 'dark' | 'auto';
    
    if (currentTheme === 'light') {
      nextTheme = 'dark';
    } else if (currentTheme === 'dark') {
      nextTheme = 'auto';
    } else {
      nextTheme = 'light';
    }
    
    setSettings({ ...settings, theme: nextTheme });
  };
};

/**
 * 设置主题
 */
export const useSetTheme = () => {
  const setSettings = useSetAtom(appSettingsAtom);
  
  return (theme: 'light' | 'dark' | 'auto') => {
    setSettings((prev) => ({ ...prev, theme }));
  };
};

/**
 * 获取是否深色模式
 */
export const useIsDarkMode = () => {
  return useAtomValue(isDarkModeAtom);
};

/**
 * 切换通知设置
 */
export const useToggleNotifications = () => {
  const [settings, setSettings] = useAtom(appSettingsAtom);
  
  return () => {
    setSettings({
      ...settings,
      notificationsEnabled: !settings.notificationsEnabled,
    });
  };
};

/**
 * 设置通知启用状态
 */
export const useSetNotificationsEnabled = () => {
  const setSettings = useSetAtom(appSettingsAtom);
  
  return (enabled: boolean) => {
    setSettings((prev) => ({ ...prev, notificationsEnabled: enabled }));
  };
};
