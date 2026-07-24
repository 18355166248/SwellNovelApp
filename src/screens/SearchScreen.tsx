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
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAtom } from 'jotai';
import {
  useBookSearch,
  searchHistoryAtom,
  useAllBooks,
  useAddOnlineBook,
  useRemoveBook,
} from '../store';
import { paletteForId, COVER_GRADIENT_DIRECTION } from '../theme/readerThemes';
import {
  isNovelSearchSupported,
  searchNovels,
  NovelSearchResult,
} from '../services/search/novelSearch';
import { confirmAction } from '../utils/confirm';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const RANK_COLORS = ['#c25a3a', '#c9852f', '#2e6b5e', '#9aa39a', '#9aa39a'];

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { query, setQuery, results } = useBookSearch();
  const [history, setHistory] = useAtom(searchHistoryAtom);
  const allBooks = useAllBooks();
  const addOnlineBook = useAddOnlineBook();
  const removeBook = useRemoveBook();

  // 在线搜书（仅原生）：把书名经搜索引擎解析成受支持书源的书籍链接。
  const [onlineResults, setOnlineResults] = React.useState<NovelSearchResult[]>(
    [],
  );
  const [onlineState, setOnlineState] = React.useState<
    'idle' | 'loading' | 'error' | 'empty' | 'done'
  >('idle');
  const [onlineError, setOnlineError] = React.useState('');
  const [addingUrl, setAddingUrl] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<'shelf' | 'network'>('shelf');
  const searchSeqRef = React.useRef(0);

  const runOnlineSearch = React.useCallback(
    async (kw: string) => {
      if (!isNovelSearchSupported || !kw.trim()) return;
      const seq = ++searchSeqRef.current;
      setOnlineState('loading');
      setOnlineResults([]);
      setOnlineError('');
      try {
        const res = await searchNovels(kw);
        if (seq !== searchSeqRef.current) return; // 已有更新的搜索，丢弃旧结果
        setOnlineResults(res);
        setOnlineState(res.length ? 'done' : 'empty');
      } catch (error) {
        if (seq === searchSeqRef.current) {
          setOnlineError(
            error instanceof Error && error.message
              ? error.message
              : '请检查网络后重试',
          );
          setOnlineState('error');
        }
      }
    },
    [],
  );

  const onTapOnline = React.useCallback(
    async (r: NovelSearchResult) => {
      const existing = allBooks.find(book => book.source?.bookUrl === r.url);
      if (existing) {
        navigation.navigate('BookDetail', { bookId: existing.id });
        return;
      }
      if (addingUrl) return;
      setAddingUrl(r.url);
      try {
        const book = await addOnlineBook(r.url);
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
        // 加书失败必须保留底层原因；此前只显示“搜索失败”，真机无法判断是书源还是代理异常。
        setOnlineError(
          error instanceof Error && error.message
            ? `添加失败：${error.message}`
            : '添加失败，请检查网络后重试',
        );
        setOnlineState('error');
      } finally {
        setAddingUrl(null);
      }
    },
    [addingUrl, addOnlineBook, allBooks, navigation],
  );

  const onDeleteOnlineBook = React.useCallback(
    (bookId: string, title: string) => {
      // 网络搜索页中的“已在书架”书籍允许就地移除，避免用户必须先进入详情页才能清理错误书源。
      confirmAction(
        '删除书籍',
        `确定删除《${title}》？章节缓存、阅读进度与书签都会被永久清除。`,
        () => removeBook(bookId),
      );
    },
    [removeBook],
  );
  // 本地阅读器无热搜后端，改为按最近阅读/加入列出书库速览。
  const shelf = React.useMemo(
    () =>
      [...allBooks]
        .sort((a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt))
        .slice(0, 8),
    [allBooks],
  );

  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    setQuery(trimmed);
    if (trimmed) {
      setOnlineError('');
      // 去重后置顶，最多保留 8 条；持久化到本地。
      setHistory(prev => [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, 8));
      if (scope === 'network') runOnlineSearch(trimmed);
    } else {
      setOnlineState('idle');
      setOnlineResults([]);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <Icon name="search" size={16} color={theme.colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => commitSearch(query)}
              placeholder="搜索书名、作者"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.searchInput, { color: theme.colors.text }]}
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={() => commitSearch(query)}
            style={styles.searchBtn}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontSize: 14,
                fontWeight: Platform.select({ ios: '600', android: 'bold' }),
              }}
            >
              搜索
            </Text>
          </Pressable>
        </View>

        <View style={[styles.scopeControl, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {([
            ['shelf', '书架'],
            ['network', '网络'],
          ] as const).map(([value, label]) => {
            const active = scope === value;
            return (
              <Pressable key={value} onPress={() => { setScope(value); if (value === 'network' && query.trim()) runOnlineSearch(query); }} style={[styles.scopeOption, active && { backgroundColor: theme.colors.accentDark }]}>
                <Text style={{ color: active ? '#fff' : theme.colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => navigation.navigate('InAppBrowser')}
          style={[
            styles.browserEntry,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Icon name="public" size={18} color={theme.colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, color: theme.colors.text }}>
              内置浏览器搜书
            </Text>
            <Text variant="caption" color="textSecondary" style={{ marginTop: 1 }}>
              浏览任意小说站，自动识别书籍加入书架
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </Pressable>

        {scope === 'shelf' && query.trim().length > 0 && (
          <View style={styles.section}>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginBottom: 10 }}
            >
              找到 {results.length} 个结果
            </Text>
            {results.length === 0 ? (
              <Text variant="body" color="textSecondary">
                没有找到匹配的书籍
              </Text>
            ) : (
              results.map(r => {
                const palette = paletteForId(r.id);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() =>
                      navigation.navigate('BookDetail', { bookId: r.id })
                    }
                    style={[
                      styles.resultRow,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <LinearGradient
                      colors={[palette.from, palette.to]}
                      {...COVER_GRADIENT_DIRECTION}
                      style={[styles.resultCover, theme.shadows.sm]}
                    >
                      <Text
                        style={[styles.resultCoverText, { color: palette.ink }]}
                        numberOfLines={2}
                      >
                        {r.title}
                      </Text>
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 13 }}>
                      <View style={styles.resultTitleRow}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <View
                          style={[
                            styles.statusTag,
                            {
                              borderColor:
                                r.progress >= 100
                                  ? theme.colors.badgeMuted
                                  : theme.colors.danger,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color:
                                r.progress >= 100
                                  ? theme.colors.badgeMuted
                                  : theme.colors.danger,
                            }}
                          >
                            {r.progress >= 100 ? '已完结' : '连载中'}
                          </Text>
                        </View>
                      </View>
                      <Text
                        variant="caption"
                        color="textSecondary"
                        style={{ marginTop: 4 }}
                      >
                        {r.author} ·{' '}
                        {r.fileFormat === 'txt' ? '本地导入' : '在线书库'}
                      </Text>
                      {!!r.description && (
                        <Text
                          numberOfLines={2}
                          style={{
                            fontSize: 12,
                            color: theme.colors.textSecondary,
                            marginTop: 6,
                            lineHeight: 18.5,
                          }}
                        >
                          {r.description}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.colors.accent,
                          marginTop: 6,
                        }}
                      >
                        共 {r.totalChapters ?? '–'} 章 · 已读 {r.progress}%
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {scope === 'network' && isNovelSearchSupported && query.trim().length > 0 && (
          <View style={styles.section}>
            <Text variant="label" style={{ marginBottom: 12 }}>
              网络搜书
            </Text>
            {onlineState === 'loading' && (
              <Text variant="caption" color="textSecondary">
                正在从书源搜索「{query.trim()}」…
              </Text>
            )}
            {onlineState === 'error' && (
              <Text
                variant="caption"
                style={{ color: theme.colors.danger, lineHeight: 18 }}
              >
                {onlineError || '搜索失败，请检查网络后重试'}
              </Text>
            )}
            {onlineState === 'empty' && (
              <Text variant="caption" color="textSecondary">
                没有找到可添加的网络书籍，可换个关键词试试
              </Text>
            )}
            {onlineResults.length > 0 && (
              <View
                style={[
                  styles.hotList,
                  { backgroundColor: theme.colors.surface },
                  theme.shadows.sm,
                ]}
              >
                {onlineResults.map(r => {
                  const existing = allBooks.find(book => book.source?.bookUrl === r.url);
                  return <Pressable
                    key={r.url}
                    onPress={() => onTapOnline(r)}
                    style={[
                      styles.onlineRow,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <Icon
                      name="cloud-download"
                      size={18}
                      color={theme.colors.accentDark}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 13.5, color: theme.colors.text }}
                      >
                        {r.title}
                      </Text>
                      <Text
                        variant="caption"
                        color="textSecondary"
                        style={{ marginTop: 2 }}
                      >
                        {r.sourceName}
                      </Text>
                    </View>
                    {addingUrl === r.url ? (
                      <Text variant="caption" color="textSecondary">
                        添加中…
                      </Text>
                    ) : existing ? (
                      <View style={styles.onlineActions}>
                        <Text style={[styles.inShelfText, { color: theme.colors.accent }]}>已在书架</Text>
                        <Pressable
                          accessibilityLabel={`删除${r.title}`}
                          hitSlop={8}
                          onPress={event => {
                            event.stopPropagation();
                            onDeleteOnlineBook(existing.id, existing.title);
                          }}
                          style={styles.onlineDeleteButton}
                        >
                          <Icon name="delete-outline" size={18} color={theme.colors.danger} />
                        </Pressable>
                      </View>
                    ) : (
                      <Icon
                        name="add"
                        size={18}
                        color={theme.colors.textSecondary}
                      />
                    )}
                  </Pressable>;
                })}
              </View>
            )}
          </View>
        )}

        {scope === 'shelf' && <View style={styles.section}>
          {history.length > 0 && (
            <>
              <View style={styles.rowBetween}>
                <Text variant="label">搜索历史</Text>
                <Pressable onPress={() => setHistory([])}>
                  <Icon
                    name="delete-outline"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {history.map(h => (
                  <Pressable
                    key={h}
                    onPress={() => commitSearch(h)}
                    style={[
                      styles.historyChip,
                      { backgroundColor: theme.colors.surface },
                      theme.shadows.sm,
                    ]}
                  >
                    <Text style={{ fontSize: 12.5, color: theme.colors.text }}>
                      {h}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {shelf.length > 0 && (
            <>
              <Text
                variant="label"
                style={{ marginTop: history.length ? 22 : 0, marginBottom: 12 }}
              >
                书库速览
              </Text>
              <View
                style={[
                  styles.hotList,
                  { backgroundColor: theme.colors.surface },
                  theme.shadows.sm,
                ]}
              >
                {shelf.map((b, i) => (
                  <Pressable
                    key={b.id}
                    onPress={() =>
                      navigation.navigate('BookDetail', { bookId: b.id })
                    }
                    style={[
                      styles.hotRow,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.hotRank,
                        { color: RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)] },
                      ]}
                    >
                      {i + 1}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 13.5,
                        color: theme.colors.text,
                      }}
                    >
                      {b.title}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {`已读 ${b.progress}%`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scopeControl: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    marginLeft: 62,
    marginTop: 2,
    overflow: 'hidden',
  },
  scopeOption: { alignItems: 'center', minWidth: 64, paddingVertical: 7 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchBtn: { paddingHorizontal: 2 },
  section: { paddingHorizontal: 20, paddingTop: 14 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  hotList: { borderRadius: 8, overflow: 'hidden' },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  onlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginLeft: 10,
  },
  inShelfText: {
    fontSize: 11,
  },
  onlineDeleteButton: {
    padding: 3,
  },
  browserEntry: {
    marginHorizontal: 20,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  hotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  hotRank: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    width: 16,
  },
  resultRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  resultCover: {
    width: 62,
    height: 84,
    borderRadius: 6,
    padding: 7,
    justifyContent: 'flex-end',
  },
  resultCoverText: {
    fontFamily: SERIF_FONT,
    fontSize: 14,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    lineHeight: 17,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  resultTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    flexShrink: 1,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
});
