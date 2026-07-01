import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import {
  useAllBooks,
  useAddBook,
  useSetChapters,
  useOpenChapter,
  useBookChapters,
} from '../store';
import type { Book } from '../store/types/book';
import { parseTxtChapters } from '../utils/txt';
import { pickTxtFile } from '../utils/importBook';
import { resumeChapterIndex } from '../utils/chapters';
import { paletteForId } from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FILTERS = ['全部', '在线', '导入', '连载', '完结'] as const;

function applyFilter(books: Book[], filter: (typeof FILTERS)[number]) {
  switch (filter) {
    case '在线':
      return books.filter((b) => b.fileFormat !== 'txt');
    case '导入':
      return books.filter((b) => b.fileFormat === 'txt');
    case '连载':
      return books.filter((b) => b.progress < 100);
    case '完结':
      return books.filter((b) => b.progress >= 100);
    default:
      return books;
  }
}

export default function BookshelfScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const books = useAllBooks();
  const addBook = useAddBook();
  const setChapters = useSetChapters();
  const openChapter = useOpenChapter();

  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>('全部');
  const [gridView, setGridView] = React.useState(true);

  const continueBook = React.useMemo(() => {
    const withHistory = books.filter((b) => b.lastReadAt);
    if (withHistory.length === 0) return null;
    return withHistory.reduce((a, b) => ((a.lastReadAt || 0) > (b.lastReadAt || 0) ? a : b));
  }, [books]);
  const continueChapters = useBookChapters(continueBook?.id || null);

  const handleImportTxt = React.useCallback(async () => {
    const picked = await pickTxtFile();
    if (!picked) return;
    const bookId = Date.now().toString();
    const newBook: Book = {
      id: bookId,
      title: picked.name,
      author: '本地导入',
      fileFormat: 'txt',
      addedAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
    };
    const chapters = parseTxtChapters(bookId, picked.content);
    addBook(newBook);
    setChapters(bookId, chapters);
    navigation.navigate('BookDetail', { bookId });
  }, [addBook, navigation, setChapters]);

  const continuing = books.filter((b) => b.progress < 100).length;
  const shown = applyFilter(books, filter);

  const openContinueBook = () => {
    if (!continueBook) return;
    const idx = resumeChapterIndex(continueChapters, continueBook.currentChapterId);
    openChapter(continueBook.id, idx);
    navigation.navigate('Reader', { bookId: continueBook.id });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]}>书架</Text>
            <Text variant="caption" color="textSecondary" style={{ marginTop: 3 }}>
              共 {books.length} 本{continuing > 0 ? ` · ${continuing} 本连载中` : ''}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('MainTabs', { screen: 'Search' })}
              style={[styles.iconBtn, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
              <Icon name="search" size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() => setGridView((v) => !v)}
              style={[styles.iconBtn, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
              <Icon name={gridView ? 'view-list' : 'grid-view'} size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>

        {continueBook && (
          <Pressable
            onPress={openContinueBook}
            style={[styles.continueCard, { backgroundColor: theme.colors.accentDark }]}>
            <Text style={styles.continueLabel}>继续阅读</Text>
            <View style={styles.continueRow}>
              <View
                style={[
                  styles.continueCover,
                  { backgroundColor: paletteForId(continueBook.id).solid },
                ]}>
                <Text
                  numberOfLines={2}
                  style={[styles.continueCoverText, { color: paletteForId(continueBook.id).ink }]}>
                  {continueBook.title}
                </Text>
              </View>
              <View style={styles.continueInfo}>
                <Text style={styles.continueTitle} numberOfLines={1}>
                  {continueBook.title}
                </Text>
                <Text style={styles.continueChapter} numberOfLines={1}>
                  {continueChapters[resumeChapterIndex(continueChapters, continueBook.currentChapterId)]?.title ||
                    '开始阅读'}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${continueBook.progress}%` }]} />
                </View>
                <Text style={styles.continueMeta}>
                  已读 {continueBook.progress}% · 共 {continueChapters.length} 章
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const on = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: on ? theme.colors.accentDark : theme.colors.surface,
                    borderColor: on ? theme.colors.accentDark : theme.colors.border,
                  },
                ]}>
                <Text style={{ color: on ? '#fff' : theme.colors.text, fontSize: 13, fontWeight: '500' }}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {books.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="menu-book" size={40} color={theme.colors.textSecondary} />
            <Text variant="body" color="textSecondary" style={{ marginTop: 12, marginBottom: 20 }}>
              书架空空如也，点击下方导入本地 TXT
            </Text>
            <Pressable
              onPress={handleImportTxt}
              style={[styles.emptyImportBtn, { backgroundColor: theme.colors.accentDark }]}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>导入本地 TXT</Text>
            </Pressable>
          </View>
        ) : gridView ? (
          <View style={styles.grid}>
            {shown.map((b) => {
              const palette = paletteForId(b.id);
              const badge =
                b.progress >= 100 ? { label: '完结', color: theme.colors.badgeMuted } :
                b.fileFormat === 'txt' ? { label: '导入', color: theme.colors.accent } : null;
              return (
                <Pressable
                  key={b.id}
                  style={styles.gridItem}
                  onPress={() => navigation.navigate('BookDetail', { bookId: b.id })}>
                  <View style={[styles.cover, { backgroundColor: palette.solid }]}>
                    {badge && (
                      <View style={[styles.badge, { backgroundColor: badge.color }]}>
                        <Text style={styles.badgeText}>{badge.label}</Text>
                      </View>
                    )}
                    <Text style={[styles.coverText, { color: palette.ink }]} numberOfLines={2}>
                      {b.title}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.gridTitle, { color: theme.colors.text }]}>
                    {b.title}
                  </Text>
                  <View style={[styles.thinTrack, { backgroundColor: theme.colors.border }]}>
                    <View style={[styles.thinFill, { width: `${b.progress}%`, backgroundColor: theme.colors.accent }]} />
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.gridItem, styles.addTile, { borderColor: theme.colors.border }]}
              onPress={handleImportTxt}>
              <Icon name="add" size={26} color={theme.colors.textSecondary} />
              <Text variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                导入 TXT
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {shown.map((b) => (
              <Pressable
                key={b.id}
                style={[styles.listItem, { borderBottomColor: theme.colors.border }]}
                onPress={() => navigation.navigate('BookDetail', { bookId: b.id })}>
                <View style={[styles.listCover, { backgroundColor: paletteForId(b.id).solid }]}>
                  <Text style={[styles.listCoverText, { color: paletteForId(b.id).ink }]} numberOfLines={2}>
                    {b.title}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="h3" numberOfLines={1}>{b.title}</Text>
                  <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
                    {b.author} · 已读 {b.progress}%
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              onPress={handleImportTxt}
              style={[styles.listImportBtn, { borderColor: theme.colors.border }]}>
              <Icon name="add" size={18} color={theme.colors.textSecondary} />
              <Text variant="body" color="textSecondary" style={{ marginLeft: 6 }}>
                导入本地 TXT
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const COVER_HEIGHT_RATIO = 4.2 / 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 24 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontFamily: 'serif', fontSize: 25, fontWeight: '700', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
  },
  continueLabel: { fontSize: 11, color: 'rgba(255,255,255,.6)', letterSpacing: 1 },
  continueRow: { flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'flex-end' },
  continueCover: {
    width: 54,
    height: 74,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  continueCoverText: { fontFamily: 'serif', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  continueInfo: { flex: 1, paddingBottom: 2 },
  continueTitle: { fontFamily: 'serif', fontSize: 17, fontWeight: '600', color: '#fff' },
  continueChapter: { fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 4 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,.18)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#c9a15e', borderRadius: 2 },
  continueMeta: { fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 5 },
  filterRow: { marginTop: 16, paddingHorizontal: 20 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyImportBtn: { paddingVertical: 12, paddingHorizontal: 26, borderRadius: 10 },
  grid: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  gridItem: { width: '31%' },
  cover: {
    width: '100%',
    aspectRatio: 1 / COVER_HEIGHT_RATIO,
    borderRadius: 6,
    padding: 8,
    justifyContent: 'flex-end',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  coverText: { fontFamily: 'serif', fontSize: 15, fontWeight: '700', lineHeight: 18 },
  gridTitle: { fontSize: 12, marginTop: 7, fontWeight: '500' },
  thinTrack: { height: 3, borderRadius: 2, marginTop: 5, overflow: 'hidden' },
  thinFill: { height: '100%', borderRadius: 2 },
  addTile: {
    aspectRatio: 1 / COVER_HEIGHT_RATIO,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20, paddingTop: 10 },
  listItem: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
  listCover: { width: 52, height: 70, borderRadius: 5, alignItems: 'center', justifyContent: 'center', padding: 5 },
  listCoverText: { fontFamily: 'serif', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  listImportBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
});
