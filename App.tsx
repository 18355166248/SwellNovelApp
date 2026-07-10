/**
 * SwellNovel App
 * 小说阅读器应用
 *
 * @format
 */

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { LibraryPersistence } from './src/store/LibraryPersistence';
import { FullscreenController } from './src/components/FullscreenController';
import { WebViewFetcher } from './src/components/WebViewFetcher';
import { BookshukuSelfTest } from './src/dev/BookshukuSelfTest';
import { AppLaunchSplash } from './src/components/AppLaunchSplash';

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
  const [showLaunchSplash, setShowLaunchSplash] = React.useState(
    Platform.OS === 'ios',
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={styles.root}>
            <AppContent />
            {showLaunchSplash ? (
              <AppLaunchSplash
                onFinished={() => setShowLaunchSplash(false)}
              />
            ) : null}
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
