import React from 'react';
import { View, StyleSheet, ScrollView, Switch, Platform, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button, Input, Text, Icon } from '../components';
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
import { useLibraryBackup } from '../services/backup/useLibraryBackup';
import { RestoredLibraryBackup } from '../services/backup/libraryBackup';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { readLibraryBackup } from '../services/backup/libraryBackup';
import {
  deleteWebDavBackup,
  downloadWebDavBackup,
  listWebDavBackups,
  testWebDavConnection,
  uploadWebDavBackup,
  WebDavBackupFile,
} from '../services/webdav/client';
import {
  clearWebDavCredentials,
  loadWebDavCredentials,
  saveWebDavCredentials,
} from '../services/webdav/credentials';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MeScreen({
  settings = false,
  webDavPage = false,
}: {
  settings?: boolean;
  webDavPage?: boolean;
}) {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
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
  const {
    hydrated: libraryHydrated,
    createBackup,
    createBackupArchive,
    selectBackupForRestore,
    restoreBackup,
  } = useLibraryBackup();
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [cloudBusy, setCloudBusy] = React.useState(false);
  const [webDav, setWebDav] = React.useState({ endpoint: '', username: '', password: '', directory: 'qingdu-backups' });
  const [cloudFiles, setCloudFiles] = React.useState<WebDavBackupFile[]>([]);
  const [pendingRestore, setPendingRestore] = React.useState<{
    name: string;
    backup: RestoredLibraryBackup;
  } | null>(null);
  const [feedback, setFeedback] = React.useState<{
    title: string;
    message: string;
  } | null>(null);
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // 累计时长：不足 1 小时按分钟展示，超过则按「X.X 小时」。
  const totalLabel =
    stats.totalMinutes >= 60
      ? `${(stats.totalMinutes / 60).toFixed(1)}h`
      : `${stats.totalMinutes}m`;

  const showMessage = (title: string, message: string) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setFeedback({ title, message });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 4000);
  };

  const webDavErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : '请稍后重试';
    if (Platform.OS === 'web' && message === '无法连接 WebDAV 服务，请检查网络和地址') {
      return '当前 WebDAV 服务未开放浏览器跨域访问。请在 iOS/Android 使用，或配置受控的 WebDAV 代理。';
    }
    return message;
  };

  React.useEffect(
    () => () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    let active = true;
    loadWebDavCredentials()
      .then(credentials => {
        if (active && credentials) {
          setWebDav({ ...credentials, directory: credentials.directory || 'qingdu-backups' });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleCreateBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await createBackup();
      const message =
        Platform.OS === 'web'
          ? `已包含 ${result.bookCount} 本书籍的数据。请在浏览器下载列表或系统“下载”文件夹查看。`
          : `已包含 ${result.bookCount} 本书籍的数据。`;
      showMessage('备份已导出', message);
    } catch (error) {
      showMessage('导出失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBackupBusy(false);
    }
  };

  const applyRestore = async (backup: RestoredLibraryBackup) => {
    setBackupBusy(true);
    try {
      await restoreBackup(backup);
      showMessage('恢复完成', `已恢复 ${backup.meta.books.length} 本书籍。`);
    } catch (error) {
      showMessage('恢复失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async () => {
    setBackupBusy(true);
    try {
      const selected = await selectBackupForRestore();
      if (!selected) {
        setBackupBusy(false);
        return;
      }
      setBackupBusy(false);
      setPendingRestore(selected);
    } catch (error) {
      setBackupBusy(false);
      showMessage('无法读取备份', error instanceof Error ? error.message : '请检查备份文件');
    }
  };

  const refreshCloudFiles = async () => {
    const files = await listWebDavBackups(webDav);
    setCloudFiles(files);
  };

  const handleTestWebDav = async () => {
    setCloudBusy(true);
    try {
      await testWebDavConnection(webDav);
      await saveWebDavCredentials(webDav);
      await refreshCloudFiles();
      showMessage('WebDAV 已连接', '已验证连接，并读取了云端备份列表。');
    } catch (error) {
      showMessage('WebDAV 连接失败', webDavErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleClearWebDavCredentials = async () => {
    setCloudBusy(true);
    try {
      await clearWebDavCredentials();
      setWebDav({ endpoint: '', username: '', password: '', directory: 'qingdu-backups' });
      setCloudFiles([]);
      showMessage('已清除 WebDAV 凭据', '下次连接需要重新填写地址、用户名和密码。');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleUploadWebDav = async () => {
    setCloudBusy(true);
    try {
      const backup = await createBackupArchive();
      await uploadWebDavBackup(webDav, backup.fileName, backup.archive);
      await refreshCloudFiles();
      showMessage('已上传云端备份', `已备份 ${backup.bookCount} 本书籍。`);
    } catch (error) {
      showMessage('上传失败', webDavErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDownloadWebDav = async (file: WebDavBackupFile) => {
    setCloudBusy(true);
    try {
      const bytes = await downloadWebDavBackup(webDav, file);
      setPendingRestore({ name: file.name, backup: readLibraryBackup(bytes) });
    } catch (error) {
      showMessage('下载失败', webDavErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDeleteWebDav = async (file: WebDavBackupFile) => {
    setCloudBusy(true);
    try {
      await deleteWebDavBackup(webDav, file);
      await refreshCloudFiles();
      showMessage('已删除云端备份', file.name);
    } catch (error) {
      showMessage('删除失败', webDavErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  if (!settings) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}><Text style={[styles.title, { color: theme.colors.text }]}>我的</Text></View>
        <View style={[styles.profile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadows.sm]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.accentDark }]}><Icon name="person-outline" size={26} color="#F3EAD6" /></View>
          <View style={styles.profileInfo}><Text style={[styles.profileName, { color: theme.colors.text }]}>书友</Text><Text style={[styles.profileMeta, { color: theme.colors.textSecondary }]}>本地阅读 · 数据仅保存在当前设备</Text></View>
        </View>
        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}><Text style={[styles.statValue, { color: theme.colors.text }]}>{books.length}</Text><Text variant="caption" color="textSecondary">书架</Text></View>
          <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}><Text style={[styles.statValue, { color: theme.colors.text }]}>{finished}</Text><Text variant="caption" color="textSecondary">已读完</Text></View>
          <View style={[styles.stat, { backgroundColor: theme.colors.surface }]}><Text style={[styles.statValue, { color: theme.colors.accent }]}>{stats.streak}</Text><Text variant="caption" color="textSecondary">连续天数</Text></View>
        </View>
        <Pressable style={[styles.settingsEntry, { backgroundColor: theme.colors.surface }, theme.shadows.sm]} onPress={() => navigation.navigate('Settings')}>
          <View style={styles.settingIcon}><Icon name="settings" size={20} color={theme.colors.text} /></View>
          <View style={styles.settingInfo}><Text style={[styles.settingTitle, { color: theme.colors.text }]}>设置</Text><Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>数据安全、外观与云端备份</Text></View>
          <Icon name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}><Icon name="arrow-back" size={22} color={theme.colors.text} /></Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>{webDavPage ? 'WebDAV 云端备份' : '设置'}</Text>
        <View style={styles.backButton} />
      </View>

      <View
        style={[
          styles.profile,
          styles.hidden,
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

      <View style={[styles.stats, styles.hidden]}>
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

      <View style={[styles.stats, styles.hidden]}>
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
          webDavPage && styles.hidden,
          { backgroundColor: theme.colors.surface },
          theme.shadows.sm,
        ]}
      >
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>数据安全</Text>
        <View style={styles.backupActions}>
          <Button
            title="导出备份"
            variant="outline"
            size="small"
            disabled={!libraryHydrated || backupBusy}
            loading={backupBusy}
            onPress={() => { handleCreateBackup(); }}
            style={styles.backupAction}
          />
          <Button
            title="恢复备份"
            variant="outline"
            size="small"
            disabled={!libraryHydrated || backupBusy}
            onPress={() => { handleRestoreBackup(); }}
            style={styles.backupAction}
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
        {!webDavPage ? <Pressable style={styles.cloudMenu} onPress={() => navigation.navigate('WebDavBackup')}>
          <View style={styles.settingIcon}><Icon name="cloud" size={20} color={theme.colors.text} /></View>
          <View style={styles.settingInfo}><Text style={[styles.settingTitle, { color: theme.colors.text }]}>WebDAV 云端备份</Text><Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>手动上传、恢复与管理云端备份</Text></View>
          <Icon name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </Pressable> : <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>连接与备份</Text>}
        {webDavPage ? <View style={styles.webDavForm}>
          <Input label="服务地址" value={webDav.endpoint} onChangeText={endpoint => setWebDav(value => ({ ...value, endpoint }))} placeholder="https://dav.example.com/dav/" autoCapitalize="none" keyboardType="url" />
          <Input label="用户名" value={webDav.username} onChangeText={username => setWebDav(value => ({ ...value, username }))} autoCapitalize="none" />
          <Input label="密码" value={webDav.password} onChangeText={password => setWebDav(value => ({ ...value, password }))} secureTextEntry autoCapitalize="none" />
          <Input label="云端目录" value={webDav.directory} onChangeText={directory => setWebDav(value => ({ ...value, directory }))} autoCapitalize="none" />
          <View style={styles.backupActions}>
            <Button title="测试连接" variant="outline" size="small" loading={cloudBusy} disabled={cloudBusy} onPress={() => { handleTestWebDav(); }} style={styles.backupAction} />
            <Button title="上传备份" size="small" loading={cloudBusy} disabled={!libraryHydrated || cloudBusy} onPress={() => { handleUploadWebDav(); }} style={styles.backupAction} />
          </View>
          <Pressable disabled={cloudBusy} onPress={() => { handleClearWebDavCredentials(); }} style={styles.clearCredentials}>
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>清除已保存的 WebDAV 凭据</Text>
          </Pressable>
          {cloudFiles.map(file => (
            <View key={file.url} style={[styles.cloudFile, { borderTopColor: theme.colors.border }]}>
              <View style={styles.cloudFileInfo}>
                <Text numberOfLines={1} style={{ color: theme.colors.text }}>{file.name}</Text>
                <Text variant="caption" color="textSecondary">{file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : '未知时间'} · {(file.size / 1024).toFixed(1)} KB</Text>
              </View>
              <Pressable onPress={() => { handleDownloadWebDav(file); }}><Icon name="download" size={20} color={theme.colors.accent} /></Pressable>
              <Pressable onPress={() => { handleDeleteWebDav(file); }} style={styles.cloudDelete}><Icon name="delete-outline" size={20} color={theme.colors.danger} /></Pressable>
            </View>
          ))}
        </View> : null}
      </View>

      <View
        style={[
          styles.section,
          webDavPage && styles.hidden,
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
          webDavPage && styles.hidden,
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

      {pendingRestore ? (
        <View style={styles.restoreBackdrop}>
          <View
            style={[
              styles.restoreDialog,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <Text style={[styles.restoreTitle, { color: theme.colors.text }]}>恢复备份</Text>
            <Text style={[styles.restoreMessage, { color: theme.colors.textSecondary }]}>
              将用 {pendingRestore.name} 替换当前书库。此操作不可撤销。
            </Text>
            <View style={styles.restoreActions}>
              <Button
                title="取消"
                variant="outline"
                size="small"
                onPress={() => setPendingRestore(null)}
                style={styles.restoreAction}
              />
              <Button
                title="替换恢复"
                size="small"
                onPress={() => {
                  const backup = pendingRestore.backup;
                  setPendingRestore(null);
                  applyRestore(backup);
                }}
                style={styles.restoreAction}
              />
            </View>
          </View>
        </View>
      ) : null}

      {feedback ? (
        <Pressable
          style={styles.feedbackWrap}
          onPress={() => setFeedback(null)}
        >
          <View style={[styles.feedback, { backgroundColor: theme.colors.surface }, theme.shadows.md]}>
            <Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>{feedback.title}</Text>
            <Text style={[styles.feedbackMessage, { color: theme.colors.textSecondary }]}>
              {feedback.message}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
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

export function SettingsScreen() {
  return <MeScreen settings />;
}

export function WebDavBackupScreen() {
  return <MeScreen settings webDavPage />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { display: 'none' },
  container: { flex: 1 },
  content: { paddingTop: 8, paddingBottom: 88 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  backButton: { alignItems: 'center', height: 28, justifyContent: 'center', width: 28 },
  backupActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 15,
  },
  backupAction: { flex: 1 },
  settingsEntry: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 18,
    minHeight: 68,
    paddingHorizontal: 15,
  },
  cloudMenu: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 15,
  },
  webDavForm: { paddingHorizontal: 15, paddingBottom: 15 },
  cloudFile: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 10,
  },
  cloudFileInfo: { flex: 1, marginRight: 12 },
  cloudDelete: { marginLeft: 14 },
  clearCredentials: { alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
  restoreBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,.42)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  restoreDialog: {
    borderRadius: 8,
    maxWidth: 360,
    padding: 20,
    width: '100%',
  },
  restoreTitle: { fontSize: 18, fontWeight: '700' },
  restoreMessage: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  restoreActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  restoreAction: { flex: 1 },
  feedbackWrap: {
    bottom: 24,
    left: 20,
    position: 'absolute',
    right: 20,
    zIndex: 30,
  },
  feedback: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  feedbackTitle: { fontSize: 14, fontWeight: '700' },
  feedbackMessage: { fontSize: 13, lineHeight: 19, marginTop: 4 },
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
