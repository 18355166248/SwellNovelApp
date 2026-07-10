import React from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import {
  useAllBooks,
  useAddBook,
  useSetChapters,
  useOpenChapter,
  useBookChapters,
  useRemoveBook,
} from '../store';
import { AddOnlineBookModal } from '../components/AddOnlineBookModal';
import type { Book } from '../store/types/book';
import { parseTxtChapters } from '../utils/txt';
import { pickTxtFile } from '../utils/importBook';
import { resumeChapterIndex } from '../utils/chapters';
import {
  CONTINUE_CARD_GRADIENT,
  CONTINUE_CARD_GRADIENT_DIRECTION,
  NOVEL_GOLD,
  paletteForId,
  COVER_GRADIENT_DIRECTION,
} from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FILTERS = ['全部', '在线', '导入', '连载', '完结'] as const;

const waitForNextPaint = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });

function applyFilter(books: Book[], filter: (typeof FILTERS)[number]) {
  switch (filter) {
    case '在线':
      return books.filter(b => b.fileFormat !== 'txt');
    case '导入':
      return books.filter(b => b.fileFormat === 'txt');
    case '连载':
      return books.filter(b => b.progress < 100);
    case '完结':
      return books.filter(b => b.progress >= 100);
    default:
      return books;
  }
}

function coverTitleFontSize(title: string, base: number) {
  return title.length >= 3 ? base - 2 : base;
}

export default function BookshelfScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const books = useAllBooks();
  const addBook = useAddBook();
  const setChapters = useSetChapters();
  const openChapter = useOpenChapter();
  const removeBook = useRemoveBook();
  const [pendingDelete, setPendingDelete] = React.useState<Book | null>(null);

  const confirmDeleteBook = React.useCallback(
    (b: Book) => {
      const message =
        `确定删除《${b.title}》？将同时移除章节、阅读进度与书签。`;
      if (Platform.OS === 'web') {
        setPendingDelete(b);
        return;
      }
      Alert.alert(
        '删除书籍',
        message,
        [
          { text: '取消', style: 'cancel' },
          { text: '删除', style: 'destructive', onPress: () => removeBook(b.id) },
        ],
      );
    },
    [removeBook, setPendingDelete],
  );

  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>('全部');
  const [gridView, setGridView] = React.useState(true);
  const [onlineOpen, setOnlineOpen] = React.useState(false);
  const [importState, setImportState] = React.useState({
    active: false,
    message: '',
  });

  const continueBook = React.useMemo(() => {
    const withHistory = books.filter(b => b.lastReadAt);
    if (withHistory.length === 0) return null;
    return withHistory.reduce((a, b) =>
      (a.lastReadAt || 0) > (b.lastReadAt || 0) ? a : b,
    );
  }, [books]);
  const continueChapters = useBookChapters(continueBook?.id || null);

  const handleImportTxt = React.useCallback(async () => {
    if (importState.active) return;
    try {
      setImportState({ active: true, message: '正在打开文件选择器...' });
      await waitForNextPaint();
      const picked = await pickTxtFile();
      if (!picked) return;

      // 大 TXT 的读取和章节切分都在 JS 线程，先刷新 loading，避免用户看到页面长时间无响应。
      setImportState({ active: true, message: '正在解析本地 TXT...' });
      await waitForNextPaint();

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

      setImportState({ active: true, message: '正在整理章节...' });
      await waitForNextPaint();

      addBook(newBook);
      setChapters(bookId, chapters);
      navigation.navigate('BookDetail', { bookId });
    } catch (error) {
      Alert.alert(
        '导入失败',
        error instanceof Error ? error.message : '请确认文件格式后重试',
      );
    } finally {
      setImportState({ active: false, message: '' });
    }
  }, [addBook, importState.active, navigation, setChapters]);

  const continuing = books.filter(b => b.progress < 100).length;
  const shown = applyFilter(books, filter);

  const openContinueBook = () => {
    if (!continueBook) return;
    const idx = resumeChapterIndex(
      continueChapters,
      continueBook.currentChapterId,
    );
    openChapter(continueBook.id, idx);
    navigation.navigate('Reader', { bookId: continueBook.id });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              书架
            </Text>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginTop: 3 }}
            >
              共 {books.length} 本
              {continuing > 0 ? ` · ${continuing} 本连载中` : ''}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setOnlineOpen(true)}
              style={[
                styles.iconBtn,
                { backgroundColor: theme.colors.surface },
                theme.shadows.sm,
              ]}
            >
              <Icon name="add-link" size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate('MainTabs', { screen: 'Search' })
              }
              style={[
                styles.iconBtn,
                { backgroundColor: theme.colors.surface },
                theme.shadows.sm,
              ]}
            >
              <Icon name="search" size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() => setGridView(v => !v)}
              style={[
                styles.iconBtn,
                { backgroundColor: theme.colors.surface },
                theme.shadows.sm,
              ]}
            >
              <Icon
                name={gridView ? 'view-list' : 'grid-view'}
                size={18}
                color={theme.colors.text}
              />
            </Pressable>
          </View>
        </View>

        {continueBook && (
          <Pressable onPress={openContinueBook}>
            <LinearGradient
              colors={CONTINUE_CARD_GRADIENT}
              {...CONTINUE_CARD_GRADIENT_DIRECTION}
              style={styles.continueCard}
            >
              <View style={styles.continueDeco} pointerEvents="none" />
              <View style={styles.continueRow}>
                <LinearGradient
                  colors={[
                    paletteForId(continueBook.id).from,
                    paletteForId(continueBook.id).to,
                  ]}
                  {...COVER_GRADIENT_DIRECTION}
                  style={styles.continueCover}
                >
                  <View style={styles.coverTitleLayer}>
                    <Text
                      numberOfLines={2}
                      maxFontSizeMultiplier={1}
                      style={[
                        styles.continueCoverText,
                        {
                          fontSize: coverTitleFontSize(continueBook.title, 12),
                          lineHeight:
                            coverTitleFontSize(continueBook.title, 12) + 3,
                        },
                        { color: paletteForId(continueBook.id).ink },
                      ]}
                    >
                      {continueBook.title}
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.continueInfo}>
                  <Text
                    style={styles.continueLabel}
                    maxFontSizeMultiplier={1}
                  >
                    继续阅读
                  </Text>
                  <Text
                    style={styles.continueTitle}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                  >
                    {continueBook.title}
                  </Text>
                  <Text
                    style={styles.continueChapter}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                  >
                    {continueChapters[
                      resumeChapterIndex(
                        continueChapters,
                        continueBook.currentChapterId,
                      )
                    ]?.title || '开始阅读'}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${continueBook.progress}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ gap: 8 }}
        >
          {FILTERS.map(f => {
            const on = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: on
                      ? theme.colors.accentDark
                      : theme.colors.surface,
                    borderColor: on
                      ? theme.colors.accentDark
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: on ? '#fff' : theme.colors.text,
                    fontSize: 13,
                    fontWeight: '500',
                  }}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {books.length === 0 ? (
          <View style={styles.empty}>
            <Icon
              name="menu-book"
              size={40}
              color={theme.colors.textSecondary}
            />
            <Text
              variant="body"
              color="textSecondary"
              style={{ marginTop: 12, marginBottom: 20 }}
            >
              书架空空如也，先粘贴书源网址添加网络书籍
            </Text>
            <Pressable
              onPress={() => setOnlineOpen(true)}
              style={[
                styles.emptyImportBtn,
                { backgroundColor: theme.colors.accentDark },
              ]}
            >
              <Text
                style={{
                  color: '#fff',
                  fontWeight: Platform.select({ ios: '600', android: 'bold' }),
                  fontSize: 14,
                }}
              >
                粘贴网址添加
              </Text>
            </Pressable>
            <Pressable
              onPress={handleImportTxt}
              disabled={importState.active}
              style={{ marginTop: 14 }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 13.5 }}>
                导入本地 TXT
              </Text>
            </Pressable>
          </View>
        ) : gridView ? (
          <View style={styles.grid}>
            {shown.map(b => {
              const palette = paletteForId(b.id);
              const badge =
                b.progress >= 100
                  ? { label: '完结', color: theme.colors.badgeMuted }
                  : b.fileFormat === 'txt'
                  ? { label: '导入', color: theme.colors.accent }
                  : null;
              return (
                <Pressable
                  key={b.id}
                  style={styles.gridItem}
                  onPress={() =>
                    navigation.navigate('BookDetail', { bookId: b.id })
                  }
                  onLongPress={() => confirmDeleteBook(b)}
                  delayLongPress={350}
                >
                  <LinearGradient
                    colors={[palette.from, palette.to]}
                    {...COVER_GRADIENT_DIRECTION}
                    style={[styles.cover, theme.shadows.sm]}
                  >
                    <View style={styles.coverTitleLayer}>
                      <Text
                        style={[
                          styles.coverText,
                          {
                            color: palette.ink,
                            fontSize: coverTitleFontSize(b.title, 14),
                            lineHeight: coverTitleFontSize(b.title, 14) + 3,
                          },
                        ]}
                        numberOfLines={2}
                        maxFontSizeMultiplier={1}
                      >
                        {b.title}
                      </Text>
                    </View>
                  </LinearGradient>
                  {badge && (
                    <View
                      style={[styles.badge, { backgroundColor: badge.color }]}
                    >
                      <Text
                        style={styles.badgeText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1}
                      >
                        {badge.label}
                      </Text>
                    </View>
                  )}
                  <Text
                    numberOfLines={1}
                    style={[styles.gridTitle, { color: theme.colors.text }]}
                  >
                    {b.title}
                  </Text>
                  <View
                    style={[
                      styles.thinTrack,
                      { backgroundColor: theme.colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.thinFill,
                        {
                          width: `${b.progress}%`,
                          backgroundColor: theme.colors.accent,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              style={[
                styles.gridItem,
                styles.addTile,
                { borderColor: theme.colors.border },
              ]}
              onPress={() => setOnlineOpen(true)}
            >
              <Icon name="add" size={26} color={theme.colors.textSecondary} />
              <Text
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 6 }}
              >
                添加网络书籍
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {shown.map(b => (
              <Pressable
                key={b.id}
                style={[
                  styles.listItem,
                  { borderBottomColor: theme.colors.border },
                ]}
                onPress={() =>
                  navigation.navigate('BookDetail', { bookId: b.id })
                }
                onLongPress={() => confirmDeleteBook(b)}
                delayLongPress={350}
              >
                <LinearGradient
                  colors={[paletteForId(b.id).from, paletteForId(b.id).to]}
                  {...COVER_GRADIENT_DIRECTION}
                  style={styles.listCover}
                >
                  <View style={styles.listCoverTitleLayer}>
                    <Text
                      style={[
                        styles.listCoverText,
                        {
                          color: paletteForId(b.id).ink,
                          fontSize: coverTitleFontSize(b.title, 12),
                          lineHeight: coverTitleFontSize(b.title, 12) + 3,
                        },
                      ]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1}
                    >
                      {b.title}
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.listInfo}>
                  <Text variant="h3" numberOfLines={1}>
                    {b.title}
                  </Text>
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={{ marginTop: 4 }}
                  >
                    {b.author} · 已读 {b.progress}%
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setOnlineOpen(true)}
              style={[
                styles.listImportBtn,
                { borderColor: theme.colors.border },
              ]}
            >
              <Icon name="add" size={18} color={theme.colors.textSecondary} />
              <Text
                variant="body"
                color="textSecondary"
                style={{ marginLeft: 6 }}
              >
                添加网络书籍
              </Text>
            </Pressable>
            <Pressable
              onPress={handleImportTxt}
              disabled={importState.active}
              style={styles.listSecondaryImport}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 13.5 }}>
                导入本地 TXT
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      {importState.active && (
        <View style={styles.importOverlay}>
          <View
            style={[
              styles.importPanel,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <ActivityIndicator size="large" color={theme.colors.accentDark} />
            <Text
              style={[styles.importTitle, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {importState.message || '正在导入...'}
            </Text>
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.importHint}
            >
              大文件需要切分章节，请稍候
            </Text>
          </View>
        </View>
      )}
      {pendingDelete ? (
        <View style={styles.deleteBackdrop}>
          <View
            style={[
              styles.deleteDialog,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <Text style={[styles.deleteTitle, { color: theme.colors.text }]}>删除书籍</Text>
            <Text style={[styles.deleteMessage, { color: theme.colors.textSecondary }]}>
              确定删除《{pendingDelete.title}》？章节、阅读进度与书签都会被清除。
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteButton, { borderColor: theme.colors.border }]}
                onPress={() => setPendingDelete(null)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteButton, { backgroundColor: theme.colors.danger }]}
                onPress={() => {
                  removeBook(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                <Text style={styles.deleteConfirmText}>删除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      <AddOnlineBookModal
        visible={onlineOpen}
        onClose={() => setOnlineOpen(false)}
        onAdded={bookId => navigation.navigate('BookDetail', { bookId })}
      />
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
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    lineHeight: 33,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    letterSpacing: 0.5,
  },
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
    height: 126,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // 设计稿右上角的半透明装饰圆
  continueDeco: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,.04)',
  },
  continueLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,.6)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  continueRow: {
    flexDirection: 'row',
    gap: 13,
    alignItems: 'flex-start',
  },
  continueCover: {
    width: 68,
    height: 94,
    borderRadius: 5,
    overflow: 'hidden',
  },
  continueCoverText: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    textAlign: 'center',
  },
  continueInfo: { flex: 1 },
  continueTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    color: '#fff',
  },
  continueChapter: {
    fontSize: 12,
    color: 'rgba(255,255,255,.65)',
    marginTop: 3,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,.18)',
    marginTop: 7,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: NOVEL_GOLD,
    borderRadius: 2,
  },
  filterRow: { marginTop: 16, paddingHorizontal: 20 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyImportBtn: {
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 10,
  },
  grid: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 13,
    rowGap: 16,
  },
  gridItem: { width: '30.5%', position: 'relative' },
  cover: {
    width: '100%',
    aspectRatio: 1 / COVER_HEIGHT_RATIO,
    borderRadius: 6,
    overflow: 'hidden',
  },
  coverTitleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 34,
    height: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  coverText: {
    fontFamily: SERIF_FONT,
    fontSize: 14,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    lineHeight: 17,
    textAlign: 'center',
  },
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
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  listCover: {
    width: 52,
    height: 70,
    borderRadius: 5,
    overflow: 'hidden',
  },
  listCoverTitleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  listCoverText: {
    fontFamily: SERIF_FONT,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    textAlign: 'center',
  },
  listInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  listImportBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  listSecondaryImport: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  importOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  importPanel: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 10,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  importTitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  importHint: { marginTop: 6, textAlign: 'center' },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,.42)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  deleteDialog: {
    borderRadius: 8,
    maxWidth: 360,
    padding: 20,
    width: '100%',
  },
  deleteTitle: { fontSize: 18, fontWeight: '700' },
  deleteMessage: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  deleteButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  deleteConfirmText: { color: '#fff', fontWeight: '600' },
});
