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
  const [onlineResults, setOnlineResults] = React.useState<NovelSearchResult[]>([]);
  const [onlineState, setOnlineState] = React.useState<
    'idle' | 'loading' | 'error' | 'empty' | 'done'
  >('idle');
  const [onlineError, setOnlineError] = React.useState('');
  const [addingUrl, setAddingUrl] = React.useState<string | null>(null);
  const searchSeqRef = React.useRef(0);

  const runOnlineSearch = React.useCallback(async (keyword: string) => {
    if (!isNovelSearchSupported || !keyword.trim()) return;
    const seq = ++searchSeqRef.current;
    setOnlineState('loading');
    setOnlineResults([]);
    setOnlineError('');
    try {
      const results = await searchNovels(keyword);
      if (seq !== searchSeqRef.current) return;
      setOnlineResults(results);
      setOnlineState(results.length ? 'done' : 'empty');
    } catch (error) {
      if (seq !== searchSeqRef.current) return;
      setOnlineError(
        error instanceof Error && error.message
          ? error.message
          : '请检查网络后重试',
      );
      setOnlineState('error');
    }
  }, []);

  const openBrowser = React.useCallback(
    (url?: string) => navigation.navigate('InAppBrowser', url ? { initialUrl: url } : undefined),
    [navigation],
  );

  const commitSearch = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setQuery(trimmed);
      if (!trimmed) {
        setOnlineState('idle');
        setOnlineResults([]);
        return;
      }
      // 同一个输入框兼容书名与链接：粘贴 URL 时直接进入可见网页导入，避免用户先选模式。
      if (isUrl(trimmed)) {
        openBrowser(trimmed);
        return;
      }
      setHistory(current => [trimmed, ...current.filter(item => item !== trimmed)].slice(0, 8));
      runOnlineSearch(trimmed);
    },
    [openBrowser, runOnlineSearch, setHistory],
  );

  const onTapOnline = React.useCallback(
    async (result: NovelSearchResult) => {
      const existing = allBooks.find(book => book.source?.bookUrl === result.url);
      if (existing) {
        navigation.navigate('BookDetail', { bookId: existing.id });
        return;
      }
      if (addingUrl) return;
      setAddingUrl(result.url);
      try {
        const book = await addOnlineBook(result.url);
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
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
    [addOnlineBook, addingUrl, allBooks, navigation],
  );

  const hasQuery = query.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.colors.text }]}>搜书</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            搜书名，或粘贴网页链接导入
          </Text>
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchField, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
            <Icon name="search" size={18} color={theme.colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => commitSearch(query)}
              placeholder="书名、作者或小说网页链接"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.searchInput, { color: theme.colors.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <Pressable onPress={() => commitSearch(query)} style={styles.searchBtn}>
            <Text style={{ color: theme.colors.accent, fontSize: 14, fontWeight: Platform.select({ ios: '600', android: 'bold' }) }}>
              {isUrl(query) ? '导入' : '搜索'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => openBrowser()}
          style={[styles.importCard, { backgroundColor: theme.colors.accentDark }, theme.shadows.md]}
        >
          <View style={styles.importIcon}><Icon name="language" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importTitle}>网页 / 链接导入</Text>
            <Text style={styles.importHint}>打开小说站，自动识别书名、目录与分页</Text>
          </View>
          <Icon name="arrow-forward" size={20} color="#fff" />
        </Pressable>

        {!hasQuery && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text variant="label">全网搜书</Text>
              <Text variant="caption" color="textSecondary">输入书名或作者开始搜索</Text>
            </View>
            {history.length > 0 ? (
              <>
                <View style={styles.rowBetween}>
                  <Text variant="caption" color="textSecondary">最近搜索</Text>
                  <Pressable onPress={() => setHistory([])} hitSlop={8}>
                    <Text variant="caption" color="textSecondary">清空</Text>
                  </Pressable>
                </View>
                <View style={styles.chipWrap}>
                  {history.map(item => (
                    <Pressable key={item} onPress={() => commitSearch(item)} style={[styles.historyChip, { backgroundColor: theme.colors.surface }]}>
                      <Icon name="history" size={14} color={theme.colors.textSecondary} />
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12.5, maxWidth: 160 }}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text variant="caption" color="textSecondary" style={styles.emptyHint}>
                网络搜索结果可直接加入书架；已有书籍请在“书架”内筛选。
              </Text>
            )}
          </View>
        )}

        {hasQuery && !isUrl(query) && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text variant="label">搜索结果</Text>
              {onlineState === 'done' ? <Text variant="caption" color="textSecondary">{onlineResults.length} 本</Text> : null}
            </View>
            {onlineState === 'loading' && <Text variant="caption" color="textSecondary">正在搜索「{query.trim()}」…</Text>}
            {onlineState === 'error' && <Text variant="caption" style={{ color: theme.colors.danger, lineHeight: 18 }}>{onlineError || '搜索失败，请检查网络后重试'}</Text>}
            {onlineState === 'empty' && (
              <View>
                <Text variant="caption" color="textSecondary">没有找到匹配书籍。</Text>
                <Pressable onPress={() => openBrowser()} style={styles.fallbackLink}>
                  <Icon name="language" size={15} color={theme.colors.accent} />
                  <Text style={{ color: theme.colors.accent, fontSize: 12.5 }}>换网页导入试试</Text>
                </Pressable>
              </View>
            )}
            {onlineResults.length > 0 && (
              <View style={[styles.resultList, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
                {onlineResults.map(result => {
                  const existing = allBooks.find(book => book.source?.bookUrl === result.url);
                  return (
                    <Pressable key={result.url} onPress={() => onTapOnline(result)} style={[styles.resultRow, { borderBottomColor: theme.colors.border }]}>
                      <Icon name={existing ? 'menu-book' : 'cloud-download'} size={18} color={theme.colors.accentDark} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13.5, color: theme.colors.text }}>{result.title}</Text>
                        <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>{result.sourceName}</Text>
                      </View>
                      {addingUrl === result.url ? <Text variant="caption" color="textSecondary">添加中…</Text> : existing ? <Text style={{ color: theme.colors.accent, fontSize: 11.5 }}>已在书架</Text> : <Icon name="add" size={20} color={theme.colors.textSecondary} />}
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  searchField: { flex: 1, height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchBtn: { paddingVertical: 10, paddingLeft: 2 },
  importCard: { marginHorizontal: 20, marginTop: 16, padding: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  importIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)' },
  importTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  importHint: { color: 'rgba(255,255,255,.76)', fontSize: 11.5, marginTop: 3 },
  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: { maxWidth: '100%', borderRadius: 17, paddingVertical: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyHint: { lineHeight: 19 },
  resultList: { borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1 },
  fallbackLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
});
