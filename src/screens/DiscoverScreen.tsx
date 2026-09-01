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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { RootStackParamList } from '../types/navigation';
import { useAddOnlineBook, useAllBooks } from '../store';
import { Book } from '../store/types/book';
import {
  fetchSourceRecommendations,
  SourceRecommendation,
} from '../services/discover/sourceRecommendations';
import {
  loadSourceRecommendationCache,
  saveSourceRecommendationCache,
} from '../utils/sourceRecommendationCache';
import { isSameOnlineBook } from '../utils/addOnlineBook';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const allBooks = useAllBooks();
  const addOnlineBook = useAddOnlineBook();
  const [recommendations, setRecommendations] = React.useState<
    SourceRecommendation[]
  >([]);
  const [recommendState, setRecommendState] = React.useState<
    'loading' | 'done' | 'empty'
  >('loading');
  const [addingUrl, setAddingUrl] = React.useState<string | null>(null);
  const [showAllRecommendations, setShowAllRecommendations] =
    React.useState(false);
  const [recommendationOffset, setRecommendationOffset] = React.useState(0);
  const recommendationsRef = React.useRef<SourceRecommendation[]>([]);

  const loadRecommendations = React.useCallback(async () => {
    setRecommendState('loading');
    setShowAllRecommendations(false);
    setRecommendationOffset(0);
    const items = await fetchSourceRecommendations();
    // 刷新失败时保留已展示的缓存，不把“发现”页回退为空白状态。
    if (!items.length && recommendationsRef.current.length) {
      setRecommendState('done');
      return;
    }
    recommendationsRef.current = items;
    setRecommendations(items);
    setRecommendState(items.length ? 'done' : 'empty');
    if (items.length) {
      // 网络刷新成功后再替换本地旧结果；下次打开“发现”无需等待书源首页抓取。
      saveSourceRecommendationCache(items).catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const bootstrapRecommendations = async () => {
      const cached = await loadSourceRecommendationCache();
      if (!cancelled && cached.length) {
        recommendationsRef.current = cached;
        setRecommendations(cached);
        setRecommendState('done');
      }
      if (!cancelled) loadRecommendations();
    };
    bootstrapRecommendations();
    return () => {
      cancelled = true;
    };
  }, [loadRecommendations]);

  const addRecommendation = React.useCallback(
    async (item: SourceRecommendation) => {
      const existing = allBooks.find(book => isSameOnlineBook(book, item.url));
      if (existing) {
        navigation.navigate('BookDetail', { bookId: existing.id });
        return;
      }
      if (addingUrl) return;
      setAddingUrl(item.url);
      try {
        const book = await addOnlineBook(item.url);
        navigation.navigate('BookDetail', { bookId: book.id });
      } catch (error) {
        // 推荐列表只提供详情页，实际入库还需拉取完整目录；站点临时拦截时保留列表并提示重试。
        Alert.alert(
          '加入失败',
          error instanceof Error
            ? error.message
            : '暂时无法解析该书籍，请稍后重试',
        );
      } finally {
        setAddingUrl(null);
      }
    },
    [addOnlineBook, addingUrl, allBooks, navigation],
  );

  const ranks = allBooks
    .filter(book => book.lastReadAt && book.progress < 100)
    .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))
    .slice(0, 3);
  const updates = allBooks.filter(book => (book.unreadUpdates || 0) > 0);
  const recentlyAdded = [...allBooks]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 6);
  // “最近加入”是补充发现入口，避免把上方已经出现的在读/追更书目再次重复展示。
  const surfacedBookIds = new Set([
    ...ranks.map(book => book.id),
    ...updates.map(book => book.id),
  ]);
  const uniqueRecentlyAdded = recentlyAdded.filter(
    book => !surfacedBookIds.has(book.id),
  );
  const visibleRecommendations = React.useMemo(() => {
    if (showAllRecommendations || recommendations.length <= 5) {
      return recommendations;
    }
    // “换一批”只在已获取的数据中轮换，避免每次点击都重新抓同一组书源首页。
    const rotated = [
      ...recommendations.slice(recommendationOffset),
      ...recommendations.slice(0, recommendationOffset),
    ];
    return rotated.slice(0, 5);
  }, [recommendationOffset, recommendations, showAllRecommendations]);
  const recommendationSources = Array.from(
    new Set(recommendations.map(item => item.sourceName)),
  ).join('、');
  const openDetail = (bookId: string) =>
    navigation.navigate('BookDetail', { bookId });
  const continueReading = (bookId: string) =>
    navigation.navigate('Reader', { bookId });
  const showNextRecommendations = () => {
    if (recommendations.length <= 5) {
      loadRecommendations();
      return;
    }
    setShowAllRecommendations(false);
    setRecommendationOffset(offset => (offset + 5) % recommendations.length);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>发现</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            {allBooks.length > 0
              ? `书库共 ${allBooks.length} 本 · 继续阅读与发现新书`
              : '从书源推荐挑一本开始阅读'}
          </Text>
        </View>
      </View>

      {ranks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            继续阅读
          </Text>
          <View
            style={[
              styles.rankList,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            {ranks.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`继续阅读《${item.title}》，已读 ${item.progress}%`}
                onPress={() => continueReading(item.id)}
                style={({ pressed }) => [
                  styles.rankRow,
                  {
                    borderBottomColor:
                      index === ranks.length - 1
                        ? 'transparent'
                        : theme.colors.border,
                  },
                  pressed && styles.rowPressed,
                ]}
              >
                <Icon name="menu-book" size={19} color={theme.colors.accent} />
                <View style={styles.rankInfo}>
                  <Text
                    style={[styles.rankTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`${item.author || '本地导入'} · 已读 ${item.progress}%`}
                  </Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.recommendHeading}>
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.text, marginBottom: 2 },
              ]}
            >
              书源推荐
            </Text>
            <Text variant="caption" color="textSecondary">
              {recommendationSources
                ? `来自 ${recommendationSources}`
                : '来自已接入书源'}
            </Text>
          </View>
          <Pressable
            onPress={showNextRecommendations}
            disabled={recommendState === 'loading'}
            accessibilityRole="button"
            accessibilityLabel={
              recommendations.length > 5 ? '换一批书源推荐' : '刷新书源推荐'
            }
            accessibilityState={{
              disabled: recommendState === 'loading',
              busy: recommendState === 'loading',
            }}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.rowPressed,
            ]}
          >
            <Icon name="refresh" size={18} color={theme.colors.accent} />
          </Pressable>
        </View>
        {recommendState === 'loading' && (
          <View
            accessibilityLiveRegion="polite"
            accessibilityLabel="正在获取推荐书目"
            style={styles.recommendLoading}
          >
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text variant="caption" color="textSecondary">
              正在获取推荐书目…
            </Text>
          </View>
        )}
        {recommendState === 'empty' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新获取书源推荐"
            onPress={loadRecommendations}
            style={({ pressed }) => [
              styles.emptyRetry,
              { borderColor: theme.colors.border },
              pressed && styles.rowPressed,
            ]}
          >
            <Text variant="caption" color="textSecondary">
              暂时无法获取推荐
            </Text>
            <Text style={{ color: theme.colors.accent, fontSize: 12.5 }}>
              重新获取
            </Text>
          </Pressable>
        )}
        {recommendations.length > 0 && (
          <View
            style={[
              styles.rankList,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            {visibleRecommendations.map((item, index) => {
              const existing = allBooks.find(book =>
                isSameOnlineBook(book, item.url),
              );
              const disabled = !existing && !!addingUrl;
              return (
                <Pressable
                  key={item.url}
                  accessibilityRole="button"
                  accessibilityLabel={
                    existing
                      ? `打开《${item.title}》详情`
                      : `加入《${item.title}》到书架`
                  }
                  accessibilityState={{
                    disabled,
                    busy: addingUrl === item.url,
                  }}
                  disabled={disabled}
                  onPress={() => addRecommendation(item)}
                  style={({ pressed }) => [
                    styles.rankRow,
                    {
                      borderBottomColor:
                        index === visibleRecommendations.length - 1
                          ? 'transparent'
                          : theme.colors.border,
                    },
                    pressed && styles.rowPressed,
                    disabled && styles.rowDisabled,
                  ]}
                >
                  <Icon
                    name={existing ? 'menu-book' : 'add-circle-outline'}
                    size={19}
                    color={theme.colors.accent}
                  />
                  <View style={styles.rankInfo}>
                    <Text
                      style={[styles.rankTitle, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {item.author ? `${item.author} · ` : ''}
                      {item.sourceName}
                    </Text>
                  </View>
                  <Text
                    variant="caption"
                    style={[
                      styles.recommendAction,
                      {
                        color: existing
                          ? theme.colors.textSecondary
                          : theme.colors.accent,
                      },
                    ]}
                  >
                    {addingUrl === item.url
                      ? '加入中…'
                      : existing
                      ? '已在书架'
                      : '加入'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {recommendations.length > 5 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showAllRecommendations
                ? '收起书源推荐'
                : `查看全部 ${recommendations.length} 本书源推荐`
            }
            accessibilityState={{ expanded: showAllRecommendations }}
            onPress={() => setShowAllRecommendations(value => !value)}
            style={({ pressed }) => [
              styles.recommendMore,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={{ color: theme.colors.accent, fontSize: 12.5 }}>
              {showAllRecommendations
                ? '收起推荐'
                : `查看全部 ${recommendations.length} 本`}
            </Text>
            <Icon
              name={showAllRecommendations ? 'expand-less' : 'expand-more'}
              size={18}
              color={theme.colors.accent}
            />
          </Pressable>
        )}
      </View>

      {updates.length > 0 && (
        <DiscoverList
          title="追更更新"
          books={updates}
          theme={theme}
          onOpen={openDetail}
          detail={book => `新增 ${book.unreadUpdates} 章`}
        />
      )}

      {uniqueRecentlyAdded.length > 0 && (
        <DiscoverList
          title="最近加入"
          books={uniqueRecentlyAdded}
          theme={theme}
          onOpen={openDetail}
          detail={book =>
            `${book.author || '本地导入'} · 已读 ${book.progress}%`
          }
        />
      )}
    </ScrollView>
  );
}

function DiscoverList({
  title,
  books,
  theme,
  onOpen,
  detail,
}: {
  title: string;
  books: Book[];
  theme: ReturnType<typeof useTheme>['theme'];
  onOpen: (bookId: string) => void;
  detail: (book: Book) => string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        {title}
      </Text>
      <View
        style={[
          styles.rankList,
          { backgroundColor: theme.colors.surface },
          theme.shadows.sm,
        ]}
      >
        {books.map((book, index) => (
          <Pressable
            key={book.id}
            accessibilityRole="button"
            accessibilityLabel={`打开《${book.title}》，${detail(book)}`}
            onPress={() => onOpen(book.id)}
            style={({ pressed }) => [
              styles.rankRow,
              {
                borderBottomColor:
                  index === books.length - 1
                    ? 'transparent'
                    : theme.colors.border,
              },
              pressed && styles.rowPressed,
            ]}
          >
            <View
              style={[
                styles.updateDot,
                {
                  backgroundColor: book.unreadUpdates
                    ? theme.colors.danger
                    : theme.colors.accent,
                },
              ]}
            />
            <View style={styles.rankInfo}>
              <Text
                style={[styles.rankTitle, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {book.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {detail(book)}
              </Text>
            </View>
            <Icon
              name="chevron-right"
              size={18}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 8, paddingBottom: 88 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
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
  subtitle: { marginTop: 3 },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  recommendHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recommendLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
  },
  emptyRetry: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  rankList: { borderRadius: 8, overflow: 'hidden' },
  rankRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  rowPressed: { opacity: 0.72 },
  rowDisabled: { opacity: 0.55 },
  updateDot: { borderRadius: 4, height: 8, width: 8 },
  rankInfo: { flex: 1 },
  rankTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    marginBottom: 3,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  recommendAction: {
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    minWidth: 52,
    textAlign: 'right',
  },
  recommendMore: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
});
