import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSetAtom } from 'jotai';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { SERIF_FONT } from '../theme/fonts';
import { RootStackParamList } from '../types/navigation';
import { useAllBooks, useDeletedBooks, chaptersAtom } from '../store';
import type { Book, Chapter } from '../store/types/book';
import {
  clearAllChapterCache,
  clearReadChapterCache,
  formatCacheBytes,
  summarizeChapterCache,
} from '../utils/cacheManagement';
import { loadBookChapters, saveBookChapters } from '../utils/libraryStorage';
import { confirmAction } from '../utils/confirm';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface CacheEntry {
  book: Book;
  chapters: Chapter[];
}

export default function CacheManagementScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const books = useAllBooks();
  const deletedBooks = useDeletedBooks();
  const setChaptersMap = useSetAtom(chaptersAtom);
  const onlineBooks = React.useMemo(
    () => [...books, ...deletedBooks].filter(book => !!book.source),
    [books, deletedBooks],
  );
  const [entries, setEntries] = React.useState<CacheEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [loadFailedCount, setLoadFailedCount] = React.useState(0);
  const [loadRevision, setLoadRevision] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailedCount(0);
    Promise.all(
      onlineBooks.map(async book => {
        try {
          return {
            entry: {
              book,
              chapters: (await loadBookChapters(book.id)) ?? [],
            } as CacheEntry,
            failed: false,
          };
        } catch (error) {
          console.warn('[CacheManagement] load failed', book.id, error);
          return { entry: null, failed: true };
        }
      }),
    )
      .then(loaded => {
        if (!active) return;
        const failedCount = loaded.filter(item => item.failed).length;
        setEntries(loaded.flatMap(item => (item.entry ? [item.entry] : [])));
        setLoadFailedCount(failedCount);
        setMessage(
          failedCount > 0
            ? `${failedCount} 本缓存信息读取失败，其他书籍统计已保留`
            : '',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRevision, onlineBooks]);

  const summaries = React.useMemo(
    () => entries.map(entry => summarizeChapterCache(entry.chapters)),
    [entries],
  );
  const totalBytes = summaries.reduce((sum, item) => sum + item.bytes, 0);
  const totalCachedChapters = summaries.reduce(
    (sum, item) => sum + item.cachedChapters,
    0,
  );

  const applyChanges = async (
    changes: Array<{ bookId: string; chapters: Chapter[] }>,
    successMessage: string,
  ) => {
    if (busy || changes.length === 0) return;
    setBusy(true);
    try {
      // 先把每本章节文件安全落盘，再刷新内存和页面统计，避免界面显示已释放但重启后缓存仍回来。
      await Promise.all(
        changes.map(change => saveBookChapters(change.bookId, change.chapters)),
      );
      const byBook = Object.fromEntries(
        changes.map(change => [change.bookId, change.chapters]),
      );
      setChaptersMap(prev => ({ ...prev, ...byBook }));
      setEntries(prev =>
        prev.map(entry =>
          byBook[entry.book.id]
            ? { ...entry, chapters: byBook[entry.book.id] }
            : entry,
        ),
      );
      setMessage(successMessage);
    } catch (error) {
      console.warn('[CacheManagement] save failed', error);
      setMessage('清理失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const clearReadForEntries = (targets: CacheEntry[]) => {
    let freedBytes = 0;
    const changes = targets.flatMap(entry => {
      const before = summarizeChapterCache(entry.chapters);
      const next = clearReadChapterCache(
        entry.chapters,
        entry.book.currentChapterId,
        entry.book.progress,
      );
      const after = summarizeChapterCache(next);
      freedBytes += before.bytes - after.bytes;
      return before.bytes === after.bytes
        ? []
        : [{ bookId: entry.book.id, chapters: next }];
    });
    if (changes.length === 0) {
      setMessage('没有可清理的已读缓存');
      return;
    }
    applyChanges(
      changes,
      `已释放 ${formatCacheBytes(freedBytes)}，并保留最近 3 章`,
    );
  };

  const clearAllForEntry = (entry: CacheEntry) => {
    const summary = summarizeChapterCache(entry.chapters);
    if (summary.bytes <= 0) return;
    confirmAction(
      '清空缓存',
      `确定清空《${entry.book.title}》的 ${summary.cachedChapters} 章正文缓存？目录、进度、书签和摘抄都会保留。`,
      () =>
        applyChanges(
          [
            {
              bookId: entry.book.id,
              chapters: clearAllChapterCache(entry.chapters),
            },
          ],
          `已释放 ${formatCacheBytes(summary.bytes)}`,
        ),
      '清空',
    );
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          缓存管理
        </Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accentDark} />
          <Text style={{ color: theme.colors.textSecondary, marginTop: 10 }}>
            正在统计缓存…
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <View>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                约 {formatCacheBytes(totalBytes)}
              </Text>
              <Text
                style={[
                  styles.summaryMeta,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {totalCachedChapters} 章正文 · {entries.length} 本在线书
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清理全部已读章节缓存"
              accessibilityState={{
                disabled: busy || totalCachedChapters === 0,
              }}
              disabled={busy || totalCachedChapters === 0}
              onPress={() => clearReadForEntries(entries)}
              style={[
                styles.batchButton,
                {
                  backgroundColor: theme.colors.accentDark,
                  opacity: busy || totalCachedChapters === 0 ? 0.42 : 1,
                },
              ]}
            >
              <Text style={styles.batchButtonText}>
                {busy ? '清理中…' : '清理全部已读'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.tip, { color: theme.colors.textSecondary }]}>
            清理已读会保留当前章之前最近 3 章；自动预取的新章节不会被删除。
          </Text>
          {message ? (
            <View style={styles.messageRow}>
              <Text style={[styles.message, { color: theme.colors.accent }]}>
                {message}
              </Text>
              {loadFailedCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="重新统计缓存"
                  onPress={() => setLoadRevision(value => value + 1)}
                  style={styles.retryButton}
                >
                  <Text style={{ color: theme.colors.accent, fontSize: 12 }}>
                    重试
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Icon
                name="storage"
                size={36}
                color={theme.colors.textSecondary}
              />
              <Text
                style={{ color: theme.colors.textSecondary, marginTop: 10 }}
              >
                {loadFailedCount > 0 ? '缓存统计未完成' : '暂无在线书缓存'}
              </Text>
            </View>
          ) : (
            entries.map((entry, index) => {
              const summary = summaries[index];
              return (
                <View
                  key={entry.book.id}
                  style={[
                    styles.bookCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.bookHeader}>
                    <View style={styles.bookInfo}>
                      <Text
                        numberOfLines={1}
                        style={[styles.bookTitle, { color: theme.colors.text }]}
                      >
                        {entry.book.title}
                      </Text>
                      <Text
                        style={[
                          styles.bookMeta,
                          { color: theme.colors.textSecondary },
                        ]}
                      >
                        已缓存 {summary.cachedChapters}/{entry.chapters.length}{' '}
                        章 · 约 {formatCacheBytes(summary.bytes)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.progress, { color: theme.colors.accent }]}
                    >
                      {entry.book.progress}%
                    </Text>
                  </View>
                  <View style={styles.bookActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`清理《${entry.book.title}》的已读章节缓存`}
                      accessibilityState={{
                        disabled: busy || summary.cachedChapters === 0,
                      }}
                      disabled={busy || summary.cachedChapters === 0}
                      onPress={() => clearReadForEntries([entry])}
                      style={[
                        styles.bookAction,
                        { borderColor: theme.colors.border },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.textSecondary,
                          fontSize: 12,
                        }}
                      >
                        清理已读
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`清空《${entry.book.title}》的章节缓存`}
                      accessibilityState={{
                        disabled: busy || summary.cachedChapters === 0,
                      }}
                      disabled={busy || summary.cachedChapters === 0}
                      onPress={() => clearAllForEntry(entry)}
                      style={[
                        styles.bookAction,
                        { borderColor: theme.colors.border },
                      ]}
                    >
                      <Text
                        style={{ color: theme.colors.danger, fontSize: 12 }}
                      >
                        清空缓存
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    lineHeight: 36,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40, paddingHorizontal: 20 },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 16,
  },
  summaryValue: {
    fontFamily: SERIF_FONT,
    fontSize: 23,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  summaryMeta: { fontSize: 11.5, marginTop: 4 },
  batchButton: {
    borderRadius: 9,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  batchButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tip: { fontSize: 11.5, lineHeight: 18, marginTop: 12 },
  messageRow: { alignItems: 'center', flexDirection: 'row', marginTop: 7 },
  message: { flex: 1, fontSize: 12 },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 52,
  },
  empty: { alignItems: 'center', paddingVertical: 70 },
  bookCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  bookHeader: { alignItems: 'center', flexDirection: 'row' },
  bookInfo: { flex: 1, minWidth: 0 },
  bookTitle: { fontSize: 14.5, fontWeight: '600' },
  bookMeta: { fontSize: 11.5, marginTop: 5 },
  progress: { fontSize: 12, marginLeft: 12 },
  bookActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  bookAction: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
});
