/**
 * SwellNovel App — Web 入口
 *
 * 与 App.tsx 相同，但去掉 GestureHandlerRootView。
 * react-native-gesture-handler 在 web 上只是一个空壳 View，但它的 barrel export
 * 会把全部 17+ 手势模块拉进 bundle（~795 KiB），webpack 无法 tree-shake。
 * 通过 .web.tsx 平台变体彻底排除这个依赖。
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { LibraryPersistence } from './src/store/LibraryPersistence';
import { FullscreenController } from './src/components/FullscreenController';
import { WebViewFetcher } from './src/components/WebViewFetcher';
import { LibraryReadyGate } from './src/components/LibraryReadyGate';

function AppContent() {
  const { isDarkMode } = useTheme();

  return (
    <>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <LibraryPersistence />
      <FullscreenController />
      <WebViewFetcher />
      <LibraryReadyGate>
        <AppNavigator />
      </LibraryReadyGate>
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
