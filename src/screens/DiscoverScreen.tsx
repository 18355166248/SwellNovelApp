import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';

export default function DiscoverScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.headerRow}>
        <Text
          style={[styles.title, { color: theme.colors.text }]}>
          发现
        </Text>
      </View>
      <View style={styles.empty}>
        <Icon name="explore" size={40} color={theme.colors.textSecondary} />
        <Text variant="body" color="textSecondary" style={{ marginTop: 12 }}>
          书单推荐、榜单即将上线
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
});
