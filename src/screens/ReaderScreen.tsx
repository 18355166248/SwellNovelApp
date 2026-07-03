import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Icon } from '../components';
import {
  useAllBooks,
  useSelectBook,
  useBookChapters,
  useCurrentChapterIndex,
  useCurrentChapterContent,
  useOpenChapter,
  useReaderSettings,
  useReaderDisplay,
  useSetReaderTheme,
  useAdjustFontSize,
  useSetLineHeightIndex,
  useSetPageMode,
  useToggleToolbar,
  useSetToolbarVisible,
  useReaderState,
  useBookmarks,
  useToggleBookmark,
} from '../store';
import {
  DRAWER_WIDTH,
  NOVEL_ACCENT,
  NOVEL_GOLD,
  READER_THEMES,
  ReaderThemeKey,
} from '../theme/readerThemes';
import { SERIF_FONT } from '../theme/fonts';
import {
  breakLines,
  buildPages,
  findPageByOffset,
  INDENT,
  linesFromTextLayout,
  ReaderLine,
  ReaderPageData,
} from '../utils/paginate';
import { getCharWidthMeasurer } from '../utils/charWidth';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;

const LINE_LABELS = ['紧凑', '适中', '宽松'];
const THEME_ORDER: ReaderThemeKey[] = ['paper', 'gray', 'green', 'night'];
const PAGE_HORIZONTAL_PADDING = 24;
const PAGE_TOP_PADDING = 36;
const PAGE_BOTTOM_PADDING = 48;
/** 章节边界越界回弹翻章的位移阈值 */
const CHAPTER_TURN_THRESHOLD = 40;

// react-native-web 透传 CSS scroll-snap，横向列表在 web 获得整页吸附。
const WEB_SNAP_CONTAINER =
  Platform.OS === 'web'
    ? ({
        overscrollBehaviorX: 'contain',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
      } as any)
    : null;
const WEB_SNAP_ITEM =
  Platform.OS === 'web'
    ? ({ scrollSnapAlign: 'start', scrollSnapStop: 'normal' } as any)
    : null;

function findReaderPageScrollNode(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const root = document.querySelector(
    '[data-testid="reader-page-list"]',
  ) as HTMLElement | null;
  if (!root) return null;

  const candidates = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement>('*')),
  ];
  return (
    candidates.find(
      node =>
        node.clientWidth > 0 &&
        node.scrollWidth > node.clientWidth &&
        ['auto', 'scroll'].includes(getComputedStyle(node).overflowX),
    ) ?? null
  );
}

// onTextLayout 真实排版结果缓存：同章同排版参数只测一次。
const measuredLinesCache = new Map<string, ReaderLine[]>();
const MEASURED_CACHE_LIMIT = 16;
function cacheMeasuredLines(key: string, lines: ReaderLine[]) {
  if (measuredLinesCache.size >= MEASURED_CACHE_LIMIT) {
    const oldest = measuredLinesCache.keys().next().value;
    if (oldest != null) measuredLinesCache.delete(oldest);
  }
  measuredLinesCache.set(key, lines);
}

export default function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderRoute>();
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const { bookId, openDrawer } = route.params;

  const books = useAllBooks();
  const book = books.find(b => b.id === bookId);
  const selectBook = useSelectBook();
  const chapters = useBookChapters(bookId);
  const chapterIndex = useCurrentChapterIndex() ?? 0;
  const content = useCurrentChapterContent();
  const openChapter = useOpenChapter();

  const settings = useReaderSettings();
  const display = useReaderDisplay();
  const setReaderTheme = useSetReaderTheme();
  const { inc: incFont, dec: decFont } = useAdjustFontSize();
  const setLineHeightIndex = useSetLineHeightIndex();
  const setPageMode = useSetPageMode();

  const { isToolbarVisible } = useReaderState();
  const toggleToolbar = useToggleToolbar();
  const setToolbarVisible = useSetToolbarVisible();

  const bookmarks = useBookmarks(bookId);
  const toggleBookmark = useToggleBookmark();

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(!!openDrawer);
  const [drawerOrder, setDrawerOrder] = React.useState<'asc' | 'desc'>('asc');
  const [drawerQuery, setDrawerQuery] = React.useState('');
  const [status, setStatus] = React.useState<'ready' | 'loading' | 'error'>(
    'ready',
  );
  const [pageIndex, setPageIndex] = React.useState(0);
  const [measureTick, setMeasureTick] = React.useState(0);
  const flatListRef = React.useRef<FlatList<ReaderPageData>>(null);
  const currentOffsetRef = React.useRef(0);
  const pendingLandRef = React.useRef<'last' | null>(null);
  const prevChapterIdRef = React.useRef<string | undefined>(undefined);
  const transitionRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const webScrollIdleRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  React.useEffect(() => {
    selectBook(bookId);
  }, [bookId, selectBook]);

  React.useEffect(
    () => () => {
      if (transitionRef.current) clearTimeout(transitionRef.current);
      if (webScrollIdleRef.current) clearTimeout(webScrollIdleRef.current);
    },
    [],
  );

  const total = chapters.length;
  const drawerList = React.useMemo(() => {
    let list = chapters.map((c, idx) => ({ c, idx }));
    if (drawerQuery.trim()) {
      const q = drawerQuery.trim().toLowerCase();
      list = list.filter(({ c }) => c.title.toLowerCase().includes(q));
    }
    if (drawerOrder === 'desc') list = list.slice().reverse();
    return list;
  }, [chapters, drawerOrder, drawerQuery]);

  const chapter = chapters[chapterIndex];
  const isNight = settings.theme === 'night';
  const hasBookmark = chapter
    ? bookmarks.some(b => b.chapterId === chapter.id)
    : false;
  const progressPct =
    total > 0 ? Math.round(((chapterIndex + 1) / total) * 100) : 0;
  const paragraphs = React.useMemo(
    () =>
      (content || chapter?.content || '')
        .split(/\n+/)
        .filter(p => p.trim().length > 0),
    [chapter?.content, content],
  );

  // 左右翻页先按真实字符宽度断行、组页，再交给 FlatList 虚拟渲染，避免大章节一次性挂载所有页面。
  const pageMetrics = React.useMemo(() => {
    const maxWidth = Math.max(1, viewportWidth - PAGE_HORIZONTAL_PADDING * 2);
    const bodyHeight = Math.max(
      1,
      viewportHeight - PAGE_TOP_PADDING - PAGE_BOTTOM_PADDING,
    );
    const lineHeight = display.fontSize * display.lineHeight;
    // 首页扣除标题区（章节名 + meta + 间距）真实占用的高度，消除首页尾部留白。
    const headerHeight = display.titleSize * 1.4 + 12 + 24;
    const firstBodyHeight = Math.max(lineHeight, bodyHeight - headerHeight);

    return {
      maxWidth,
      lineHeight,
      paraGap: display.paraGap,
      bodyHeight,
      firstBodyHeight,
    };
  }, [
    display.fontSize,
    display.lineHeight,
    display.paraGap,
    display.titleSize,
    viewportHeight,
    viewportWidth,
  ]);
  const pages = React.useMemo<ReaderPageData[]>(() => {
    const chapterId = chapter?.id || bookId;
    const measure = getCharWidthMeasurer(SERIF_FONT, display.fontSize);
    const cacheKey = `${chapterId}|${pageMetrics.maxWidth}|${display.fontSize}|${display.lineHeight}`;
    // measureTick 是原生 onTextLayout 写入真实测量缓存后的失效版本，促使同一 cacheKey 重新取缓存。
    const lines =
      measureTick >= 0 && measuredLinesCache.has(cacheKey)
        ? measuredLinesCache.get(cacheKey)!
        : breakLines(paragraphs, pageMetrics.maxWidth, measure);
    return buildPages({
      chapterId,
      lines,
      lineHeight: pageMetrics.lineHeight,
      paraGap: pageMetrics.paraGap,
      bodyHeight: pageMetrics.bodyHeight,
      firstBodyHeight: pageMetrics.firstBodyHeight,
    });
  }, [
    bookId,
    chapter?.id,
    display.fontSize,
    display.lineHeight,
    pageMetrics.bodyHeight,
    pageMetrics.firstBodyHeight,
    pageMetrics.lineHeight,
    pageMetrics.maxWidth,
    pageMetrics.paraGap,
    paragraphs,
    measureTick,
  ]);

  React.useEffect(() => {
    const chapterChanged = prevChapterIdRef.current !== chapter?.id;
    prevChapterIdRef.current = chapter?.id;

    if (chapterChanged) {
      if (pendingLandRef.current === 'last') {
        pendingLandRef.current = null;
        const last = Math.max(0, pages.length - 1);
        currentOffsetRef.current = pages[last]?.startOffset ?? 0;
        setPageIndex(last);
      } else {
        currentOffsetRef.current = 0;
        setPageIndex(0);
      }
      return;
    }

    // 同章重新分页时，用逻辑字符偏移映射回原段落附近，避免字号/行距调整后跳回首页。
    setPageIndex(findPageByOffset(pages, currentOffsetRef.current));
  }, [chapter?.id, pages, settings.pageMode]);

  const pageProgressPct =
    total > 0 && pages.length > 0
      ? Math.round(((chapterIndex + pageIndex / pages.length) / total) * 100)
      : progressPct;
  const progressLabel =
    settings.pageMode === 'page'
      ? `本章 ${Math.min(pageIndex + 1, pages.length)} / ${
          pages.length
        } 页 · ${pageProgressPct}%`
      : `${chapterIndex + 1} / ${total} · ${progressPct}%`;

  const goToChapter = React.useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= total) return;
      setStatus('loading');
      setSettingsOpen(false);
      setDrawerOpen(false);
      setToolbarVisible(false);
      if (transitionRef.current) clearTimeout(transitionRef.current);
      transitionRef.current = setTimeout(() => {
        openChapter(bookId, idx);
        setStatus(chapters[idx]?.content ? 'ready' : 'error');
      }, 260);
    },
    [bookId, chapters, openChapter, setToolbarVisible, total],
  );

  const goToPage = React.useCallback(
    (delta: number) => {
      const target = pageIndex + delta;
      if (target < 0) {
        if (chapterIndex > 0) {
          pendingLandRef.current = 'last';
          goToChapter(chapterIndex - 1);
        }
        return;
      }
      if (target >= pages.length) {
        if (chapterIndex < total - 1) {
          pendingLandRef.current = null;
          goToChapter(chapterIndex + 1);
        }
        return;
      }
      const offset = target * viewportWidth;
      // react-native-web 上 FlatList 的 scrollToIndex/scrollToOffset 会静默不滚动，
      // 需要定位真正横向 overflow 的 DOM 节点，scroll-snap 会把落点吸附到整页。
      if (Platform.OS === 'web') {
        const node = findReaderPageScrollNode();
        // RNW 会把 ScrollView DOM 节点的 scrollTo 覆写成 {x,y,animated} 签名，
        // 直接传 DOM 标准的 {left,behavior} 会被忽略，键盘/点击翻页因此不生效；
        // 调用原生 scrollTo 绕过该补丁，保留平滑滚动。
        if (node) {
          const nativeScrollTo = HTMLElement.prototype.scrollTo as unknown as (
            this: Element,
            options: { left: number; behavior: ScrollBehavior },
          ) => void;
          nativeScrollTo.call(node, { left: offset, behavior: 'smooth' });
        }
      } else {
        flatListRef.current?.scrollToOffset({ offset, animated: true });
      }
      currentOffsetRef.current = pages[target]?.startOffset ?? 0;
      setPageIndex(target);
    },
    [chapterIndex, goToChapter, pageIndex, pages, total, viewportWidth],
  );

  // Web 键盘监听用 ref 取最新 goToPage，避免闭包过期。
  const goToPageRef = React.useRef(goToPage);
  React.useEffect(() => {
    goToPageRef.current = goToPage;
  }, [goToPage]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || settings.pageMode !== 'page') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPageRef.current(-1);
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        e.key === ' '
      ) {
        e.preventDefault();
        goToPageRef.current(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.pageMode]);

  const renderPage = React.useCallback(
    ({ item, index }: { item: ReaderPageData; index: number }) => {
      const isLastPage = index === pages.length - 1;

      return (
        <Pressable
          onPress={(e: any) => {
            // react-native-web 上 onPress 来自 DOM click，其 nativeEvent 是 MouseEvent，
            // 没有 locationX，只有 pageX/offsetX；原来只读 locationX 会恒退化到 viewportWidth/2，
            // 使每次点击都落在中间热区（只切换工具栏），左右翻页热区在 web 端形同虚设。
            const ne = e?.nativeEvent ?? {};
            const x =
              ne.locationX != null
                ? ne.locationX
                : ne.pageX != null
                ? ne.pageX
                : viewportWidth / 2;
            if (x < viewportWidth / 3) {
              goToPage(-1);
            } else if (x > (viewportWidth * 2) / 3) {
              goToPage(1);
            } else {
              toggleToolbar();
            }
          }}
          style={[
            styles.pagePanel,
            {
              width: viewportWidth,
              paddingTop: PAGE_TOP_PADDING,
              paddingBottom: PAGE_BOTTOM_PADDING,
            },
            WEB_SNAP_ITEM,
          ]}
        >
          {item.showHeader && (
            <>
              <Text
                style={[
                  styles.chapterTitle,
                  {
                    fontSize: display.titleSize,
                    color: display.theme.text,
                  },
                ]}
              >
                {chapter?.title || book?.title}
              </Text>
              <Text style={[styles.chapterMeta, { color: display.theme.sub }]}>
                {book?.title} · {book?.author}
              </Text>
            </>
          )}
          {item.blocks.length === 0 ? (
            <Text
              style={{
                fontFamily: SERIF_FONT,
                fontSize: display.fontSize,
                lineHeight: display.fontSize * display.lineHeight,
                color: display.theme.text,
                textAlign: 'justify',
              }}
            >
              本章暂无内容
            </Text>
          ) : (
            // 每段独立成块，块间用 marginTop 留段间距（首块不留），页首续段块也不留。
            item.blocks.map((block, i) => (
              <Text
                key={block.startOffset}
                style={{
                  fontFamily: SERIF_FONT,
                  fontSize: display.fontSize,
                  lineHeight: display.fontSize * display.lineHeight,
                  color: display.theme.text,
                  textAlign: 'justify',
                  marginTop: i === 0 ? 0 : display.paraGap,
                }}
              >
                {block.text}
              </Text>
            ))
          )}
          {isLastPage && (
            <Text style={[styles.pageEndText, { color: display.theme.sub }]}>
              本章完
            </Text>
          )}
        </Pressable>
      );
    },
    [
      book?.author,
      book?.title,
      chapter?.title,
      display.fontSize,
      display.lineHeight,
      display.paraGap,
      display.theme.sub,
      display.theme.text,
      display.titleSize,
      goToPage,
      pages.length,
      toggleToolbar,
      viewportWidth,
    ],
  );

  const getPageLayout = React.useCallback(
    (_: ArrayLike<ReaderPageData> | null | undefined, index: number) => ({
      length: viewportWidth,
      offset: viewportWidth * index,
      index,
    }),
    [viewportWidth],
  );

  const handlePageMomentumEnd = React.useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const raw = Math.round(event.nativeEvent.contentOffset.x / viewportWidth);
      const next = Math.max(0, Math.min(pages.length - 1, raw));
      currentOffsetRef.current = pages[next]?.startOffset ?? 0;
      setPageIndex(next);
    },
    [pages, viewportWidth],
  );

  const syncPageByScrollOffset = React.useCallback(
    (offsetX: number) => {
      const raw = Math.round(offsetX / viewportWidth);
      const next = Math.max(0, Math.min(pages.length - 1, raw));
      currentOffsetRef.current = pages[next]?.startOffset ?? 0;
      setPageIndex(prev => (prev === next ? prev : next));
    },
    [pages, viewportWidth],
  );

  const handlePageScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const x = event.nativeEvent.contentOffset.x;
      if (Platform.OS === 'web') {
        if (webScrollIdleRef.current) clearTimeout(webScrollIdleRef.current);
        // Web 端滑动期间只记录最后落点，等浏览器惯性 + scroll-snap 落定后再同步页码，避免高频 setState 影响滚动性能。
        webScrollIdleRef.current = setTimeout(() => {
          syncPageByScrollOffset(x);
        }, 80);
        return;
      }

      if (x < -CHAPTER_TURN_THRESHOLD && pageIndex === 0) {
        if (chapterIndex > 0) {
          pendingLandRef.current = 'last';
          goToChapter(chapterIndex - 1);
        }
      } else if (
        x > (pages.length - 1) * viewportWidth + CHAPTER_TURN_THRESHOLD &&
        pageIndex === pages.length - 1
      ) {
        if (chapterIndex < total - 1) {
          pendingLandRef.current = null;
          goToChapter(chapterIndex + 1);
        }
      }
    },
    [
      chapterIndex,
      goToChapter,
      pageIndex,
      pages.length,
      syncPageByScrollOffset,
      total,
      viewportWidth,
    ],
  );

  const paragraphNodes = React.useMemo(
    () =>
      paragraphs.map((p, i) => (
        <Text
          key={i}
          style={{
            fontFamily: SERIF_FONT,
            fontSize: display.fontSize,
            lineHeight: display.fontSize * display.lineHeight,
            marginBottom: display.paraGap,
            color: display.theme.text,
            textAlign: 'justify',
          }}
        >
          {'　　' + p}
        </Text>
      )),
    [
      display.fontSize,
      display.lineHeight,
      display.paraGap,
      display.theme.text,
      paragraphs,
    ],
  );

  const handleBack = () => {
    // 阅读页返回必须保持原导航栈语义：从详情进入回详情，从书架进入回书架；无历史栈时再兜底到详情页。
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('BookDetail', { bookId });
  };

  if (!book) return null;

  return (
    <View style={[styles.container, { backgroundColor: display.theme.bg }]}>
      {status === 'ready' &&
        (settings.pageMode === 'page' ? (
          <>
            <FlatList
              ref={flatListRef}
              testID="reader-page-list"
              data={pages}
              renderItem={renderPage}
              keyExtractor={item => item.key}
              horizontal
              pagingEnabled={Platform.OS !== 'web'}
              style={[StyleSheet.absoluteFill, WEB_SNAP_CONTAINER]}
              showsHorizontalScrollIndicator={false}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews
              getItemLayout={getPageLayout}
              onScrollBeginDrag={() => setToolbarVisible(false)}
              onMomentumScrollEnd={handlePageMomentumEnd}
              scrollEventThrottle={16}
              onScroll={handlePageScroll}
            />
            {Platform.OS !== 'web' && paragraphs.length > 0 && (
              <Text
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: pageMetrics.maxWidth,
                  fontFamily: SERIF_FONT,
                  fontSize: display.fontSize,
                  lineHeight: display.fontSize * display.lineHeight,
                }}
                onTextLayout={e => {
                  const chapterId = chapter?.id || bookId;
                  const cacheKey = `${chapterId}|${pageMetrics.maxWidth}|${display.fontSize}|${display.lineHeight}`;
                  if (measuredLinesCache.has(cacheKey)) return;
                  const lineTexts = e.nativeEvent.lines.map(l => l.text);
                  const lines = linesFromTextLayout(paragraphs, lineTexts);
                  cacheMeasuredLines(cacheKey, lines);
                  setMeasureTick(t => t + 1);
                }}
              >
                {paragraphs.map(p => INDENT + p).join('\n')}
              </Text>
            )}
          </>
        ) : (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{
              padding: PAGE_HORIZONTAL_PADDING,
              paddingTop: PAGE_TOP_PADDING,
              paddingBottom: PAGE_BOTTOM_PADDING,
            }}
            onScrollBeginDrag={() => setToolbarVisible(false)}
          >
            <Pressable onPress={toggleToolbar}>
              <Text
                style={[
                  styles.chapterTitle,
                  { fontSize: display.titleSize, color: display.theme.text },
                ]}
              >
                {chapter?.title || book.title}
              </Text>
              <Text style={[styles.chapterMeta, { color: display.theme.sub }]}>
                {book.title} · {book.author}
              </Text>
              {paragraphs.length === 0 ? (
                <Text style={{ color: display.theme.sub, fontSize: 14 }}>
                  本章暂无内容
                </Text>
              ) : (
                paragraphNodes
              )}
              <View
                style={[
                  styles.endBlock,
                  { borderTopColor: display.theme.hair },
                ]}
              >
                <Text style={{ color: display.theme.sub, fontSize: 12 }}>
                  本章完
                </Text>
                <Pressable
                  onPress={() => goToChapter(chapterIndex + 1)}
                  disabled={chapterIndex >= total - 1}
                  style={[
                    styles.nextBtn,
                    {
                      borderColor: display.theme.text,
                      opacity: chapterIndex >= total - 1 ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: display.theme.text,
                      fontSize: 14,
                      fontFamily: SERIF_FONT,
                    }}
                  >
                    {chapterIndex >= total - 1
                      ? '已是最新章节'
                      : `下一章 · ${chapters[chapterIndex + 1]?.title}`}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </ScrollView>
        ))}

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <View
            style={[
              styles.spinner,
              {
                borderColor: display.theme.hair,
                borderTopColor: NOVEL_ACCENT,
              },
            ]}
          />
          <Text style={{ color: display.theme.sub, fontSize: 13 }}>
            正在加载{chapters[chapterIndex]?.title || '章节'}…
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.centerFill, { paddingHorizontal: 40 }]}>
          <Icon name="error-outline" size={44} color={display.theme.sub} />
          <Text
            style={{
              color: display.theme.text,
              fontSize: 15,
              fontWeight: '500',
              marginTop: 14,
              marginBottom: 8,
            }}
          >
            章节加载失败
          </Text>
          <Text
            style={{
              color: display.theme.sub,
              fontSize: 12.5,
              lineHeight: 20,
              textAlign: 'center',
            }}
          >
            网络似乎不太稳定，请检查连接后重试。已缓存章节仍可离线阅读。
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Pressable
              onPress={() => goToChapter(chapterIndex)}
              style={[styles.retryBtn, { backgroundColor: NOVEL_ACCENT }]}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: Platform.select({ ios: '600', android: 'bold' }),
                }}
              >
                重新加载
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDrawerOpen(true)}
              style={[
                styles.retryBtn,
                { borderWidth: 1, borderColor: display.theme.hair },
              ]}
            >
              <Text style={{ color: display.theme.text, fontSize: 13 }}>
                返回目录
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.progressHint} pointerEvents="none">
        <Text style={{ color: display.theme.sub, fontSize: 10.5 }}>
          {progressLabel}
        </Text>
      </View>

      {isToolbarVisible && (
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: display.chrome.bg,
              borderBottomColor: display.chrome.hair,
            },
          ]}
        >
          <Pressable onPress={handleBack} style={styles.barBtn}>
            <Icon name="arrow-back" size={20} color={display.chrome.ink} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{
                color: display.chrome.ink,
                fontSize: 14,
                fontWeight: Platform.select({ ios: '600', android: 'bold' }),
              }}
            >
              {book.title}
            </Text>
          </View>
          <Pressable
            onPress={() => Alert.alert('更多', '举报 / 分享功能开发中')}
            style={styles.barBtn}
          >
            <Icon name="more-horiz" size={20} color={display.chrome.ink} />
          </Pressable>
        </View>
      )}

      {isToolbarVisible && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: display.chrome.bg,
              borderTopColor: display.chrome.hair,
            },
          ]}
        >
          <View style={styles.chapterNav}>
            <Pressable
              onPress={() => goToChapter(chapterIndex - 1)}
              disabled={chapterIndex <= 0}
            >
              <Text
                style={{
                  color: display.chrome.ink,
                  fontSize: 12.5,
                  opacity: chapterIndex <= 0 ? 0.4 : 1,
                }}
              >
                上一章
              </Text>
            </Pressable>
            <View
              style={[
                styles.sliderTrack,
                { backgroundColor: display.chrome.hair },
              ]}
            >
              <View style={[styles.sliderFill, { width: `${progressPct}%` }]} />
              <View style={[styles.sliderThumb, { left: `${progressPct}%` }]} />
            </View>
            <Pressable
              onPress={() => goToChapter(chapterIndex + 1)}
              disabled={chapterIndex >= total - 1}
            >
              <Text
                style={{
                  color: display.chrome.ink,
                  fontSize: 12.5,
                  opacity: chapterIndex >= total - 1 ? 0.4 : 1,
                }}
              >
                下一章
              </Text>
            </Pressable>
          </View>
          <View style={styles.actionRow}>
            <ReaderAction
              icon="list-alt"
              label="目录"
              color={display.chrome.ink}
              onPress={() => {
                setDrawerOpen(true);
                setToolbarVisible(false);
              }}
            />
            <ReaderAction
              icon={hasBookmark ? 'bookmark' : 'bookmark-border'}
              label="书签"
              color={display.chrome.ink}
              onPress={() => chapter && toggleBookmark(bookId, chapter.id)}
            />
            <ReaderAction
              icon={isNight ? 'wb-sunny' : 'brightness-2'}
              label={isNight ? '日间' : '夜间'}
              color={display.chrome.ink}
              onPress={() => setReaderTheme(isNight ? 'paper' : 'night')}
            />
            <ReaderAction
              icon="tune"
              label="设置"
              color={display.chrome.ink}
              onPress={() => {
                setSettingsOpen(true);
                setToolbarVisible(false);
              }}
            />
          </View>
        </View>
      )}

      {settingsOpen && (
        <>
          <Pressable
            style={styles.overlay}
            onPress={() => setSettingsOpen(false)}
          />
          <View
            style={[styles.sheet, { backgroundColor: display.chrome.sheetBg }]}
          >
            <View
              style={[styles.grabber, { backgroundColor: display.chrome.hair }]}
            />

            <View style={styles.brightnessRow}>
              <Icon
                name="brightness-6"
                size={18}
                color={display.chrome.sheetSub}
              />
              <View
                style={[
                  styles.sliderTrack,
                  { backgroundColor: display.chrome.hair, height: 5 },
                ]}
              >
                <View
                  style={[
                    styles.sliderFill,
                    { width: '55%', backgroundColor: NOVEL_GOLD },
                  ]}
                />
                <View style={[styles.sliderThumb, { left: '55%' }]} />
              </View>
            </View>

            <View style={styles.fontRow}>
              <Text
                style={{
                  color: display.chrome.sheetSub,
                  fontSize: 12,
                  width: 42,
                }}
              >
                字号
              </Text>
              <Pressable
                onPress={decFont}
                style={[styles.fontBtn, { borderColor: display.chrome.hair }]}
              >
                <Text style={{ color: display.chrome.sheetInk, fontSize: 15 }}>
                  A−
                </Text>
              </Pressable>
              <View style={{ width: 30, alignItems: 'center' }}>
                <Text
                  style={{
                    color: display.chrome.sheetInk,
                    fontSize: 15,
                    fontFamily: SERIF_FONT,
                  }}
                >
                  {display.fontSize}
                </Text>
              </View>
              <Pressable
                onPress={incFont}
                style={[styles.fontBtn, { borderColor: display.chrome.hair }]}
              >
                <Text style={{ color: display.chrome.sheetInk, fontSize: 19 }}>
                  A+
                </Text>
              </Pressable>
            </View>

            <View style={{ marginBottom: 18 }}>
              <Text
                style={{
                  color: display.chrome.sheetSub,
                  fontSize: 12,
                  marginBottom: 7,
                }}
              >
                行间距
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {LINE_LABELS.map((label, i) => {
                  const on = settings.lineHeightIndex === i;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setLineHeightIndex(i)}
                      style={[
                        styles.optBtn,
                        {
                          backgroundColor: on ? NOVEL_ACCENT : 'transparent',
                          borderColor: on ? NOVEL_ACCENT : display.chrome.hair,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: on ? '#fff' : display.chrome.sheetInk,
                          fontSize: 12,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginBottom: 18 }}>
              <Text
                style={{
                  color: display.chrome.sheetSub,
                  fontSize: 12,
                  marginBottom: 9,
                }}
              >
                阅读背景
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {THEME_ORDER.map(key => {
                  const t = READER_THEMES[key];
                  const on = settings.theme === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setReaderTheme(key)}
                      style={styles.themeItem}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: t.bg,
                            borderColor: on
                              ? NOVEL_ACCENT
                              : display.chrome.hair,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: t.text,
                            fontFamily: SERIF_FONT,
                            fontSize: 16,
                          }}
                        >
                          文
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: on ? NOVEL_ACCENT : display.chrome.sheetSub,
                          fontSize: 11,
                        }}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text
                style={{
                  color: display.chrome.sheetSub,
                  fontSize: 12,
                  marginBottom: 7,
                }}
              >
                翻页方式
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { key: 'scroll', label: '上下滚动' },
                  { key: 'page', label: '左右翻页' },
                ].map(o => {
                  const on = settings.pageMode === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setPageMode(o.key as 'scroll' | 'page')}
                      style={[
                        styles.optBtn,
                        {
                          backgroundColor: on ? NOVEL_ACCENT : 'transparent',
                          borderColor: on ? NOVEL_ACCENT : display.chrome.hair,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: on ? '#fff' : display.chrome.sheetInk,
                          fontSize: 12,
                        }}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </>
      )}

      {drawerOpen && (
        <>
          <Pressable
            style={styles.overlay}
            onPress={() => setDrawerOpen(false)}
          />
          <View
            style={[styles.drawer, { backgroundColor: display.chrome.sheetBg }]}
          >
            <View style={{ padding: 18, paddingTop: 48, paddingBottom: 12 }}>
              <Text
                style={{
                  fontFamily: SERIF_FONT,
                  fontSize: 18,
                  fontWeight: Platform.select({ ios: '700', android: 'bold' }),
                  color: display.chrome.sheetInk,
                }}
              >
                {book.title}
              </Text>
              <Text
                style={{
                  color: display.chrome.sheetSub,
                  fontSize: 12,
                  marginTop: 3,
                }}
              >
                共 {total} 章
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <View
                  style={[
                    styles.drawerSearch,
                    { backgroundColor: display.chrome.field },
                  ]}
                >
                  <Icon
                    name="search"
                    size={14}
                    color={display.chrome.sheetSub}
                  />
                  <TextInput
                    value={drawerQuery}
                    onChangeText={setDrawerQuery}
                    placeholder="搜索章节"
                    placeholderTextColor={display.chrome.sheetSub}
                    style={{
                      flex: 1,
                      color: display.chrome.sheetInk,
                      fontSize: 12,
                      padding: 0,
                      marginLeft: 7,
                    }}
                  />
                </View>
                <Pressable
                  onPress={() =>
                    setDrawerOrder(o => (o === 'asc' ? 'desc' : 'asc'))
                  }
                  style={[
                    styles.orderBtn,
                    { borderColor: display.chrome.hair },
                  ]}
                >
                  <Icon
                    name="swap-vert"
                    size={14}
                    color={display.chrome.sheetInk}
                  />
                  <Text
                    style={{ color: display.chrome.sheetInk, fontSize: 12 }}
                  >
                    {drawerOrder === 'asc' ? '正序' : '倒序'}
                  </Text>
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 6,
                paddingBottom: 20,
              }}
            >
              {drawerList.map(({ c, idx }) => {
                const isCur = idx === chapterIndex;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => goToChapter(idx)}
                    style={[
                      styles.chapterRow,
                      {
                        backgroundColor: isCur
                          ? 'rgba(46,107,94,.1)'
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isCur ? NOVEL_ACCENT : display.chrome.sheetSub,
                        fontSize: 12,
                        width: 34,
                      }}
                    >
                      {idx + 1}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 13.5,
                        color: isCur ? NOVEL_ACCENT : display.chrome.sheetInk,
                        fontWeight: isCur ? '700' : '400',
                      }}
                    >
                      {c.title}
                    </Text>
                    {isCur && (
                      <Text style={{ color: NOVEL_ACCENT, fontSize: 10 }}>
                        在读
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {/* 章节已在本地一次性加载，这里保留设计稿的目录尾部控件但不触发分页。 */}
              <Pressable
                disabled
                style={[
                  styles.drawerFooterBtn,
                  { borderColor: display.chrome.hair },
                ]}
              >
                <Text style={{ color: display.chrome.sheetSub, fontSize: 13 }}>
                  已显示全部章节
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function ReaderAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionItem}>
      <Icon name={icon} size={21} color={color} />
      <Text style={{ color, fontSize: 11, marginTop: 5 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pagePanel: {
    paddingHorizontal: PAGE_HORIZONTAL_PADDING,
  },
  pageEndText: {
    marginTop: 18,
    fontSize: 12,
    textAlign: 'center',
  },
  chapterTitle: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    marginBottom: 8,
    lineHeight: 30,
  },
  chapterMeta: { fontSize: 12, marginBottom: 24 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  spinner: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  endBlock: {
    marginTop: 38,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  nextBtn: {
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 8 },
  progressHint: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingBottom: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  barBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
  },
  chapterNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderTrack: { flex: 1, height: 4, borderRadius: 2, position: 'relative' },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: NOVEL_ACCENT,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: NOVEL_ACCENT,
    transform: [{ translateX: -7 }, { translateY: -7 }],
  },
  actionRow: { flexDirection: 'row', marginTop: 14 },
  actionItem: { flex: 1, alignItems: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingTop: 8,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  brightnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  fontBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optBtn: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeItem: { flex: 1, alignItems: 'center', gap: 6 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
  },
  drawerSearch: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  orderBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 1,
  },
  drawerFooterBtn: {
    marginHorizontal: 6,
    marginTop: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
