import { useAtomValue } from 'jotai';
import { readingHistoryAtom } from '../store/atoms';
import { displayReadingRecords } from '../utils/readingRecords';
import { ReadingRecordsModal } from '../components/ReadingRecordsList';
import { forwardAbort, isAbortError } from '../utils/abort';
import { useScreenTaskSignal } from '../store/hooks/useScreenTaskSignal';
import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  BackHandler,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient, BookCover } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import {
  useNavigation,
  useRoute,
  useIsFocused,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import {
  useAllBooks,
  useBookChapters,
  useOpenChapter,
  useRemoveBook,
  useCacheWholeBook,
  useCheckBookUpdate,
  useToggleBookFollow,
} from '../store';
import { resumeChapterIndex } from '../utils/chapters';
import { sanitizeBookDescription } from '../utils/bookDescription';
import BookCatalogModal from './bookDetail/BookCatalogModal';
import { isBadBookshukuCatalog } from '../utils/bookCatalogQuality';
import { catalogNumberSummary } from '../utils/catalogNumberSummary';
import { getSourceById, resolveSource } from '../services/source/registry';
import { isCompleteOnlineChapterCacheUsable } from '../services/source/contentQuality';
import { COVER_GRADIENT_DIRECTION } from '../theme/readerThemes';
import { detailPalette } from './bookDetail/detailPalette';
import { useBookMetadataRepair } from '../store/hooks/useBookMetadataRepair';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'BookDetail'>;

function formatWordCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export default function BookDetailScreen() {
  const { theme, isDarkMode } = useTheme();
  const palette = detailPalette(isDarkMode);
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DetailRoute>();
  const insets = useSafeAreaInsets();
  const { bookId } = route.params;
  const books = useAllBooks();
  const book = books.find(b => b.id === bookId);
  const focused = useIsFocused();
  const taskSignal = useScreenTaskSignal(navigation, bookId, focused);
  useBookMetadataRepair(bookId, focused, taskSignal);
  const chapters = useBookChapters(bookId, taskSignal);
  const openChapter = useOpenChapter();
  const removeBook = useRemoveBook();
  const cacheWholeBook = useCacheWholeBook();
  const checkBookUpdate = useCheckBookUpdate();
  const toggleBookFollow = useToggleBookFollow();
  const bottomActionOffset = Math.max(insets.bottom, 12);

  // 在线书专属：检查更新 / 缓存全本的进行态与结果提示。
  const [checking, setChecking] = React.useState(false);
  const [caching, setCaching] = React.useState({
    active: false,
    done: 0,
    total: 0,
  });
  const [onlineMsg, setOnlineMsg] = React.useState('');
  const [showDeletePrompt, setShowDeletePrompt] = React.useState(false);
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [recordsOpen, setRecordsOpen] = React.useState(false);
  const histories = useAtomValue(readingHistoryAtom);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [headerCollapsed, setHeaderCollapsed] = React.useState(false);
  const [heroHeight, setHeroHeight] = React.useState(0);
  const [synopsisExpanded, setSynopsisExpanded] = React.useState(false);
  const headerHeight = insets.top + 60;
  const scrollOffsetRef = React.useRef(0);
  const scrollRef = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    // 同一详情路由换书时，不能沿用上一本文案展开状态与吸顶位置。
    scrollOffsetRef.current = 0;
    setHeaderCollapsed(false);
    setSynopsisExpanded(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [bookId]);
  const onDetailScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
    // 根据实际封面区高度切换导航；只在跨过边界时改变状态，正文始终在安全区栏下方。
    if (heroHeight > 0)
      setHeaderCollapsed(scrollOffsetRef.current >= heroHeight - 1);
  };
  React.useLayoutEffect(() => {
    if (!focused) return;
    // 状态栏跟随当前可见背景，由原生导航控制，避免直接调用 StatusBar 与 iOS 控制器冲突。
    navigation.setOptions({
      statusBarStyle:
        (catalogOpen || recordsOpen || headerCollapsed) && !isDarkMode
          ? 'dark'
          : 'light',
    });
  }, [
    navigation,
    catalogOpen,
    recordsOpen,
    headerCollapsed,
    isDarkMode,
    focused,
  ]);
  React.useEffect(() => {
    // 页面失焦时同步收起临时浮层，返回书架后不能留下拦截点击的遮罩。
    if (!focused) {
      setMoreOpen(false);
      setCatalogOpen(false);
      setRecordsOpen(false);
      setShowDeletePrompt(false);
    }
  }, [focused]);
  React.useEffect(() => {
    if (!moreOpen || !focused) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setMoreOpen(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [moreOpen, focused]);
  // 缓存全本可中断：离开页面或点“停止”时 abort，避免后台继续抓取。
  const cacheAbortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => cacheAbortRef.current?.abort(), []);
  // 正文校验会扫描缓存内容，只在章节或书源变更时执行，避免按钮状态更新反复扫描整本书。
  const cachedCount = React.useMemo(
    () =>
      chapters.filter(c =>
        isCompleteOnlineChapterCacheUsable(c, book?.source?.name),
      ).length,
    [chapters, book?.source?.name],
  );
  const supportsCatalogActions = !!book?.source;
  const supportsWholeBookCache =
    !!book?.source &&
    !!(getSourceById(book.source.name) || resolveSource(book.source.bookUrl));
  const cachePct =
    caching.total > 0 ? Math.round((caching.done / caching.total) * 100) : 0;
  const catalogNeedsRepair =
    !!book && isBadBookshukuCatalog(book.source?.name, chapters);
  const catalogNumbers = React.useMemo(
    () => catalogNumberSummary(chapters),
    [chapters],
  );

  const onCheckUpdate = async () => {
    if (
      checking ||
      cacheAbortRef.current ||
      taskSignal.aborted ||
      !supportsCatalogActions
    )
      return;
    setChecking(true);
    setOnlineMsg(
      catalogNeedsRepair ? '正在修复目录…' : '正在逐页检查目录，请稍候…',
    );
    try {
      const n = await checkBookUpdate(bookId, taskSignal);
      if (taskSignal.aborted) return;
      setOnlineMsg(
        catalogNeedsRepair
          ? n > 0
            ? `已修复目录，更新 ${n} 章`
            : '目录已重新检查'
          : n > 0
          ? `目录新增 ${n} 项`
          : '已是最新章节',
      );
    } catch (error) {
      if (taskSignal.aborted || isAbortError(error)) return;
      setOnlineMsg(
        `${catalogNeedsRepair ? '目录修复失败' : '检查更新失败'}：${
          error instanceof Error ? error.message : '请检查网络后重试'
        }`,
      );
    } finally {
      setChecking(false);
    }
  };

  const onCacheAll = async () => {
    // 已在缓存时，再次点击即停止。
    // state 要等下一次渲染才更新；同一帧连点也必须停止已有任务，不能启动第二个下载。
    if (cacheAbortRef.current) {
      cacheAbortRef.current?.abort();
      return;
    }
    if (
      checking ||
      taskSignal.aborted ||
      catalogNeedsRepair ||
      !supportsCatalogActions ||
      !supportsWholeBookCache ||
      !chapters.length
    )
      return;
    const controller = new AbortController();
    const unlink = forwardAbort(taskSignal, controller);
    cacheAbortRef.current = controller;
    setCaching({ active: true, done: cachedCount, total: chapters.length });
    setOnlineMsg('');
    try {
      const res = await cacheWholeBook(
        bookId,
        p => {
          if (!taskSignal.aborted)
            setCaching({ active: true, done: p.done, total: p.total });
        },
        controller.signal,
      );
      if (taskSignal.aborted) return;
      setOnlineMsg(
        res.cancelled
          ? `已停止，缓存了 ${res.done}/${res.total} 项正文`
          : res.done >= res.total
          ? `已缓存全部 ${res.total} 项正文，可离线阅读`
          : `已缓存 ${res.done}/${res.total} 项正文（部分失败，可重试）`,
      );
    } catch {
      if (taskSignal.aborted) return;
      setOnlineMsg('缓存失败，请检查网络后重试');
    } finally {
      unlink();
      if (cacheAbortRef.current === controller) {
        cacheAbortRef.current = null;
        setCaching(prev => ({ ...prev, active: false }));
      }
    }
  };

  if (!book) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Icon name="menu-book" size={40} color={theme.colors.textSecondary} />
        <Text variant="h3" style={{ marginTop: 14 }}>
          这本书已不在书架中
        </Text>
        <Text color="textSecondary" style={styles.missingMessage}>
          它可能已被移到回收站，或当前链接已经失效。
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回书架"
          onPress={() =>
            navigation.navigate('MainTabs', { screen: 'Bookshelf' })
          }
          style={[
            styles.missingButton,
            { backgroundColor: theme.colors.accentDark },
          ]}
        >
          <Text style={styles.missingButtonText}>返回书架</Text>
        </Pressable>
      </View>
    );
  }

  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  const resumeIdx = resumeChapterIndex(chapters, book.currentChapterId);
  // 长书开头的百分比可能四舍五入为 0；续读状态以真实阅读记录为准。
  const hasStartedReading =
    book.progress > 0 || !!book.lastReadAt || !!book.currentChapterId;
  const latest = chapters[chapters.length - 1];
  const readingStateLabel =
    book.progress >= 100 ? '已读完' : hasStartedReading ? '阅读中' : '未开始';
  const chaptersReady = chapters.length > 0;
  const catalogReady = chaptersReady && !catalogNeedsRepair;
  const synopsis = sanitizeBookDescription(book.description) || '';
  const canExpandSynopsis =
    synopsis.length > 100 || synopsis.split('\n').length > 4;
  // 在线书未缓存正文时没有可信字数，展示破折号比把“未知”误报成 0 更准确。
  const wordCountLabel = totalWords > 0 ? formatWordCount(totalWords) : '—';

  const openCatalog = () => {
    // 两个入口只展示已有目录；加载/修复期间不可进入，也不触发正文抓取或改写续读状态。
    if (!catalogReady) return;
    setMoreOpen(false);
    setCatalogOpen(true);
  };
  const goReader = (idx: number) => {
    if (!catalogReady) return;
    openChapter(book.id, idx);
    navigation.navigate('Reader', { bookId: book.id });
  };
  const headerInk = headerCollapsed ? palette.ink : '#fbf8ee';
  const headerAccent = headerCollapsed ? palette.accent : '#f0d9a8';
  const headerButtonSurface = headerCollapsed
    ? palette.subtle
    : 'rgba(255,255,255,.09)';

  return (
    <View style={[styles.container, { backgroundColor: palette.paper }]}>
      <ScrollView
        ref={scrollRef}
        testID="book-detail-scroll"
        // 页面已手动处理安全区，关闭系统重复调整，避免目录弹层关闭后内容向上跳动。
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingBottom: 100 + bottomActionOffset,
        }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setMoreOpen(false)}
        onScroll={onDetailScroll}
        scrollEventThrottle={16}
      >
        <View
          testID="book-detail-hero"
          style={styles.hero}
          onLayout={event => {
            const height = event.nativeEvent.layout.height;
            setHeroHeight(height);
            if (height > 0)
              setHeaderCollapsed(scrollOffsetRef.current >= height - 1);
          }}
        >
          <LinearGradient
            colors={['#22443e', '#1d3935']}
            {...COVER_GRADIENT_DIRECTION}
            style={StyleSheet.absoluteFill}
          />
          {/* 用透明径向渐变纹理还原柔光，避免实色圆形出现明显边缘。 */}
          <Image
            source={require('../assets/detail-hero-glow.png')}
            resizeMode="stretch"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroBody}>
              <View style={styles.heroCoverShadow}>
                <BookCover
                  id={book.id}
                  uri={book.cover}
                  title={book.title}
                  author={book.author}
                  style={styles.heroCover}
                />
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {book.title}
                </Text>
                <Text style={styles.heroAuthor} numberOfLines={1}>
                  {book.author}
                </Text>
                <View style={styles.tagRow}>
                  <View
                    style={[
                      styles.tag,
                      { borderColor: 'rgba(240,217,168,.31)' },
                    ]}
                  >
                    <Text
                      style={{ color: '#f0d9a8', fontSize: 11, lineHeight: 16 }}
                    >
                      {readingStateLabel}
                    </Text>
                  </View>
                  {book.fileFormat === 'txt' && (
                    <View
                      style={[
                        styles.tag,
                        { borderColor: 'rgba(255,255,255,.25)' },
                      ]}
                    >
                      <Text
                        style={{
                          color: 'rgba(255,255,255,.7)',
                          fontSize: 11,
                          lineHeight: 16,
                        }}
                      >
                        本地导入
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View
                accessible
                accessibilityLabel={`${chapters.length} ${
                  book.source ? '项目录' : '章'
                }`}
                style={styles.statItem}
              >
                <Text style={styles.statValue}>{chapters.length}</Text>
                <Text style={styles.statLabel}>
                  {book.source ? '目录项' : '章节'}
                </Text>
              </View>
              <View
                accessible
                accessibilityLabel={
                  totalWords > 0
                    ? `已缓存正文约 ${formatWordCount(totalWords)} 字`
                    : '正文尚未缓存，字数未知'
                }
                style={styles.statItem}
              >
                <Text style={styles.statValue}>{wordCountLabel}</Text>
                <Text style={styles.statLabel}>已缓存字数</Text>
              </View>
              <View
                accessible
                accessibilityLabel={`阅读进度 ${book.progress}%`}
                style={styles.statItem}
              >
                <Text style={styles.statValue}>{book.progress}%</Text>
                <Text style={styles.statLabel}>阅读进度</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: palette.surface }]}>
          <Text style={[styles.sectionLabel, { color: palette.ink }]}>
            内容简介
          </Text>
          <Text
            style={[styles.synopsis, { color: palette.ink }]}
            numberOfLines={
              canExpandSynopsis && !synopsisExpanded ? 4 : undefined
            }
          >
            {synopsis || '这本书还没有可用简介。'}
          </Text>
          {canExpandSynopsis && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                synopsisExpanded ? '收起内容简介' : '展开内容简介'
              }
              accessibilityState={{ expanded: synopsisExpanded }}
              onPress={() => setSynopsisExpanded(value => !value)}
              style={styles.synopsisToggle}
            >
              <Text style={{ color: palette.accent, fontSize: 13 }}>
                {synopsisExpanded ? '收起简介' : '展开简介'}
              </Text>
              <Icon
                family="feather"
                name={synopsisExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={palette.accent}
              />
            </Pressable>
          )}
        </View>

        {book.source && (
          <View
            style={[styles.onlineSection, { backgroundColor: palette.surface }]}
          >
            <View style={styles.onlineRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={book.following ? '取消追更' : '追更这本书'}
                accessibilityState={{ selected: !!book.following }}
                onPress={() => toggleBookFollow(bookId)}
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: book.following
                      ? palette.accentSurface
                      : palette.subtle,
                    borderColor: book.following ? palette.accent : palette.line,
                  },
                ]}
              >
                <Icon
                  family="feather"
                  name="bookmark"
                  size={15}
                  color={book.following ? palette.accent : palette.ink}
                />
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 20,
                    color: book.following ? palette.accent : palette.ink,
                  }}
                >
                  {book.following ? '追更中' : '追更'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  checking
                    ? catalogNeedsRepair
                      ? '正在修复目录'
                      : '正在检查更新'
                    : catalogNeedsRepair
                    ? '重新修复目录'
                    : '检查书籍更新'
                }
                accessibilityState={{ disabled: checking || caching.active }}
                onPress={onCheckUpdate}
                disabled={checking || caching.active}
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: palette.subtle,
                    borderColor: palette.line,
                    opacity: checking || caching.active ? 0.5 : 1,
                  },
                ]}
              >
                <Icon
                  family="feather"
                  name="refresh-cw"
                  size={15}
                  color={palette.ink}
                />
                <Text
                  style={{ fontSize: 13, lineHeight: 20, color: palette.ink }}
                >
                  {checking
                    ? catalogNeedsRepair
                      ? '修复中…'
                      : '检查中…'
                    : catalogNeedsRepair
                    ? '修复目录'
                    : '检查更新'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  catalogNeedsRepair
                    ? '目录需修复后才能缓存全本'
                    : caching.active
                    ? `停止缓存，当前 ${cachePct}%`
                    : supportsWholeBookCache
                    ? '缓存全本'
                    : '阅读时自动缓存'
                }
                accessibilityState={{
                  disabled:
                    checking ||
                    catalogNeedsRepair ||
                    !chaptersReady ||
                    !supportsWholeBookCache,
                  busy: caching.active,
                }}
                onPress={onCacheAll}
                disabled={
                  checking ||
                  catalogNeedsRepair ||
                  !chaptersReady ||
                  !supportsWholeBookCache
                }
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: palette.subtle,
                    borderColor: palette.line,
                    opacity:
                      checking ||
                      catalogNeedsRepair ||
                      !chaptersReady ||
                      !supportsWholeBookCache
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                <Icon
                  family="feather"
                  name={caching.active ? 'square' : 'download'}
                  size={15}
                  color={palette.ink}
                />
                <Text
                  style={{ fontSize: 13, lineHeight: 20, color: palette.ink }}
                >
                  {catalogNeedsRepair
                    ? '目录需修复'
                    : caching.active
                    ? `缓存中 ${cachePct}% · 停止`
                    : supportsWholeBookCache
                    ? '缓存全本'
                    : '阅读时缓存'}
                </Text>
              </Pressable>
            </View>

            {!!onlineMsg && !checking && /失败/.test(onlineMsg) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="回到原网页更新章节目录"
                onPress={() =>
                  navigation.navigate('InAppBrowser', {
                    initialUrl: book.source!.bookUrl,
                  })
                }
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: palette.line,
                    alignSelf: 'flex-start',
                  },
                ]}
              >
                <Icon
                  family="feather"
                  name="refresh-cw"
                  size={15}
                  color={palette.ink}
                />
                <Text
                  style={{ fontSize: 11, lineHeight: 17, color: palette.ink }}
                >
                  更新网页目录
                </Text>
              </Pressable>
            )}
            <Text
              variant="caption"
              color="textSecondary"
              style={[styles.cacheNote, { color: palette.secondary }]}
            >
              {onlineMsg ||
                (catalogNeedsRepair
                  ? '目录质量异常，请点击“修复目录”重新获取'
                  : !chaptersReady
                  ? '正在读取章节目录…'
                  : !supportsCatalogActions
                  ? `已缓存 ${cachedCount}/${chapters.length} 项正文。阅读时自动缓存；更新目录请回原网页重新识别。`
                  : `已缓存 ${cachedCount}/${chapters.length} 项正文${
                      cachedCount > 0
                        ? '，这些章节可离线阅读'
                        : '，阅读时自动缓存'
                    }`)}
            </Text>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: palette.surface }]}>
          <Pressable
            disabled={!catalogReady}
            accessibilityRole="button"
            accessibilityLabel="打开完整目录"
            accessibilityState={{ disabled: !catalogReady }}
            onPress={openCatalog}
            style={[
              styles.catalogEntry,
              {
                backgroundColor: palette.surface,
                opacity: catalogReady ? 1 : 0.62,
              },
            ]}
          >
            <View style={styles.entrySymbol}>
              <Icon
                family="feather"
                name="list"
                size={19}
                color={palette.accent}
              />
            </View>
            <View style={styles.entryCopy}>
              <Text style={[styles.entryTitle, { color: palette.ink }]}>
                章节目录
              </Text>
              <Text
                style={[styles.entrySubtitle, { color: palette.secondary }]}
              >
                {catalogNeedsRepair
                  ? checking
                    ? '目录修复中…'
                    : '目录暂不可用'
                  : chaptersReady
                  ? book.source
                    ? `共 ${chapters.length} 项目录`
                    : `共 ${chapters.length} 章`
                  : '目录加载中…'}
              </Text>
            </View>
            <View style={styles.entryCTA}>
              <Text style={[styles.entryCTAText, { color: palette.accent }]}>
                查看全部
              </Text>
              <Icon
                family="feather"
                name="chevron-right"
                size={15}
                color={palette.accent}
              />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看阅读记录"
            onPress={() => setRecordsOpen(true)}
            style={[styles.latest, { borderTopColor: palette.line }]}
          >
            <Icon name="history" size={18} color={palette.accent} />
            <View style={styles.entryCopy}>
              <Text style={[styles.entryTitle, { color: palette.ink }]}>
                阅读记录
              </Text>
              <Text
                style={[styles.entrySubtitle, { color: palette.secondary }]}
              >
                最近位置与目录跳转前的位置
              </Text>
            </View>
            <Icon
              family="feather"
              name="chevron-right"
              size={16}
              color={palette.secondary}
            />
          </Pressable>
          {latest && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`阅读最新章节 ${latest.title}`}
              accessibilityState={{ disabled: !catalogReady }}
              disabled={!catalogReady}
              onPress={() => goReader(chapters.length - 1)}
              style={[
                styles.latest,
                {
                  borderTopColor: palette.line,
                  opacity: catalogReady ? 1 : 0.62,
                },
              ]}
            >
              <Text style={[styles.latestLabel, { color: palette.accent }]}>
                最新
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.latestTitle, { color: palette.ink }]}
              >
                {latest.title}
              </Text>
            </Pressable>
          )}
          {book.source && catalogNumbers.maxNumber > 0 && (
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.catalogAudit}
            >
              章号至第 {catalogNumbers.maxNumber} 章 ·
              目录项可能含上下篇、合章与公告
            </Text>
          )}
          {book.source && catalogNumbers.unmatchedNumbers.length > 0 && (
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.catalogAudit}
            >
              有 {catalogNumbers.unmatchedNumbers.length}{' '}
              个章号未匹配，建议核对原站目录；原站跳号不一定是缺章。
            </Text>
          )}
          {catalogNeedsRepair && (
            <View style={styles.catalogBlocked}>
              <Icon name="build" size={20} color={theme.colors.warning} />
              <Text color="textSecondary" style={styles.catalogBlockedText}>
                当前目录质量异常，修复完成后才可进入阅读，避免打开错误章节。
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 导航独立于滚动内容，安全区始终有实色背景，避免第二屏正文穿过状态栏。 */}
      <View
        testID="book-detail-header"
        style={[
          styles.fixedHeader,
          {
            paddingTop: insets.top,
            height: headerHeight,
            backgroundColor: headerCollapsed ? palette.surface : '#22443e',
            borderBottomColor: headerCollapsed ? palette.line : 'transparent',
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回上一页"
            onPress={() => navigation.goBack()}
            style={[styles.heroBtn, { backgroundColor: headerButtonSurface }]}
          >
            <Icon
              family="feather"
              name="arrow-left"
              size={20}
              color={headerInk}
            />
          </Pressable>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: headerInk }]}
          >
            {headerCollapsed ? book.title : '书籍详情'}
          </Text>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="快捷打开目录"
              accessibilityState={{ disabled: !catalogReady }}
              disabled={!catalogReady}
              onPress={openCatalog}
              style={[
                styles.catalogShortcut,
                {
                  backgroundColor: headerButtonSurface,
                  borderColor: headerCollapsed
                    ? palette.line
                    : 'rgba(240,217,168,.31)',
                  opacity: catalogReady ? 1 : 0.45,
                },
              ]}
            >
              <Icon
                family="feather"
                name="list"
                size={18}
                color={headerAccent}
              />
              <Text
                style={[styles.catalogShortcutText, { color: headerAccent }]}
              >
                目录
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="更多书籍操作"
              accessibilityState={{ expanded: moreOpen }}
              onPress={() => setMoreOpen(value => !value)}
              style={[styles.heroBtn, { backgroundColor: headerButtonSurface }]}
            >
              <Icon
                family="feather"
                name="more-horizontal"
                size={20}
                color={headerInk}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {moreOpen && focused && (
        <View style={styles.moreOverlay} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭更多菜单"
            onPress={() => setMoreOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.moreMenu,
              { top: headerHeight + 6, backgroundColor: palette.surface },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="删除书籍"
              onPress={() => {
                setMoreOpen(false);
                setShowDeletePrompt(true);
              }}
              style={styles.moreMenuItem}
            >
              <Icon
                family="feather"
                name="trash-2"
                size={19}
                color={palette.destructive}
              />
              <Text
                style={[styles.moreMenuText, { color: palette.destructive }]}
              >
                删除书籍
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {recordsOpen && focused && (
        <ReadingRecordsModal
          canSelect={catalogReady}
          records={displayReadingRecords(book, histories[bookId], chapters)}
          chapters={chapters}
          onClose={() => setRecordsOpen(false)}
          onSelect={record => {
            const index = chapters.findIndex(c => c.id === record.chapterId);
            if (!catalogReady || index < 0) return;
            openChapter(bookId, index, { restorePosition: record.position });
            setRecordsOpen(false);
            navigation.navigate('Reader', { bookId });
          }}
        />
      )}
      {catalogOpen && (
        <BookCatalogModal
          chapters={chapters}
          currentIndex={resumeIdx}
          onClose={() => setCatalogOpen(false)}
          onSelect={idx => {
            setCatalogOpen(false);
            goReader(idx);
          }}
        />
      )}

      {showDeletePrompt ? (
        <View
          accessibilityViewIsModal
          accessibilityLabel="移到回收站确认"
          style={styles.deleteBackdrop}
        >
          <View
            style={[
              styles.deleteDialog,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <Text style={[styles.deleteTitle, { color: palette.ink }]}>
              移到回收站
            </Text>
            <Text
              style={[
                styles.deleteMessage,
                { color: theme.colors.textSecondary },
              ]}
            >
              《{book.title}》将移出书架。章节缓存、阅读进度与书签都会保留，
              可在「我的 - 回收站」还原。
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="取消移到回收站"
                style={[
                  styles.deleteButton,
                  { borderColor: theme.colors.border },
                ]}
                onPress={() => setShowDeletePrompt(false)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`将${book.title}移到回收站`}
                style={[
                  styles.deleteButton,
                  { backgroundColor: theme.colors.danger },
                ]}
                onPress={() => {
                  removeBook(book.id);
                  setShowDeletePrompt(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.deleteConfirmText}>移到回收站</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[
          styles.actionBarWrap,
          {
            paddingBottom: bottomActionOffset,
            backgroundColor: palette.surface,
            borderTopColor: palette.line,
          },
        ]}
      >
        <View style={styles.actionBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="从底部打开章节目录"
            accessibilityState={{ disabled: !catalogReady }}
            disabled={!catalogReady}
            onPress={openCatalog}
            style={[
              styles.shelfBtn,
              {
                backgroundColor: palette.subtle,
                opacity: catalogReady ? 1 : 0.45,
              },
            ]}
          >
            <Icon
              family="feather"
              name="list"
              size={19}
              color={palette.accent}
            />
            <Text
              style={{ fontSize: 12, lineHeight: 17, color: palette.accent }}
            >
              目录
            </Text>
          </Pressable>
          <Pressable
            disabled={!catalogReady}
            accessibilityRole="button"
            accessibilityLabel={
              catalogNeedsRepair
                ? checking
                  ? '正在修复目录'
                  : '目录需要修复'
                : !chaptersReady
                ? '章节加载中'
                : hasStartedReading
                ? book.source
                  ? `继续阅读 ${chapters[resumeIdx]?.title || ''}`
                  : `继续阅读第 ${resumeIdx + 1} 章`
                : '开始阅读'
            }
            accessibilityState={{ disabled: !catalogReady }}
            onPress={() => goReader(resumeIdx)}
            style={[
              styles.readBtn,
              {
                backgroundColor: '#1d3d37',
                opacity: catalogReady ? 1 : 0.45,
              },
            ]}
          >
            <Icon family="feather" name="book-open" size={19} color="#f6f3e9" />
            <Text style={styles.readBtnText} numberOfLines={2}>
              {catalogNeedsRepair
                ? checking
                  ? '正在修复目录…'
                  : '目录需修复后阅读'
                : !chaptersReady
                ? '章节加载中…'
                : hasStartedReading
                ? book.source
                  ? `继续阅读 · ${chapters[resumeIdx]?.title || ''}`
                  : `继续阅读 · 第 ${resumeIdx + 1} 章`
                : '开始阅读'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missingButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 24,
  },
  missingButtonText: { color: '#fff', fontWeight: '600' },
  missingMessage: {
    marginTop: 8,
    maxWidth: 300,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
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
    justifyContent: 'center',
    minHeight: 44,
  },
  deleteConfirmText: { color: '#fff', fontWeight: '600' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catalogShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(240,217,168,.31)',
    backgroundColor: 'rgba(240,217,168,.075)',
  },
  catalogShortcutText: {
    color: '#f0d9a8',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  moreOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  moreMenu: {
    position: 'absolute',
    right: 20,
    padding: 4,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  moreMenuText: { fontSize: 13, lineHeight: 20 },
  hero: {
    position: 'relative',
    overflow: 'hidden',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 44,
    alignItems: 'center',
    gap: 10,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
  },
  headerTitle: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  heroBtn: {
    width: 44,
    height: 44,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flexDirection: 'row', gap: 16, minHeight: 128 },
  heroCover: { width: 96, borderRadius: 7 },
  // 封面投影与完整 3:4 尺寸独立，避免为阴影裁切原图。
  heroCoverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.33,
    shadowRadius: 11,
    elevation: 10,
  },
  heroInfo: { flex: 1, paddingTop: 2 },
  heroTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: 0.4,
    fontWeight: '600',
    color: '#fbf8ee',
  },
  heroAuthor: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,.72)',
    marginTop: 9,
  },
  tagRow: { flexDirection: 'row', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  tag: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 21,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.11)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily: SERIF_FONT,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
    color: '#fbf8ee',
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,.65)',
    marginTop: 6,
  },
  section: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 18,
    borderRadius: 14,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    marginBottom: 10,
    lineHeight: 23,
  },
  synopsis: { fontFamily: SERIF_FONT, fontSize: 15, lineHeight: 28 },
  synopsisToggle: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  onlineSection: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
  },
  onlineRow: { flexDirection: 'row', gap: 7 },
  cacheNote: { marginTop: 10, fontSize: 12, lineHeight: 19 },
  latest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  latestLabel: { fontSize: 12, lineHeight: 20 },
  latestTitle: { flex: 1, fontSize: 13, lineHeight: 21 },
  onlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 5,
    minHeight: 48,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  catalogEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 70,
    paddingVertical: 13,
    paddingHorizontal: 0,
    borderRadius: 10,
  },
  entrySymbol: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCopy: { flex: 1, gap: 5 },
  entryTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  entrySubtitle: { fontSize: 11, lineHeight: 16 },
  entryCTA: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  entryCTAText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  catalogAudit: {
    marginHorizontal: 4,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 20,
  },
  catalogBlocked: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  catalogBlockedText: { flex: 1, fontSize: 12.5, lineHeight: 19 },
  actionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 3,
  },
  actionBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  shelfBtn: {
    width: 64,
    minHeight: 52,
    borderRadius: 9,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 9,
    borderRadius: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    // 保持轻投影，让阅读主按钮与浅色目录入口形成明确层级。
    shadowColor: '#183a33',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 6,
  },
  readBtnText: {
    flexShrink: 1,
    color: '#f6f3e9',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
