/**
 * SwellNovel App
 * 小说阅读器应用
 *
 * @format
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { LibraryPersistence } from './src/store/LibraryPersistence';
import { FullscreenController } from './src/components/FullscreenController';
import { WebViewFetcher } from './src/components/WebViewFetcher';
import { BookshukuSelfTest } from './src/dev/BookshukuSelfTest';

function AppContent() {
  return (
    <>
      <LibraryPersistence />
      <FullscreenController />
      <WebViewFetcher />
      <BookshukuSelfTest />
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
