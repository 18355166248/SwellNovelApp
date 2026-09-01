import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useAtomValue, useSetAtom } from 'jotai';
import { Theme, lightTheme, darkTheme } from './themes';
import { appSettingsAtom } from '../store/atoms';

interface ThemeContextType {
  theme: Theme;
  isDarkMode: boolean;
  themeMode: 'light' | 'dark' | 'auto';
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
  setThemeMode: (mode: 'light' | 'dark' | 'auto') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme();
  const appSettings = useAtomValue(appSettingsAtom);
  const setAppSettings = useSetAtom(appSettingsAtom);

  // 计算是否深色模式
  const isDarkMode = (() => {
    if (appSettings.theme === 'dark') return true;
    if (appSettings.theme === 'light') return false;
    // 'auto' 模式跟随系统
    return systemColorScheme === 'dark';
  })();

  const toggleTheme = () => {
    const currentTheme = appSettings.theme;
    let nextTheme: 'light' | 'dark' | 'auto';

    if (currentTheme === 'light') {
      nextTheme = 'dark';
    } else if (currentTheme === 'dark') {
      nextTheme = 'auto';
    } else {
      nextTheme = 'light';
    }

    setAppSettings({ ...appSettings, theme: nextTheme });
  };

  const setTheme = (isDark: boolean) => {
    setAppSettings({
      ...appSettings,
      theme: isDark ? 'dark' : 'light',
    });
  };

  const setThemeMode = (mode: 'light' | 'dark' | 'auto') => {
    setAppSettings({ ...appSettings, theme: mode });
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDarkMode,
        themeMode: appSettings.theme,
        toggleTheme,
        setTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
