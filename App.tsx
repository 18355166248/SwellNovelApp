/**
 * SwellNovel App
 * 小说阅读器应用
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { LibraryPersistence } from './src/store/LibraryPersistence';
import { FullscreenController } from './src/components/FullscreenController';
import { useReaderSettings } from './src/store';

function AppContent() {
  const { isDarkMode } = useTheme();
  const { fullscreen } = useReaderSettings();

  return (
    <>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
        hidden={!!fullscreen}
      />
      <LibraryPersistence />
      <FullscreenController />
      <AppNavigator />
    </>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
