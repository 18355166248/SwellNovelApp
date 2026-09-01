/**
 * 回收站。
 *
 * 书架的删除只是把书移进这里（打 deletedAt 标记），章节缓存、阅读进度、书签摘抄
 * 都原样留着，还原后能接着上次的位置读。只有这个页面的「彻底删除 / 清空回收站」
 * 才会真正清除数据与磁盘上的正文文件。
 */

import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { SERIF_FONT } from '../theme/fonts';
import { RootStackParamList } from '../types/navigation';
import { useDeletedBooks, usePurgeBooks, useRestoreBook } from '../store';
import type { Book } from '../store/types/book';
import { confirmAction } from '../utils/confirm';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 删除时间的相对描述：回收站里更关心「多久前删的」而不是具体时刻。 */
function deletedAgo(deletedAt?: number): string {
  if (!deletedAt) return '';
  const minutes = Math.floor((Date.now() - deletedAt) / 60000);
  if (minutes < 1) return '刚刚删除';
  if (minutes < 60) return `${minutes} 分钟前删除`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前删除`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前删除`;
  return `${Math.floor(days / 30)} 个月前删除`;
}

function bookMeta(book: Book): string {
  const parts = [
    book.author,
    book.source ? '在线' : '本地导入',
    `已读 ${Math.round(book.progress)}%`,
    deletedAgo(book.deletedAt),
  ];
  // 本地书的 author 往往就是“本地导入”这类占位，与来源标签重复，去重后再拼。
  return parts
    .filter((part, index) => !!part && parts.indexOf(part) === index)
    .join(' · ');
}

export default function RecycleBinScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const deletedBooks = useDeletedBooks();
  const restoreBook = useRestoreBook();
  const purgeBooks = usePurgeBooks();
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const onRestore = (book: Book) => {
    restoreBook(book.id);
    setMessage(`已还原《${book.title}》，阅读进度保持不变`);
  };

  const onPurge = (book: Book) => {
    if (busy) return;
    confirmAction(
      '彻底删除',
      `《${book.title}》的章节缓存、阅读进度、书签与摘抄都会被永久清除，无法恢复。`,
      async () => {
        setBusy(true);
        try {
          await purgeBooks([book.id]);
          setMessage(`已彻底删除《${book.title}》`);
        } catch (error) {
          console.warn('[RecycleBin] purge failed', error);
          setMessage('删除失败，书籍仍保留在回收站，请稍后重试');
        } finally {
          setBusy(false);
        }
      },
      '彻底删除',
    );
  };

  const onEmpty = () => {
    if (deletedBooks.length === 0 || busy) return;
    confirmAction(
      '清空回收站',
      `回收站里的 ${deletedBooks.length} 本书将被永久删除，章节缓存、阅读进度、书签与摘抄一并清除，无法恢复。`,
      async () => {
        setBusy(true);
        try {
          await purgeBooks(deletedBooks.map(book => book.id));
          setMessage('回收站已清空');
        } catch (error) {
          console.warn('[RecycleBin] empty failed', error);
          setMessage('清空失败，未删除的书籍仍保留在回收站');
        } finally {
          setBusy(false);
        }
      },
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
        <Text style={[styles.title, { color: theme.colors.text }]}>回收站</Text>
        <View style={styles.backButton} />
      </View>

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
          <View style={styles.summaryInfo}>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {deletedBooks.length} 本
            </Text>
            <Text
              style={[
                styles.summaryMeta,
                { color: theme.colors.textSecondary },
              ]}
            >
              还原后可继续阅读
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清空回收站"
            accessibilityState={{
              disabled: deletedBooks.length === 0 || busy,
            }}
            disabled={deletedBooks.length === 0 || busy}
            onPress={onEmpty}
            style={[
              styles.batchButton,
              { backgroundColor: theme.colors.danger },
              (deletedBooks.length === 0 || busy) && styles.batchButtonDisabled,
            ]}
          >
            <Text style={styles.batchButtonText}>清空回收站</Text>
          </Pressable>
        </View>

        <Text style={[styles.tip, { color: theme.colors.textSecondary }]}>
          从书架删除的书会先放到这里，章节缓存与阅读进度都还在。清空回收站才会真正删除，
          删除后无法恢复。
        </Text>
        {message ? (
          <Text style={[styles.message, { color: theme.colors.accent }]}>
            {message}
          </Text>
        ) : null}

        {deletedBooks.length === 0 ? (
          <View style={styles.empty}>
            <Icon
              name="delete-outline"
              size={38}
              color={theme.colors.textSecondary}
            />
            <Text
              style={[styles.emptyText, { color: theme.colors.textSecondary }]}
            >
              回收站是空的
            </Text>
          </View>
        ) : (
          deletedBooks.map(book => (
            <View
              key={book.id}
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
                    {book.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.bookMeta,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {bookMeta(book)}
                  </Text>
                </View>
              </View>
              <View style={styles.bookActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`还原《${book.title}》`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => onRestore(book)}
                  style={[
                    styles.bookAction,
                    { borderColor: theme.colors.accentDark },
                  ]}
                >
                  <Text
                    style={[
                      styles.bookActionText,
                      { color: theme.colors.accentDark },
                    ]}
                  >
                    还原
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`彻底删除《${book.title}》`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => onPurge(book)}
                  style={[
                    styles.bookAction,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.bookActionText,
                      { color: theme.colors.danger },
                    ]}
                  >
                    彻底删除
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  summaryInfo: { flex: 1, minWidth: 0 },
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
  batchButtonDisabled: { opacity: 0.42 },
  batchButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tip: { fontSize: 11.5, lineHeight: 18, marginTop: 12 },
  message: { fontSize: 12, marginTop: 7 },
  empty: { alignItems: 'center', paddingVertical: 70 },
  emptyText: { fontSize: 13, marginTop: 10 },
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
  bookActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  bookActionText: { fontSize: 13 },
  bookAction: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
});
