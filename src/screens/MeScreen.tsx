import React from 'react';
import { View, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';
import {
  useAllBooks,
  useReaderSettings,
  useSetFullscreenPref,
  useReadingStats,
} from '../store';
import { SERIF_FONT } from '../theme/fonts';
import { NOVEL_GOLD } from '../theme/readerThemes';
import { isFullscreenSupported, setFullscreen } from '../utils/fullscreen';
import { APP_VERSION } from '../config/appVersion';

export default function MeScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const books = useAllBooks();
  const readerSettings = useReaderSettings();
  const setFullscreenPref = useSetFullscreenPref();
  // 记住偏好；Web 端切换开关本身是用户手势，可在此直接进入/退出全屏（进入全屏必须在手势内）。
  const onToggleFullscreen = (next: boolean) => {
    setFullscreenPref(next);
    setFullscreen(next);
  };

  const finished = books.filter(b => b.progress >= 100).length;
  const imported = books.filter(b => b.fileFormat === 'txt').length;
  const stats = useReadingStats();
  // 累计时长：不足 1 小时按分钟展示，超过则按「X.X 小时」。
  const totalLabel =
    stats.totalMinutes >= 60
      ? `${(stats.totalMinutes / 60).toFixed(1)}h`
      : `${stats.totalMinutes}m`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>我的</Text>
      </View>

      <View
        style={[
          styles.profile,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          theme.shadows.sm,
        ]}
      >
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.colors.accentDark },
          ]}
        >
          <Icon name="person-outline" size={26} color="#F3EAD6" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.colors.text }]}>
            书友
          </Text>
          <Text
            style={[styles.profileMeta, { color: theme.colors.textSecondary }]}
          >
            本地阅读 · 数据仅保存在当前设备
          </Text>
        </View>
        <View
          style={[
            styles.profileBadge,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.profileBadgeDot} />
          <Text
            style={[styles.profileBadgeText, { color: theme.colors.accent }]}
          >
            读者
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {books.length}
          </Text>
          <Text variant="caption" color="textSecondary">
            书架
          </Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {finished}
          </Text>
          <Text variant="caption" color="textSecondary">
            已读完
          </Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {imported}
          </Text>
          <Text variant="caption" color="textSecondary">
            本地书
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.accent }]}>
            {stats.streak}
          </Text>
          <Text variant="caption" color="textSecondary">
            连续天数
          </Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {stats.todayMinutes}m
          </Text>
          <Text variant="caption" color="textSecondary">
            今日阅读
          </Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {totalLabel}
          </Text>
          <Text variant="caption" color="textSecondary">
            累计时长
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.section,
          { backgroundColor: theme.colors.surface },
          theme.shadows.sm,
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          外观设置
        </Text>
        <SettingRow
          icon="dark-mode"
          title="深色模式"
          desc="应用整体主题"
          borderColor={theme.colors.border}
          textColor={theme.colors.text}
          subColor={theme.colors.textSecondary}
          right={
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.accentDark,
              }}
              thumbColor="#FFFFFF"
            />
          }
        />
        {Platform.OS === 'web' && isFullscreenSupported && (
          <SettingRow
            icon="fullscreen"
            title="全屏阅读"
            desc={
              Platform.OS === 'web'
                ? '隐藏浏览器边栏，沉浸阅读（记住设置）'
                : '隐藏状态栏，沉浸阅读（记住设置）'
            }
            borderColor="transparent"
            textColor={theme.colors.text}
            subColor={theme.colors.textSecondary}
            right={
              <Switch
                value={!!readerSettings.fullscreen}
                onValueChange={onToggleFullscreen}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.accentDark,
                }}
                thumbColor="#FFFFFF"
              />
            }
          />
        )}
      </View>

      <View
        style={[
          styles.section,
          { backgroundColor: theme.colors.surface },
          theme.shadows.sm,
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          关于
        </Text>
        <SettingRow
          icon="info-outline"
          title="版本"
          desc={APP_VERSION}
          borderColor="transparent"
          textColor={theme.colors.text}
          subColor={theme.colors.textSecondary}
        />
      </View>
    </ScrollView>
  );
}

function SettingRow({
  icon,
  title,
  desc,
  borderColor,
  textColor,
  subColor,
  right,
}: {
  icon: string;
  title: string;
  desc: string;
  borderColor: string;
  textColor: string;
  subColor: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={[styles.settingRow, { borderBottomColor: borderColor }]}>
      <View style={styles.settingIcon}>
        <Icon name={icon} size={18} color={textColor} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.settingDesc, { color: subColor }]}>{desc}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 8, paddingBottom: 88 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    letterSpacing: 0.5,
  },
  profile: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  profileMeta: {
    marginTop: 4,
    fontSize: 12,
  },
  profileBadge: {
    minWidth: 58,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NOVEL_GOLD,
    marginRight: 5,
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  stats: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    marginBottom: 2,
  },
  section: {
    marginHorizontal: 20,
    marginTop: 18,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionTitle: {
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 2,
    fontSize: 13,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  settingRow: {
    minHeight: 64,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.04)',
  },
  settingInfo: { flex: 1, marginLeft: 12, marginRight: 12 },
  settingTitle: { fontSize: 14, fontWeight: '500' },
  settingDesc: { marginTop: 3, fontSize: 12 },
});
