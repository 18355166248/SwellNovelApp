import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  libraryHydratedAtom,
  libraryHydrationErrorAtom,
  retryLibraryHydrationAtom,
} from '../store';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { Text } from './Text';

export function LibraryReadyGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const hydrated = useAtomValue(libraryHydratedAtom);
  const error = useAtomValue(libraryHydrationErrorAtom);
  const retry = useSetAtom(retryLibraryHydrationAtom);

  if (hydrated) return <>{children}</>;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {error ? (
        <>
          <Icon name="error-outline" size={38} color={theme.colors.danger} />
          <Text variant="h3" style={styles.title}>
            书架恢复失败
          </Text>
          <Text color="textSecondary" style={styles.message}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新读取本地书架"
            onPress={() => retry()}
            style={[
              styles.retryButton,
              { backgroundColor: theme.colors.accentDark },
            ]}
          >
            <Text style={styles.retryText}>重新读取</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text color="textSecondary" style={styles.loadingText}>
            正在恢复你的书架…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  loadingText: { marginTop: 16 },
  message: { marginTop: 8, maxWidth: 320, textAlign: 'center' },
  retryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 46,
    paddingHorizontal: 24,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  title: { marginTop: 14 },
});
