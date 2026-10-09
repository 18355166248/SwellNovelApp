import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Keyboard,
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
import { resolveSource } from '../services/source/registry';

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
  const [addingError, setAddingError] = React.useState('');
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
    setAddingError('');
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
      setAddingError('');
      try {
        const results = await searchNovels(keyword, {
          // 输入变化或开始添加后停止旧搜索的后续兜底和分批回传，迟到结果不改新 UI。
          isCancelled: () => !requestCoordinator.isLatest(requestToken),
          onResults: results => {
            if (requestCoordinator.isLatest(requestToken))
              setOnlineResults(results);
          },
        });
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
    (url?: string) => {
      Keyboard.dismiss();
      if (url) navigation.navigate('InAppBrowser', { initialUrl: url });
      // 入口每次使用新页面，避免复用浏览器时继承旧网页和 initialUrl 参数。
      else navigation.push('InAppBrowser');
    },
    [navigation],
  );

  const importOnlineUrl = React.useCallback(
    async (url: string) => {
      const requestToken = requestCoordinator.startAdding(url);
      if (requestToken === null) return;
      const existing = allBooks.find(book => isSameOnlineBook(book, url));
      if (existing) {
        if (requestCoordinator.finishAdding(requestToken)) {
          setOnlineState('done');
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
        setOnlineState('done');
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
      // 搜索、历史选词和链接导入共用入口，先收起键盘以便直接查看结果或网页。
      Keyboard.dismiss();
      // 已验证直连的书源走专用解析以取齐分页；需要浏览器会话的站点仍保留可见网页导入。
      if (isUrl(trimmed)) {
        invalidateOnlineActivity();
        if (
          Platform.OS === 'web' ||
          resolveSource(trimmed)?.preferDirectImport
        ) {
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
      // 点击已回传结果会结束本轮搜索，添加失败时保留当前列表，让用户重试或换源。
      setOnlineState('done');
      setAddingError('');
      const existing = allBooks.find(book =>
        isSameOnlineBook(book, result.url),
      );
      if (existing) {
        if (requestCoordinator.finishAdding(requestToken)) {
          navigation.navigate('BookDetail', { bookId: existing.id });
        }
        return;
      }
      if (
        Platform.OS !== 'web' &&
        !resolveSource(result.url)?.preferDirectImport
      ) {
        // 依赖浏览器会话的长目录不能挤进直连入库的 45 秒预算；与粘贴链接入口保持一致。
        if (requestCoordinator.finishAdding(requestToken))
          openBrowser(result.url);
        return;
      }
      setAddingUrl(result.url);
      try {
        const book = await addOnlineBook(result.url);
        if (!requestCoordinator.isLatest(requestToken)) return;
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
        if (!requestCoordinator.isLatest(requestToken)) return;
        setAddingError(
          error instanceof Error && error.message
            ? `添加失败：${error.message}`
            : '添加失败，请检查网络后重试',
        );
      } finally {
        if (requestCoordinator.finishAdding(requestToken)) {
          setAddingUrl(null);
        }
      }
    },
    [addOnlineBook, allBooks, navigation, openBrowser, requestCoordinator],
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
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.colors.text }]}>搜书</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            {Platform.OS === 'web'
              ? '搜书名，或粘贴受支持书源链接'
              : '按书名或作者查找，找到后加入书架'}
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
            {hasQuery ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清空搜索内容"
                onPress={() => handleQueryChange('')}
                style={styles.clearQueryButton}
              >
                <Icon
                  name="close"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            ) : null}
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
                backgroundColor: theme.colors.accentDark,
                borderColor: theme.colors.accentDark,
              },
              searchDisabled && styles.disabledControl,
            ]}
          >
            <Text
              style={{
                color: '#fff',
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

        {!hasQuery &&
          (Platform.OS === 'web' ? (
            <View
              accessible
              accessibilityLabel="链接导入提示：将受支持的小说网页链接粘贴到上方输入框"
              style={[
                styles.importCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
                theme.shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.importIcon,
                  { backgroundColor: theme.colors.background },
                ]}
              >
                <Icon name="link" size={22} color={theme.colors.accentDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.importTitle,
                    { color: theme.colors.accentDark },
                  ]}
                >
                  粘贴链接导入
                </Text>
                <Text
                  style={[
                    styles.importHint,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  将支持的小说详情页链接粘贴到上方输入框
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开网站导入"
              accessibilityHint="打开小说站后可自动识别书名、目录与分页"
              onPress={() => openBrowser()}
              style={[
                styles.importCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
                theme.shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.importIcon,
                  { backgroundColor: theme.colors.background },
                ]}
              >
                <Icon
                  name="language"
                  size={22}
                  color={theme.colors.accentDark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.importTitle,
                    { color: theme.colors.accentDark },
                  ]}
                >
                  网站导入
                </Text>
                <Text
                  style={[
                    styles.importHint,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  浏览小说目录，识别后加入书架
                </Text>
              </View>
              <Icon
                name="arrow-forward"
                size={20}
                color={theme.colors.accentDark}
              />
            </Pressable>
          ))}

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
            {history.length > 0 ? (
              <>
                <View style={styles.sectionHeading}>
                  <Text variant="label">最近搜索</Text>
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
              <View style={styles.emptyState}>
                <Icon
                  name="search"
                  size={30}
                  color={theme.colors.textSecondary}
                />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  输入书名，开始找书
                </Text>
                <Text
                  variant="caption"
                  color="textSecondary"
                  style={styles.emptyHint}
                >
                  搜索结果可直接加入书架。已有小说网址，也可粘贴到上方导入。
                </Text>
              </View>
            )}
          </View>
        )}

        {hasQuery && !isUrl(query) && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text variant="label">搜索结果</Text>
              {onlineResults.length > 0 ? (
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
                  {onlineResults.length
                    ? `已找到 ${onlineResults.length} 本，正在继续搜索…`
                    : `正在搜索「${query.trim()}」…`}
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="重新搜索小说"
                  onPress={() => commitSearch(query)}
                  style={styles.fallbackLink}
                >
                  <Icon name="refresh" size={15} color={theme.colors.accent} />
                  <Text
                    style={[
                      styles.fallbackText,
                      { color: theme.colors.accent },
                    ]}
                  >
                    重试搜索
                  </Text>
                </Pressable>
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
                    accessibilityLabel="搜索失败，改用网站导入"
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
                      改用网站导入
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {onlineState === 'empty' && (
              <View>
                <Text variant="caption" color="textSecondary">
                  当前书源没有找到匹配书籍，可试试完整书名或作者名。
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
                    accessibilityLabel="没有搜索结果，改用网站导入"
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
                      换网站导入试试
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {addingError ? (
              <View accessibilityLiveRegion="polite" style={styles.addingError}>
                <Text
                  variant="caption"
                  style={[styles.errorText, { color: theme.colors.danger }]}
                >
                  {addingError}，可重试或选择其他书源。
                </Text>
              </View>
            ) : null}
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
                  const browserImport =
                    Platform.OS !== 'web' &&
                    !resolveSource(result.url)?.preferDirectImport;
                  const resultDisabled = addingUrl !== null;
                  return (
                    <Pressable
                      key={result.url}
                      accessibilityRole="button"
                      accessibilityLabel={`${result.title}${
                        result.author ? `，作者 ${result.author}` : ''
                      }，来源 ${result.sourceName}，${
                        existing
                          ? '已在书架，打开详情'
                          : browserImport
                          ? '打开网页加入书架'
                          : '加入书架'
                      }`}
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
                          numberOfLines={2}
                          style={{
                            fontSize: 15,
                            lineHeight: 23,
                            fontWeight: '600',
                            color: theme.colors.text,
                          }}
                        >
                          {result.title}
                        </Text>
                        <Text
                          variant="caption"
                          color="textSecondary"
                          style={{ marginTop: 2 }}
                        >
                          {result.author ? `${result.author} · ` : ''}
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
                        <Text
                          style={{ color: theme.colors.accent, fontSize: 11.5 }}
                        >
                          {browserImport ? '打开网页' : '加入书架'}
                        </Text>
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
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  clearQueryButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    width: 76,
    paddingHorizontal: 12,
  },
  importCard: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  importIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  importHint: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  linkImportState: { paddingHorizontal: 20, paddingTop: 12 },
  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 42,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyHint: { lineHeight: 20, textAlign: 'center', marginTop: 8 },
  errorText: { lineHeight: 18 },
  addingError: { marginBottom: 12 },
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
