import React from 'react';
import { View, StyleSheet, ScrollView, Switch } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Card } from '../components';
import { useAppSettings, useToggleNotifications } from '../store';

export default function SettingsScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const appSettings = useAppSettings();
  const toggleNotifications = useToggleNotifications();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.contentContainer}>
      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          外观设置
        </Text>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">深色模式</Text>
            <Text variant="caption" color="textSecondary">
              切换应用主题
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={toggleTheme}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor={isDarkMode ? '#FFFFFF' : '#FFFFFF'}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          阅读设置
        </Text>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">默认字体大小</Text>
            <Text variant="caption" color="textSecondary">
              16px
            </Text>
          </View>
        </View>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">默认背景色</Text>
            <Text variant="caption" color="textSecondary">
              白色
            </Text>
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text variant="body">翻页动画</Text>
            <Text variant="caption" color="textSecondary">
              滑动翻页
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          通知设置
        </Text>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">启用通知</Text>
            <Text variant="caption" color="textSecondary">
              接收阅读提醒
            </Text>
          </View>
          <Switch
            value={appSettings.notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor={appSettings.notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          关于
        </Text>
        <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.settingInfo}>
            <Text variant="body">版本</Text>
            <Text variant="caption" color="textSecondary">
              1.0.0
            </Text>
          </View>
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text variant="body">缓存管理</Text>
            <Text variant="caption" color="textSecondary">
              清理缓存数据
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
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 16,
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
