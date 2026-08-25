import React from 'react';
import { useAtomValue } from 'jotai';
import {
  ActivityIndicator,
  Alert,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ImageBackground,
  type ImageSourcePropType,
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
  useRemoveBook,
  useCheckFollowedBooks,
  libraryHydratedAtom,
} from '../store';
import type { Book } from '../store/types/book';
import { parseTxtChapters } from '../utils/txt';
import { pickTxtFile } from '../utils/importBook';
import {
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

const BOOK_COVER_ARTWORKS: Array<{
  source: ImageSourcePropType;
  ink: string;
}> = [
  { source: require('../assets/book-covers/cover-lychee.jpg'), ink: '#f2e4cf' },
  { source: require('../assets/book-covers/cover-botanical.jpg'), ink: '#292822' },
  { source: require('../assets/book-covers/cover-night-boat.jpg'), ink: '#f1e2c7' },
  { source: require('../assets/book-covers/cover-bookshop.jpg'), ink: '#292822' },
  { source: require('../assets/book-covers/cover-sunset-courtyard.jpg'), ink: '#f2dfc8' },
  { source: require('../assets/book-covers/cover-blue-alley.jpg'), ink: '#eee1cb' },
];

function coverArtworkForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
  }
  return BOOK_COVER_ARTWORKS[hash % BOOK_COVER_ARTWORKS.length];
}

function isShortChineseText(value: string) {
  const characters = Array.from(value.trim());
  return (
    characters.length > 0 &&
    characters.length <= 8 &&
    characters.filter(character => /[\u3400-\u9fff]/.test(character)).length /
      characters.length >=
      0.7
  );
}

function verticalCoverText(value: string) {
  return isShortChineseText(value) ? Array.from(value.trim()).join('\n') : value;
}

function isToday(timestamp?: number) {
  if (!timestamp) return false;
  const checked = new Date(timestamp);
  const now = new Date();
  return (
    checked.getFullYear() === now.getFullYear() &&
    checked.getMonth() === now.getMonth() &&
    checked.getDate() === now.getDate()
  );
}

function formatFollowResult(result: {
  updated: number;
  failed: number;
  cached: number;
}) {
  if (result.updated > 0) {
    return result.cached > 0
      ? `发现 ${result.updated} 个新章节，已自动缓存 ${result.cached} 章`
      : `发现 ${result.updated} 个新章节`;
  }
  return result.failed ? `${result.failed} 本检查失败` : '追更书籍已是最新';
}

export default function BookshelfScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const books = useAllBooks();
  const addBook = useAddBook();
  const setChapters = useSetChapters();
  const removeBook = useRemoveBook();
  const checkFollowedBooks = useCheckFollowedBooks();
  const libraryHydrated = useAtomValue(libraryHydratedAtom);
  const [selectedBookIds, setSelectedBookIds] = React.useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = React.useState<string[] | null>(null);
  const [selectionMode, setSelectionMode] = React.useState(false);

  const toggleSelection = React.useCallback((bookId: string) => {
    setSelectedBookIds(ids =>
      ids.includes(bookId) ? ids.filter(id => id !== bookId) : [...ids, bookId],
    );
  }, []);

  const enterSelection = React.useCallback((bookId: string) => {
    setSelectionMode(true);
    setSelectedBookIds(ids => (ids.includes(bookId) ? ids : [...ids, bookId]));
  }, []);

  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>('全部');
  const [gridView, setGridView] = React.useState(true);
  const [shelfSearchOpen, setShelfSearchOpen] = React.useState(false);
  const [shelfQuery, setShelfQuery] = React.useState('');
  const [importState, setImportState] = React.useState({
    active: false,
    message: '',
  });
  const [followChecking, setFollowChecking] = React.useState(false);
  const [followMessage, setFollowMessage] = React.useState('');
  const automaticCheckStartedRef = React.useRef(false);
  const screenMountedRef = React.useRef(true);
  const checkFollowedBooksRef = React.useRef(checkFollowedBooks);
  checkFollowedBooksRef.current = checkFollowedBooks;

  React.useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
    };
  }, []);

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
  const followedCount = books.filter(b => b.following).length;
  const unreadUpdates = books.reduce((sum, book) => sum + (book.unreadUpdates || 0), 0);
  const needsDailyFollowCheck = books.some(
    book => book.following && !isToday(book.lastUpdateCheckAt),
  );
  const shown = React.useMemo(() => {
    const keyword = shelfQuery.trim().toLowerCase();
    return applyFilter(books, filter).filter(book => {
      if (!keyword) return true;
      return `${book.title} ${book.author}`.toLowerCase().includes(keyword);
    });
  }, [books, filter, shelfQuery]);

  const openBookFinder = React.useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Search' });
  }, [navigation]);

  const onCheckFollowed = async () => {
    if (followChecking || followedCount === 0) return;
    setFollowChecking(true);
    try {
      const result = await checkFollowedBooks({ cacheNewChapters: true });
      setFollowMessage(formatFollowResult(result));
    } finally {
      setFollowChecking(false);
    }
  };

  React.useEffect(() => {
    if (
      !libraryHydrated ||
      followedCount === 0 ||
      !needsDailyFollowCheck ||
      automaticCheckStartedRef.current
    ) {
      return;
    }

    automaticCheckStartedRef.current = true;
    setFollowChecking(true);
    checkFollowedBooksRef.current({ cacheNewChapters: true })
      .then(result => {
        // 自动检查保持安静：只有发现新章时才给出文字反馈，失败可由用户手动重试。
        if (screenMountedRef.current && result.updated > 0) {
          setFollowMessage(formatFollowResult(result));
        }
      })
      .finally(() => {
        if (screenMountedRef.current) setFollowChecking(false);
      });
  }, [followedCount, libraryHydrated, needsDailyFollowCheck]);

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
              {selectionMode ? `已选择 ${selectedBookIds.length} 本` : '书架'}
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
            {selectionMode ? (
              <>
                <Pressable
                  accessibilityLabel="全选书籍"
                  onPress={() => setSelectedBookIds(shown.map(book => book.id))}
                  style={[styles.iconBtn, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}
                >
                  <Icon name="select-all" size={18} color={theme.colors.text} />
                </Pressable>
                <Pressable
                  accessibilityLabel="删除已选书籍"
                  disabled={selectedBookIds.length === 0}
                  onPress={() => setPendingDeleteIds(selectedBookIds)}
                  style={[styles.iconBtn, { backgroundColor: theme.colors.danger, opacity: selectedBookIds.length ? 1 : 0.45 }, theme.shadows.sm]}
                >
                  <Icon name="delete-outline" size={18} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="取消选择"
                  onPress={() => { setSelectedBookIds([]); setSelectionMode(false); }}
                  style={[styles.iconBtn, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}
                >
                  <Icon name="close" size={18} color={theme.colors.text} />
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityLabel="批量删除书籍"
                onPress={() => setSelectionMode(true)}
                style={[styles.iconBtn, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}
              >
                <Icon name="delete-outline" size={18} color={theme.colors.text} />
              </Pressable>
            )}
            {!selectionMode ? <Pressable
              accessibilityLabel={shelfSearchOpen ? '关闭书架搜索' : '搜索书架'}
              onPress={() => {
                setShelfSearchOpen(open => !open);
                if (shelfSearchOpen) setShelfQuery('');
              }}
              style={[
                styles.iconBtn,
                { backgroundColor: theme.colors.surface },
                theme.shadows.sm,
              ]}
            >
              <Icon name="search" size={18} color={theme.colors.text} />
            </Pressable> : null}
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

        {shelfSearchOpen ? (
          <View style={[styles.shelfSearch, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Icon name="search" size={17} color={theme.colors.textSecondary} />
            <TextInput
              value={shelfQuery}
              onChangeText={setShelfQuery}
              placeholder="在书架中搜索书名、作者"
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
              style={[styles.shelfSearchInput, { color: theme.colors.text }]}
            />
            {shelfQuery ? <Pressable onPress={() => setShelfQuery('')} hitSlop={8}><Icon name="close" size={17} color={theme.colors.textSecondary} /></Pressable> : null}
          </View>
        ) : null}

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

        {followedCount > 0 ? (
          <Pressable onPress={onCheckFollowed} disabled={followChecking} style={[styles.followBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Icon name="notifications-active" size={18} color={theme.colors.accentDark} />
            <Text style={[styles.followText, { color: theme.colors.text }]}>{followChecking ? '正在检查追更…' : unreadUpdates > 0 ? `追更更新：${unreadUpdates} 章` : `检查 ${followedCount} 本追更书`}</Text>
            <Icon name="chevron-right" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        ) : null}
        {followMessage ? <Text style={[styles.followMessage, { color: theme.colors.textSecondary }]}>{followMessage}</Text> : null}

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
              书架空空如也，先去搜一本喜欢的书
            </Text>
            <Pressable
              onPress={openBookFinder}
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
                去搜书
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
        ) : shown.length === 0 ? (
          <View style={styles.emptyFiltered}>
            <Icon name="search-off" size={32} color={theme.colors.textSecondary} />
            <Text variant="body" color="textSecondary" style={{ marginTop: 10 }}>
              书架中没有匹配的书籍
            </Text>
          </View>
        ) : gridView ? (
          <View style={styles.grid}>
            {shown.map(b => {
              const artwork = coverArtworkForId(b.id);
              const verticalTitle = isShortChineseText(b.title);
              const longVerticalTitle =
                verticalTitle && Array.from(b.title.trim()).length >= 6;
              const coverTitleSize = longVerticalTitle
                ? 15
                : coverTitleFontSize(b.title, 19);
              const badge =
                (b.unreadUpdates || 0) > 0
                  ? { label: `更新 ${b.unreadUpdates}`, color: theme.colors.accent }
                  : b.progress >= 100
                  ? { label: '完结', color: theme.colors.gold }
                  : b.fileFormat === 'txt'
                  ? { label: '导入', color: theme.colors.accent }
                  : null;
              return (
                <Pressable
                  key={b.id}
                  style={styles.gridItem}
                  onPress={() => selectionMode ? toggleSelection(b.id) : navigation.navigate('BookDetail', { bookId: b.id })}
                  onLongPress={() => enterSelection(b.id)}
                  delayLongPress={350}
                >
                  <ImageBackground
                    source={artwork.source}
                    resizeMode="cover"
                    style={[styles.cover, theme.shadows.sm]}
                    imageStyle={styles.coverImage}
                  >
                    <LinearGradient
                      colors={['rgba(9,12,12,.02)', 'rgba(9,12,12,.28)']}
                      style={styles.coverShade}
                    />
                    <View
                      style={[
                        styles.coverTitleLayer,
                        longVerticalTitle && styles.coverTitleLayerLong,
                      ]}
                    >
                      <Text
                        style={[
                          styles.coverText,
                          !verticalTitle && styles.coverTextHorizontal,
                          {
                            color: artwork.ink,
                            fontSize: coverTitleSize,
                            lineHeight: coverTitleSize + 3,
                          },
                        ]}
                        numberOfLines={verticalTitle ? 8 : 3}
                        maxFontSizeMultiplier={1}
                      >
                        {verticalCoverText(b.title)}
                      </Text>
                      <Text
                        style={[
                          styles.coverAuthor,
                          longVerticalTitle && styles.coverAuthorBeside,
                          { color: artwork.ink },
                        ]}
                        numberOfLines={5}
                        maxFontSizeMultiplier={1}
                      >
                        {verticalCoverText(
                          b.author === '本地导入' ? b.author : `${b.author}著`,
                        )}
                      </Text>
                    </View>
                    <View style={styles.coverProgress}>
                      <Text style={styles.coverProgressText} maxFontSizeMultiplier={1}>
                        读至 {Math.round(b.progress)}%
                      </Text>
                      <View style={styles.coverProgressTrack}>
                        <View
                          style={[
                            styles.coverProgressFill,
                            {
                              backgroundColor: theme.colors.accent,
                              width: `${Math.max(0, Math.min(100, b.progress))}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
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
                  </ImageBackground>
                  {selectionMode ? (
                    <View style={[styles.selectionBadge, { backgroundColor: selectedBookIds.includes(b.id) ? theme.colors.accentDark : theme.colors.surface, borderColor: theme.colors.border }]}>
                      <Icon name={selectedBookIds.includes(b.id) ? 'check' : 'add'} size={15} color={selectedBookIds.includes(b.id) ? '#fff' : theme.colors.textSecondary} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            {!selectionMode ? <Pressable
              style={styles.gridItem}
              onPress={openBookFinder}
            >
              <View
                style={[
                  styles.cover,
                  styles.addTile,
                  { borderColor: theme.colors.border },
                ]}
              >
                <View style={styles.addTileContent}>
                  <Icon
                    name="add"
                    size={26}
                    color={theme.colors.textSecondary}
                    style={styles.addTileIcon}
                  />
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={styles.addTileText}
                  >
                    去搜书
                  </Text>
                </View>
              </View>
            </Pressable> : null}
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
                onPress={() => selectionMode ? toggleSelection(b.id) : navigation.navigate('BookDetail', { bookId: b.id })}
                onLongPress={() => enterSelection(b.id)}
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
                {selectionMode ? <Icon name={selectedBookIds.includes(b.id) ? 'check-circle' : 'radio-button-unchecked'} size={21} color={selectedBookIds.includes(b.id) ? theme.colors.accentDark : theme.colors.textSecondary} /> : null}
              </Pressable>
            ))}
            {!selectionMode ? <Pressable
              onPress={openBookFinder}
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
                去搜书
              </Text>
            </Pressable> : null}
            {!selectionMode ? <Pressable
              onPress={handleImportTxt}
              disabled={importState.active}
              style={styles.listSecondaryImport}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 13.5 }}>
                导入本地 TXT
              </Text>
            </Pressable> : null}
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
      {pendingDeleteIds ? (
        <View style={styles.deleteBackdrop}>
          <View
            style={[
              styles.deleteDialog,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <Text style={[styles.deleteTitle, { color: theme.colors.text }]}>移到回收站</Text>
            <Text style={[styles.deleteMessage, { color: theme.colors.textSecondary }]}>
              {pendingDeleteIds.length} 本书将移出书架。章节缓存、阅读进度与书签都会保留，
              可在「我的 - 回收站」还原。
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteButton, { borderColor: theme.colors.border }]}
                onPress={() => setPendingDeleteIds(null)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteButton, { backgroundColor: theme.colors.danger }]}
                onPress={() => {
                  pendingDeleteIds.forEach(removeBook);
                  setPendingDeleteIds(null);
                  setSelectedBookIds([]);
                  setSelectionMode(false);
                }}
              >
                <Text style={styles.deleteConfirmText}>移到回收站</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const COVER_HEIGHT_RATIO = 2.06;

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
    lineHeight: 36,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  shelfSearch: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    marginHorizontal: 20,
    marginTop: 6,
    paddingHorizontal: 12,
  },
  shelfSearchInput: { flex: 1, fontSize: 13.5, padding: 0 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { marginTop: 14, paddingHorizontal: 20 },
  followBar: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  followText: { flex: 1, fontSize: 13, fontWeight: '600', marginLeft: 8 },
  followMessage: { fontSize: 12, marginHorizontal: 20, marginTop: 7 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyFiltered: { alignItems: 'center', paddingTop: 52, paddingHorizontal: 32 },
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
    borderRadius: 7,
    overflow: 'hidden',
  },
  coverImage: { borderRadius: 7 },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
  },
  coverTitleLayer: {
    alignItems: 'flex-start',
    bottom: 45,
    left: 13,
    position: 'absolute',
    right: 10,
    top: 24,
  },
  coverTitleLayerLong: {
    flexDirection: 'row',
  },
  badge: {
    alignItems: 'center',
    borderBottomLeftRadius: 7,
    borderTopRightRadius: 7,
    height: 22,
    justifyContent: 'center',
    minWidth: 39,
    paddingHorizontal: 7,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
    elevation: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  coverText: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    letterSpacing: 0.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  coverTextHorizontal: {
    alignSelf: 'stretch',
    marginTop: 34,
  },
  coverAuthor: {
    fontFamily: SERIF_FONT,
    fontSize: 9,
    lineHeight: 11,
    marginTop: 6,
    opacity: 0.82,
    textAlign: 'center',
  },
  coverAuthorBeside: {
    alignSelf: 'flex-end',
    marginLeft: 7,
    marginTop: 0,
  },
  coverProgress: {
    bottom: 10,
    left: 10,
    position: 'absolute',
    right: 10,
  },
  coverProgressText: {
    color: '#f6f1e9',
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
    textShadowColor: 'rgba(0,0,0,.42)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  coverProgressTrack: {
    backgroundColor: 'rgba(255,255,255,.2)',
    borderRadius: 2,
    height: 3,
    marginTop: 5,
    overflow: 'hidden',
  },
  coverProgressFill: {
    borderRadius: 2,
    height: '100%',
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addTileContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileIcon: {
    height: 26,
    lineHeight: 26,
    textAlign: 'center',
    width: 26,
  },
  addTileText: {
    lineHeight: 15,
    marginTop: 6,
    textAlign: 'center',
    width: '100%',
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
  selectionBadge: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 5,
    top: 5,
    width: 24,
    zIndex: 3,
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
