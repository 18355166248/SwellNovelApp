import React from 'react';
import { View, StyleSheet, ScrollView, Switch } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Card } from '../components';
import { useAppSettings, useToggleNotifications, useAllBooks } from '../store';

export default function MeScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const appSettings = useAppSettings();
  const toggleNotifications = useToggleNotifications();
  const books = useAllBooks();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accentDark }]}>
          <Text variant="h2" style={{ color: '#fff' }}>读</Text>
        </View>
        <View style={{ marginLeft: 14 }}>
          <Text variant="h3">书友</Text>
          <Text variant="caption" color="textSecondary" style={{ marginTop: 3 }}>
            书架 {books.length} 本
          </Text>
        </View>
      </View>

      <Card style={styles.section}>
        <Text variant="label" style={styles.sectionTitle}>
          外观设置
        </Text>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">深色模式</Text>
            <Text variant="caption" color="textSecondary">
              切换应用整体主题（阅读页主题在阅读设置中单独调整）
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={toggleTheme}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.accentDark,
            }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text variant="label" style={styles.sectionTitle}>
          通知设置
        </Text>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text variant="body">启用通知</Text>
            <Text variant="caption" color="textSecondary">
              接收更新提醒
            </Text>
          </View>
          <Switch
            value={appSettings.notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.accentDark,
            }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text variant="label" style={styles.sectionTitle}>
          关于
        </Text>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text variant="body">版本</Text>
            <Text variant="caption" color="textSecondary">
              1.0.0
            </Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 14,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
});
