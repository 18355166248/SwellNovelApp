import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAtom } from 'jotai';
import { searchHistoryAtom, useAddOnlineBook, useAllBooks } from '../store';
import {
  isNovelSearchSupported,
  searchNovels,
  NovelSearchResult,
} from '../services/search/novelSearch';
import { isSameOnlineBook } from '../utils/addOnlineBook';
import { createSearchRequestCoordinator } from './searchRequestCoordinator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function isUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [query, setQuery] = React.useState('');
  const [history, setHistory] = useAtom(searchHistoryAtom);
  const allBooks = useAllBooks();
  const addOnlineBook = useAddOnlineBook();
  const [onlineResults, setOnlineResults] = React.useState<NovelSearchResult[]>(
    [],
  );
  const [onlineState, setOnlineState] = React.useState<
    'idle' | 'loading' | 'error' | 'empty' | 'done'
  >('idle');
  const [onlineError, setOnlineError] = React.useState('');
  const [addingUrl, setAddingUrl] = React.useState<string | null>(null);
  const requestCoordinatorRef = React.useRef<ReturnType<
    typeof createSearchRequestCoordinator
  > | null>(null);
  if (!requestCoordinatorRef.current) {
    requestCoordinatorRef.current = createSearchRequestCoordinator();
  }
  const requestCoordinator = requestCoordinatorRef.current;

  React.useEffect(
    () => () => {
      // 页面卸载后，迟到的请求不得再导航回详情页。
      requestCoordinator.invalidate();
    },
    [requestCoordinator],
  );

  const invalidateOnlineActivity = React.useCallback(() => {
    requestCoordinator.invalidate();
    setAddingUrl(null);
    setOnlineState('idle');
    setOnlineResults([]);
    setOnlineError('');
  }, [requestCoordinator]);

  const handleQueryChange = React.useCallback(
    (value: string) => {
      setQuery(value);
      // 输入一变就释放旧 UI；已开始的入库可以完成，但不得再导航或污染新关键词状态。
      invalidateOnlineActivity();
    },
    [invalidateOnlineActivity],
  );

  const runOnlineSearch = React.useCallback(
    async (keyword: string) => {
      if (!isNovelSearchSupported || !keyword.trim()) return;
      const requestToken = requestCoordinator.startSearch();
      setAddingUrl(null);
      setOnlineState('loading');
      setOnlineResults([]);
      setOnlineError('');
      try {
        const results = await searchNovels(keyword);
        if (!requestCoordinator.isLatest(requestToken)) return;
        setOnlineResults(results);
        setOnlineState(results.length ? 'done' : 'empty');
      } catch (error) {
        if (!requestCoordinator.isLatest(requestToken)) return;
        setOnlineError(
          error instanceof Error && error.message
            ? error.message
            : '请检查网络后重试',
        );
        setOnlineState('error');
      }
    },
    [requestCoordinator],
  );

  const openBrowser = React.useCallback(
    (url?: string) =>
      navigation.navigate(
        'InAppBrowser',
        url ? { initialUrl: url } : undefined,
      ),
    [navigation],
  );

  const importOnlineUrl = React.useCallback(
    async (url: string) => {
      const requestToken = requestCoordinator.startAdding(url);
      if (requestToken === null) return;
      const existing = allBooks.find(book => isSameOnlineBook(book, url));
      if (existing) {
        if (requestCoordinator.finishAdding(requestToken)) {
          navigation.navigate('BookDetail', { bookId: existing.id });
        }
        return;
      }

      // Web 没有内置浏览器，粘贴受支持书源链接时直接走书源适配器入库。
      setAddingUrl(url);
      setOnlineState('loading');
      setOnlineError('');
      try {
        const book = await addOnlineBook(url);
        if (!requestCoordinator.isLatest(requestToken)) return;
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
        if (!requestCoordinator.isLatest(requestToken)) return;
        setOnlineError(
          error instanceof Error && error.message
            ? `导入失败：${error.message}`
            : '导入失败，请确认链接来自受支持的小说站点',
        );
        setOnlineState('error');
      } finally {
        if (requestCoordinator.finishAdding(requestToken)) {
          setAddingUrl(null);
        }
      }
    },
    [addOnlineBook, allBooks, navigation, requestCoordinator],
  );

  const commitSearch = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setQuery(trimmed);
      if (!trimmed) {
        invalidateOnlineActivity();
        return;
      }
      // 同一个输入框兼容书名与链接：粘贴 URL 时直接进入可见网页导入，避免用户先选模式。
      if (isUrl(trimmed)) {
        invalidateOnlineActivity();
        if (Platform.OS === 'web') {
          importOnlineUrl(trimmed);
        } else {
          openBrowser(trimmed);
        }
        return;
      }
      setHistory(current =>
        [trimmed, ...current.filter(item => item !== trimmed)].slice(0, 8),
      );
      runOnlineSearch(trimmed);
    },
    [
      importOnlineUrl,
      invalidateOnlineActivity,
      openBrowser,
      runOnlineSearch,
      setHistory,
    ],
  );

  const onTapOnline = React.useCallback(
    async (result: NovelSearchResult) => {
      const requestToken = requestCoordinator.startAdding(result.url);
      if (requestToken === null) return;
      const existing = allBooks.find(book =>
        isSameOnlineBook(book, result.url),
      );
      if (existing) {
        if (requestCoordinator.finishAdding(requestToken)) {
          navigation.navigate('BookDetail', { bookId: existing.id });
        }
        return;
      }
      setAddingUrl(result.url);
      try {
        const book = await addOnlineBook(result.url);
        if (!requestCoordinator.isLatest(requestToken)) return;
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
        if (!requestCoordinator.isLatest(requestToken)) return;
        setOnlineError(
          error instanceof Error && error.message
            ? `添加失败：${error.message}`
            : '添加失败，请检查网络后重试',
        );
        setOnlineState('error');
      } finally {
        if (requestCoordinator.finishAdding(requestToken)) {
          setAddingUrl(null);
        }
      }
    },
    [addOnlineBook, allBooks, navigation, requestCoordinator],
  );

  const hasQuery = query.trim().length > 0;
  const isSearching = onlineState === 'loading';
  const searchDisabled = isSearching || addingUrl !== null || !hasQuery;
  const isImportingLink = isUrl(query) && addingUrl !== null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.colors.text }]}>搜书</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            {Platform.OS === 'web'
              ? '搜书名，或粘贴受支持书源链接'
              : '搜书名，或粘贴网页链接导入'}
          </Text>
        </View>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <Icon name="search" size={18} color={theme.colors.textSecondary} />
            <TextInput
              accessibilityLabel="搜索书名、作者或小说网页链接"
              value={query}
              onChangeText={handleQueryChange}
              onSubmitEditing={() => {
                if (!searchDisabled) commitSearch(query);
              }}
              placeholder="书名、作者或小说网页链接"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.searchInput, { color: theme.colors.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isImportingLink
                ? '正在导入小说链接'
                : isSearching
                ? '正在搜索'
                : isUrl(query)
                ? '导入小说网页链接'
                : '搜索小说'
            }
            accessibilityState={{
              disabled: searchDisabled,
              busy: isSearching || isImportingLink,
            }}
            disabled={searchDisabled}
            onPress={() => commitSearch(query)}
            style={[
              styles.searchBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              searchDisabled && styles.disabledControl,
            ]}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontSize: 14,
                fontWeight: Platform.select({ ios: '600', android: 'bold' }),
              }}
            >
              {isImportingLink
                ? '导入中'
                : isSearching
                ? '搜索中'
                : isUrl(query)
                ? '导入'
                : '搜索'}
            </Text>
          </Pressable>
        </View>

        {Platform.OS === 'web' ? (
          <View
            accessible
            accessibilityLabel="链接导入提示：将受支持的小说网页链接粘贴到上方输入框"
            style={[
              styles.importCard,
              { backgroundColor: theme.colors.accentDark },
              theme.shadows.md,
            ]}
          >
            <View style={styles.importIcon}>
              <Icon name="link" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.importTitle}>粘贴链接导入</Text>
              <Text style={styles.importHint}>
                将支持的小说详情页链接粘贴到上方输入框
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开网页或链接导入"
            accessibilityHint="打开小说站后可自动识别书名、目录与分页"
            onPress={() => openBrowser()}
            style={[
              styles.importCard,
              { backgroundColor: theme.colors.accentDark },
              theme.shadows.md,
            ]}
          >
            <View style={styles.importIcon}>
              <Icon name="language" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.importTitle}>网页 / 链接导入</Text>
              <Text style={styles.importHint}>
                打开小说站，自动识别书名、目录与分页
              </Text>
            </View>
            <Icon name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        )}

        {hasQuery && isUrl(query) && onlineState === 'error' ? (
          <View accessibilityLiveRegion="polite" style={styles.linkImportState}>
            <Text
              variant="caption"
              style={[styles.errorText, { color: theme.colors.danger }]}
            >
              {onlineError}
            </Text>
          </View>
        ) : null}

        {!hasQuery && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text variant="label">全网搜书</Text>
              <Text variant="caption" color="textSecondary">
                输入书名或作者开始搜索
              </Text>
            </View>
            {history.length > 0 ? (
              <>
                <View style={styles.rowBetween}>
                  <Text variant="caption" color="textSecondary">
                    最近搜索
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="清空最近搜索"
                    onPress={() => setHistory([])}
                    style={styles.clearHistoryButton}
                  >
                    <Text variant="caption" color="textSecondary">
                      清空
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.chipWrap}>
                  {history.map(item => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityLabel={`搜索历史：${item}`}
                      onPress={() => commitSearch(item)}
                      style={[
                        styles.historyChip,
                        { backgroundColor: theme.colors.surface },
                      ]}
                    >
                      <Icon
                        name="history"
                        size={14}
                        color={theme.colors.textSecondary}
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: 12.5,
                          maxWidth: 160,
                        }}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text
                variant="caption"
                color="textSecondary"
                style={styles.emptyHint}
              >
                网络搜索结果可直接加入书架；已有书籍请在“书架”内筛选。
              </Text>
            )}
          </View>
        )}

        {hasQuery && !isUrl(query) && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text variant="label">搜索结果</Text>
              {onlineState === 'done' ? (
                <Text variant="caption" color="textSecondary">
                  {onlineResults.length} 本
                </Text>
              ) : null}
            </View>
            {onlineState === 'idle' && (
              <Text variant="caption" color="textSecondary">
                输入完成后点击“搜索”，开始查找小说。
              </Text>
            )}
            {onlineState === 'loading' && (
              <View accessibilityLiveRegion="polite">
                <Text variant="caption" color="textSecondary">
                  正在搜索「{query.trim()}」…
                </Text>
              </View>
            )}
            {onlineState === 'error' && (
              <View accessibilityLiveRegion="polite">
                <Text
                  variant="caption"
                  style={[styles.errorText, { color: theme.colors.danger }]}
                >
                  {onlineError || '搜索失败，请检查网络后重试'}
                </Text>
                {Platform.OS === 'web' ? (
                  <Text
                    style={[
                      styles.fallbackText,
                      { color: theme.colors.accent },
                    ]}
                  >
                    可粘贴受支持的书源链接直接导入
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="搜索失败，改用网页导入"
                    onPress={() => openBrowser()}
                    style={styles.fallbackLink}
                  >
                    <Icon
                      name="language"
                      size={15}
                      color={theme.colors.accent}
                    />
                    <Text
                      style={[
                        styles.fallbackText,
                        { color: theme.colors.accent },
                      ]}
                    >
                      改用网页导入
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {onlineState === 'empty' && (
              <View>
                <Text variant="caption" color="textSecondary">
                  没有找到匹配书籍。
                </Text>
                {Platform.OS === 'web' ? (
                  <Text
                    style={[
                      styles.fallbackText,
                      { color: theme.colors.accent },
                    ]}
                  >
                    也可粘贴受支持的书源链接直接导入
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="没有搜索结果，改用网页导入"
                    onPress={() => openBrowser()}
                    style={styles.fallbackLink}
                  >
                    <Icon
                      name="language"
                      size={15}
                      color={theme.colors.accent}
                    />
                    <Text
                      style={[
                        styles.fallbackText,
                        { color: theme.colors.accent },
                      ]}
                    >
                      换网页导入试试
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {onlineResults.length > 0 && (
              <View
                style={[
                  styles.resultList,
                  { backgroundColor: theme.colors.surface },
                  theme.shadows.sm,
                ]}
              >
                {onlineResults.map(result => {
                  const existing = allBooks.find(book =>
                    isSameOnlineBook(book, result.url),
                  );
                  const addingThisResult = addingUrl === result.url;
                  const resultDisabled = addingUrl !== null;
                  return (
                    <Pressable
                      key={result.url}
                      accessibilityRole="button"
                      accessibilityLabel={`${result.title}，来源 ${
                        result.sourceName
                      }，${existing ? '已在书架，打开详情' : '加入书架'}`}
                      accessibilityState={{
                        disabled: resultDisabled,
                        busy: addingThisResult,
                      }}
                      disabled={resultDisabled}
                      onPress={() => onTapOnline(result)}
                      style={[
                        styles.resultRow,
                        {
                          borderBottomColor: theme.colors.border,
                        },
                        resultDisabled &&
                          !addingThisResult &&
                          styles.disabledControl,
                      ]}
                    >
                      <Icon
                        name={existing ? 'menu-book' : 'cloud-download'}
                        size={18}
                        color={theme.colors.accentDark}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 13.5, color: theme.colors.text }}
                        >
                          {result.title}
                        </Text>
                        <Text
                          variant="caption"
                          color="textSecondary"
                          style={{ marginTop: 2 }}
                        >
                          {result.sourceName}
                        </Text>
                      </View>
                      {addingThisResult ? (
                        <Text variant="caption" color="textSecondary">
                          添加中…
                        </Text>
                      ) : existing ? (
                        <Text
                          style={{ color: theme.colors.accent, fontSize: 11.5 }}
                        >
                          已在书架
                        </Text>
                      ) : (
                        <Icon
                          name="add"
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  heading: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  // Text 默认 body 行高小于 26px 标题字高；显式撑开以避免 iOS 裁掉中文字形顶部。
  title: {
    fontSize: 26,
    lineHeight: 36,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  subtitle: { marginTop: 3 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  searchField: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  importCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  importIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.16)',
  },
  importTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  importHint: { color: 'rgba(255,255,255,.76)', fontSize: 11.5, marginTop: 3 },
  linkImportState: { paddingHorizontal: 20, paddingTop: 12 },
  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearHistoryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: {
    maxWidth: '100%',
    minHeight: 44,
    borderRadius: 22,
    paddingVertical: 7,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyHint: { lineHeight: 19 },
  errorText: { lineHeight: 18 },
  disabledControl: { opacity: 0.55 },
  resultList: { borderRadius: 10, overflow: 'hidden' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  fallbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  fallbackText: { fontSize: 12.5 },
});
