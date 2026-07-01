import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAllBooks, useBookChapters, useOpenChapter } from '../store';
import { resumeChapterIndex } from '../utils/chapters';
import { paletteForId } from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'BookDetail'>;

function formatWordCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function relativeTime(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分钟前更新`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前更新`;
  return `${Math.floor(hr / 24)} 天前更新`;
}

export default function BookDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DetailRoute>();
  const { bookId } = route.params;
  const books = useAllBooks();
  const book = books.find((b) => b.id === bookId);
  const chapters = useBookChapters(bookId);
  const openChapter = useOpenChapter();
  const palette = paletteForId(bookId);

  if (!book) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text color="textSecondary">未找到书籍</Text>
      </View>
    );
  }

  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  const resumeIdx = resumeChapterIndex(chapters, book.currentChapterId);
  const preview = chapters.slice(-4).reverse();
  const latest = chapters[chapters.length - 1];
  const isFinished = book.progress >= 100;

  const goReader = (idx: number) => {
    openChapter(book.id, idx);
    navigation.navigate('Reader', { bookId: book.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: theme.colors.accentDark }]}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.heroBtn}>
              <Icon name="arrow-back" size={20} color="#fff" />
            </Pressable>
            <Pressable style={styles.heroBtn}>
              <Icon name="more-horiz" size={20} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.heroBody}>
            <View style={[styles.heroCover, { backgroundColor: palette.solid }]}>
              <Text style={[styles.heroCoverText, { color: palette.ink }]}>{book.title}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.heroAuthor}>{book.author}</Text>
              <View style={styles.tagRow}>
                <View style={[styles.tag, { borderColor: 'rgba(240,217,168,.5)' }]}>
                  <Text style={{ color: '#f0d9a8', fontSize: 11 }}>{isFinished ? '已完结' : '连载中'}</Text>
                </View>
                {book.fileFormat === 'txt' && (
                  <View style={[styles.tag, { borderColor: 'rgba(255,255,255,.25)' }]}>
                    <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>本地导入</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{chapters.length}</Text>
              <Text style={styles.statLabel}>章节</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatWordCount(totalWords)}</Text>
              <Text style={styles.statLabel}>字数</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{book.progress}%</Text>
              <Text style={styles.statLabel}>进度</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>内容简介</Text>
          <Text style={[styles.synopsis, { color: theme.colors.text }]}>
            {book.description || '这本书还没有简介。'}
          </Text>
        </View>

        {latest && (
          <View style={[styles.updateCard, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
            <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13 }}>
                第 {chapters.length} 章 · {latest.title}
              </Text>
              <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                {relativeTime(book.updatedAt)}
              </Text>
            </View>
            <Text style={{ color: theme.colors.accent, fontSize: 12 }}>最新</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.tocHeader}>
            <Text style={[styles.sectionLabel, { color: theme.colors.text, marginBottom: 0 }]}>目录</Text>
            <Pressable
              onPress={() => navigation.navigate('Reader', { bookId: book.id, openDrawer: true })}
              style={styles.tocMore}>
              <Text variant="caption" color="textSecondary">共 {chapters.length} 章</Text>
              <Icon name="chevron-right" size={15} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.tocList, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
            {preview.map((c) => {
              const idx = chapters.indexOf(c);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => goReader(idx)}
                  style={[styles.tocRow, { borderBottomColor: theme.colors.border }]}>
                  <Text variant="caption" color="textSecondary" style={{ width: 30 }}>{idx + 1}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: theme.colors.text }}>
                    {c.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: theme.colors.background }]}>
        <Pressable
          onPress={() => navigation.navigate('MainTabs', { screen: 'Bookshelf' })}
          style={[styles.shelfBtn, { borderColor: theme.colors.accentDark }]}>
          <Icon name="bookmark-border" size={19} color={theme.colors.accentDark} />
          <Text style={{ fontSize: 9, color: theme.colors.accentDark, marginTop: 2 }}>书架</Text>
        </Pressable>
        <Pressable
          onPress={() => goReader(resumeIdx)}
          style={[styles.readBtn, { backgroundColor: theme.colors.accentDark }]}>
          <Text style={styles.readBtnText}>
            {book.progress > 0 ? `继续阅读 · 第 ${resumeIdx + 1} 章` : '开始阅读'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: 44, paddingHorizontal: 20, paddingBottom: 22 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', height: 36, alignItems: 'center' },
  heroBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flexDirection: 'row', gap: 16, marginTop: 18 },
  heroCover: {
    width: 96,
    height: 132,
    borderRadius: 7,
    padding: 10,
    justifyContent: 'flex-end',
  },
  heroCoverText: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  heroInfo: { flex: 1, paddingTop: 4 },
  heroTitle: { fontFamily: 'serif', fontSize: 23, fontWeight: '700', color: '#fff' },
  heroAuthor: { fontSize: 13, color: 'rgba(255,255,255,.72)', marginTop: 8 },
  tagRow: { flexDirection: 'row', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  tag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, borderWidth: 1 },
  statsRow: {
    flexDirection: 'row',
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.12)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'serif', fontSize: 16, fontWeight: '600', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 3 },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  synopsis: { fontFamily: 'serif', fontSize: 14, lineHeight: 24 },
  updateCard: {
    marginHorizontal: 20,
    marginTop: 18,
    padding: 13,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tocMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tocList: { marginTop: 8, borderRadius: 8, overflow: 'hidden' },
  tocRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 15, borderBottomWidth: 1 },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 12,
  },
  shelfBtn: {
    width: 52,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtn: { flex: 1, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  readBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
