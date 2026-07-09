import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Platform,
  Animated,
  Easing,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Brightness from '../native/Brightness';
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
  useUpdateReadingProgress,
  useCurrentBookHistory,
  useReaderSettings,
  useReaderDisplay,
  useSetReaderTheme,
  useAdjustFontSize,
  useSetLineHeightIndex,
  useSetReaderFont,
  useSetPageMode,
  useSetBrightness,
  useToggleToolbar,
  useSetToolbarVisible,
  useReaderState,
  useBookmarks,
  useToggleBookmark,
  BOOKSHUKU_CONTENT_VERSION,
  useEnsureChapterContent,
  useLoadNextChapterPage,
  useAddReadingTime,
} from '../store';
import {
  DRAWER_WIDTH,
  NOVEL_ACCENT,
  NOVEL_GOLD,
  READER_THEMES,
  ReaderThemeKey,
} from '../theme/readerThemes';
import type { Chapter } from '../store/types/book';
import { SERIF_FONT } from '../theme/fonts';
import { useReaderFontFamily } from '../services/fonts/useReaderFontFamily';
import { FONTS, DEFAULT_FONT_KEY } from '../theme/fontCatalog';
import {
  ensureFont,
  isFontReady,
  isFontLoading,
} from '../services/fonts/fontManager';
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
import { startReadingSession } from '../utils/readingSession';
import {
  formatReaderChapterLabel,
  formatReaderClock,
} from '../utils/readerChrome';
import { createLatestRequestTracker } from '../utils/latestRequest';
import {
  readingPositionToScrollOffset,
  scrollOffsetToReadingPosition,
} from '../utils/readerProgress';
import {
  ChapterNavigationIntent,
  getChapterLanding,
  getBoundaryTurn,
  isStaleScrollSync,
} from '../utils/readerScrollGuard';
import { resolveChapterSearchIndex } from '../utils/chapterSearch';
import { useReaderGuards } from './reader/useReaderGuards';
import {
  isFullscreenSupported,
  isFullscreen as fsIsFullscreen,
  toggleFullscreen,
  subscribeFullscreen,
} from '../utils/fullscreen';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;
type DrawerChapterItem = { c: Chapter; idx: number };

function isBlockedBookshukuText(content?: string): boolean {
  const normalized = (content || '').replace(/\s+/g, '');
  return !!(
    content &&
    (/请在浏览器中打开/.test(content) ||
      /当前环境无法直接下载/.test(content) ||
      /点击右上角.*按钮/.test(content) ||
      /复制链接到浏览器/.test(content) ||
      /Just a moment/i.test(content) ||
      /Enable JavaScript and cookies/i.test(content) ||
      /外围名媛|福利姬|自慰|口交|成人视频|性感女性|访问权限|立即下载|约爱社区/.test(normalized) ||
      /👁️/.test(content) ||
      normalized.length < 200)
  );
}

function displayChapterTitle(chapter: Chapter, index: number): string {
  const fallback = `第${index + 1}章`;
  const title = chapter.title.replace(/\s+/g, ' ').trim();
  const suffix = title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/, '')
    .trim();
  if (
    /^(恭喜!?|恭喜！|心动时刻|温馨提醒|漫画主页|外围名媛|约爱社区|👏💦约爱社区)$/.test(title) ||
    /^(恭喜!?|恭喜！|心动时刻|温馨提醒|漫画主页|外围名媛|约爱社区|👏💦约爱社区)$/.test(suffix)
  ) {
    return fallback;
  }
  return title || fallback;
}

function needsDrawerTitleResolve(chapter: Chapter): boolean {
  const title = chapter.title.replace(/\s+/g, ' ').trim();
  const suffix = title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/, '')
    .trim();
  return (
    chapter.contentVersion !== BOOKSHUKU_CONTENT_VERSION ||
    /^第\s*\d+\s*章$/.test(title) ||
    /^分节阅读\s*\d+$/.test(title) ||
    /^(恭喜!?|恭喜！|心动时刻|温馨提醒|漫画主页|外围名媛|约爱社区|👏💦约爱社区)$/.test(title) ||
    /^(恭喜!?|恭喜！|心动时刻|温馨提醒|漫画主页|外围名媛|约爱社区|👏💦约爱社区)$/.test(suffix)
  );
}

const LINE_LABELS = ['紧凑', '适中', '宽松'];
const THEME_ORDER: ReaderThemeKey[] = ['paper', 'gray', 'green', 'night'];
const PAGE_HORIZONTAL_PADDING = 20;
const PAGE_TOP_PADDING = 36;
const PAGE_BOTTOM_PADDING = 48;
/** 阅读列最大宽度（含左右内边距）：宽屏下超出则居中留白，避免一行几十字难读。 */
const READER_MAX_CONTENT = 680;
/** 章节边界越界回弹翻章的位移阈值 */
const CHAPTER_TURN_THRESHOLD = 40;
const DRAWER_CHAPTER_ROW_HEIGHT = 46;

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

// 浮层进出场过渡：open 关闭后先播完退场动画再卸载，避免直接闪现/闪没。
function useOverlayTransition(open: boolean, duration = 220) {
  const [mounted, setMounted] = React.useState(open);
  const value = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, duration, value]);
  return { mounted, value };
}

export default function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderRoute>();
  const winDims = useWindowDimensions();
  // 分页断行必须用阅读器容器的真实宽高：web 大屏下 app 可能被约束得比窗口窄，
  // useWindowDimensions 返回的是窗口尺寸，按它分页会让每行过宽、右侧溢出被裁切。
  // 用根 View 的 onLayout 量实际尺寸（原生即全屏，web 即受约束的容器）。
  const [layout, setLayout] = React.useState<{ w: number; h: number } | null>(
    null,
  );
  const viewportWidth = layout?.w ?? winDims.width;
  const viewportHeight = layout?.h ?? winDims.height;
  const insets = useSafeAreaInsets();
  // 顶/底工具栏与进度提示按安全区避让刘海/灵动岛与底部手势条。
  // web 无状态栏/刘海，顶栏 44 的状态栏预留会变成大片空白，收到 12。
  const topBarPad =
    Platform.OS === 'web' ? 12 : Math.max(insets.top, 12) + 8;
  const readerStatusTop =
    Platform.OS === 'web' ? 10 : Math.max(insets.top, 8);
  const readerTopPadding =
    PAGE_TOP_PADDING +
    (Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 12));
  const bottomBarPad =
    Platform.OS === 'web' ? 22 : Math.max(insets.bottom, 8) + 14;
  const progressHintBottom =
    Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 10);
  const { bookId, openDrawer } = route.params;

  const books = useAllBooks();
  const book = books.find(b => b.id === bookId);
  const isOnline = !!book?.source;
  const selectBook = useSelectBook();
  const chapters = useBookChapters(bookId);
  const chapterIndex = useCurrentChapterIndex() ?? 0;
  const content = useCurrentChapterContent();
  const openChapter = useOpenChapter();
  const updateProgress = useUpdateReadingProgress();
  const bookHistory = useCurrentBookHistory();
  // 在线书章节正文按需抓取，用 ref 持有以免作为副作用依赖导致重复触发。
  const ensureChapterContent = useEnsureChapterContent();
  const ensureRef = React.useRef(ensureChapterContent);
  React.useEffect(() => {
    ensureRef.current = ensureChapterContent;
  });
  const loadNextChapterPage = useLoadNextChapterPage();
  const loadNextPageRef = React.useRef(loadNextChapterPage);
  React.useEffect(() => {
    loadNextPageRef.current = loadNextChapterPage;
  });

  const settings = useReaderSettings();
  const display = useReaderDisplay();
  // 阅读正文字体：随设置切换，远程字体就绪后自动重渲染；用于正文与分页测量。
  const bodyFont = useReaderFontFamily();
  const setReaderTheme = useSetReaderTheme();
  const { inc: incFont, dec: decFont } = useAdjustFontSize();
  const setLineHeightIndex = useSetLineHeightIndex();
  const setReaderFont = useSetReaderFont();
  const setPageMode = useSetPageMode();
  const setBrightness = useSetBrightness();

  const { isToolbarVisible } = useReaderState();
  const toggleToolbar = useToggleToolbar();
  const setToolbarVisible = useSetToolbarVisible();

  // 全屏：Web 用浏览器 Fullscreen API，原生用沉浸式隐藏状态栏。偏好由全局
  // FullscreenController 持久化并跨屏保持，这里只订阅实际状态以同步按钮图标。
  const [isFs, setIsFs] = React.useState(fsIsFullscreen());
  React.useEffect(() => subscribeFullscreen(setIsFs), []);

  // 阅读时长统计：阅读器挂载期间按前台时间累计到今天。用 ref 持有累加器避免作为依赖；
  // 计时由全局单例 startReadingSession 负责，避免导航过渡中出现两个实例时重复计时。
  const addReadingTime = useAddReadingTime();
  const addReadingTimeRef = React.useRef(addReadingTime);
  React.useEffect(() => {
    addReadingTimeRef.current = addReadingTime;
  });
  React.useEffect(
    () => startReadingSession(ms => addReadingTimeRef.current(ms)),
    [],
  );

  const bookmarks = useBookmarks(bookId);
  const toggleBookmark = useToggleBookmark();

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(!!openDrawer);

  // 工具栏 / 设置面板 / 目录抽屉的进出场过渡。
  const barsTransition = useOverlayTransition(isToolbarVisible);
  const sheetTransition = useOverlayTransition(settingsOpen);
  const drawerTransition = useOverlayTransition(drawerOpen);
  const [sheetHeight, setSheetHeight] = React.useState(420);

  // 亮度（仅原生）：进入阅读器记住系统原始亮度、套用已保存的阅读亮度，离开时恢复。
  const [brightnessLevel, setBrightnessLevel] = React.useState(
    settings.brightness ?? 0.5,
  );
  const brightnessTrackWRef = React.useRef(0);
  React.useEffect(() => {
    if (!Brightness.isSupported) return;
    let active = true;
    let original: number | null = null;
    Brightness.getBrightness().then(sys => {
      if (!active) return;
      original = sys;
      if (settings.brightness != null) {
        Brightness.setBrightness(settings.brightness);
        setBrightnessLevel(settings.brightness);
      } else if (sys != null) {
        setBrightnessLevel(sys);
      }
    });
    return () => {
      active = false;
      if (original != null) Brightness.setBrightness(original);
    };
    // 仅在进入/离开阅读器时执行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const applyBrightness = React.useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setBrightnessLevel(clamped);
      Brightness.setBrightness(clamped);
      setBrightness(clamped);
    },
    [setBrightness],
  );

  const [drawerOrder, setDrawerOrder] = React.useState<'asc' | 'desc'>('asc');
  const [drawerTab, setDrawerTab] = React.useState<'toc' | 'marks'>('toc');
  const [drawerQuery, setDrawerQuery] = React.useState('');
  const [drawerVisibleIndices, setDrawerVisibleIndices] = React.useState<
    number[]
  >([]);
  const drawerTocRef = React.useRef<FlatList<DrawerChapterItem>>(null);
  const drawerViewabilityConfigRef = React.useRef({
    itemVisiblePercentThreshold: 40,
  });
  const onDrawerViewableItemsChangedRef = React.useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item?: DrawerChapterItem }>;
    }) => {
      setDrawerVisibleIndices(
        viewableItems
          .map(item => item.item?.idx)
          .filter((idx): idx is number => typeof idx === 'number'),
      );
    },
  );
  const [status, setStatus] = React.useState<'ready' | 'loading' | 'error'>(
    'ready',
  );
  const [contentReloadKey, setContentReloadKey] = React.useState(0);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [measureTick, setMeasureTick] = React.useState(0);
  const [scrollPosition, setScrollPosition] = React.useState(0);
  const [scrollMetrics, setScrollMetrics] = React.useState({
    contentHeight: 0,
    viewportHeight: 0,
  });
  // 远距离跳页（换章落到末页/续读远页）时先关掉 scroll-snap，否则强制吸附会把
  // 程序滚动拽回已渲染的邻近页；滚动落定并渲染出目标页后再恢复吸附。
  const [snapEnabled, setSnapEnabled] = React.useState(true);
  const snapTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flatListRef = React.useRef<FlatList<ReaderPageData>>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const currentOffsetRef = React.useRef(0);
  const pendingLandRef = React.useRef<'last' | null>(null);
  // 换章/重排版后需要把横向容器定位到的目标页；setPageIndex 只更新页码，
  // 不会滚动容器，需在新内容布局完成后由 rAF 轮询补一次定位。
  const pendingScrollPageRef = React.useRef<number | null>(null);
  const prevChapterIdRef = React.useRef<string | undefined>(undefined);
  // 续读：捕获打开时保存的页内偏移，仅在首个匹配章节应用一次。
  const resumeRef = React.useRef<{ chapterId: string; position: number } | null>(
    null,
  );
  const resumeCapturedRef = React.useRef(false);
  if (!resumeCapturedRef.current && bookHistory) {
    resumeCapturedRef.current = true;
    resumeRef.current = {
      chapterId: bookHistory.chapterId,
      position: bookHistory.position,
    };
  }
  // updateProgress 每次渲染换新引用，用 ref 持有，避免作为副作用依赖导致写库循环。
  const updateProgressRef = React.useRef(updateProgress);
  React.useEffect(() => {
    updateProgressRef.current = updateProgress;
  });
  const transitionRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scrollProgressTimerRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const pendingScrollPositionRef = React.useRef<number | null>(null);
  const resolvingDrawerTitlesRef = React.useRef<Set<string>>(new Set());
  const contentRequestTrackerRef = React.useRef<ReturnType<
    typeof createLatestRequestTracker
  > | null>(null);
  if (!contentRequestTrackerRef.current) {
    contentRequestTrackerRef.current = createLatestRequestTracker();
  }
  const {
    chapterTurnLockRef,
    invalidateWebScrollSync,
    lockChapterTurn,
    markUserWebScroll,
    markWebProgrammaticScroll,
    unlockChapterTurnSoon,
    webProgrammaticScrollRef,
    webScrollEpochRef,
    webScrollIdleRef,
  } = useReaderGuards();

  React.useEffect(() => {
    selectBook(bookId);
  }, [bookId, selectBook]);

  React.useEffect(
    () => () => {
      if (transitionRef.current) clearTimeout(transitionRef.current);
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      if (scrollProgressTimerRef.current) {
        clearTimeout(scrollProgressTimerRef.current);
      }
    },
    [],
  );

  const total = chapters.length;
  const drawerList = React.useMemo(() => {
    let list = chapters.map((c, idx) => ({ c, idx }));
    if (drawerOrder === 'desc') list = list.slice().reverse();
    return list;
  }, [chapters, drawerOrder]);

  const drawerTargetIndex = React.useMemo(() => {
    const targetChapterIndex = resolveChapterSearchIndex(
      chapters,
      drawerQuery,
      chapterIndex,
    );
    return drawerOrder === 'desc'
      ? total - 1 - targetChapterIndex
      : targetChapterIndex;
  }, [chapterIndex, chapters, drawerOrder, drawerQuery, total]);

  const scrollDrawerToIndex = React.useCallback(
    (index: number, animated: boolean) => {
      if (index < 0 || index >= drawerList.length) return;
      requestAnimationFrame(() => {
        drawerTocRef.current?.scrollToIndex({
          index,
          animated,
          viewPosition: 0.35,
        });
      });
    },
    [drawerList.length],
  );

  React.useEffect(() => {
    if (!drawerOpen || !drawerTransition.mounted || drawerTab !== 'toc') return;
    // 目录不再按搜索词过滤，输入只驱动滚动定位；打开目录时默认把当前阅读章节带到视野中。
    scrollDrawerToIndex(drawerTargetIndex, drawerQuery.trim().length > 0);
  }, [
    drawerOpen,
    drawerTab,
    drawerTargetIndex,
    drawerQuery,
    drawerTransition.mounted,
    scrollDrawerToIndex,
  ]);

  const drawerVisibleKey = drawerVisibleIndices.join(',');
  React.useEffect(() => {
    if (
      !drawerOpen ||
      drawerTab !== 'toc' ||
      book?.source?.name !== 'bookshuku' ||
      drawerVisibleIndices.length === 0
    ) {
      return;
    }
    let cancelled = false;
    const targets = drawerVisibleIndices
      .map(idx => ({ idx, chapter: chapters[idx] }))
      .filter(
        item =>
          item.chapter?.sourceUrl &&
          needsDrawerTitleResolve(item.chapter) &&
          !resolvingDrawerTitlesRef.current.has(item.chapter.id),
      )
      .slice(0, 2);
    if (targets.length === 0) return;

    // 浮层目录只解析当前可见项的真实标题；分批串行，避免打开目录时一次性抓完整本。
    targets.forEach(({ chapter }) =>
      resolvingDrawerTitlesRef.current.add(chapter.id),
    );
    const timer = setTimeout(() => {
      if (cancelled) return;
      (async () => {
        for (const { idx, chapter } of targets) {
          if (cancelled) return;
          try {
            await ensureRef.current(bookId, idx, { background: true });
          } catch (error) {
            console.warn('[ReaderScreen] resolve drawer title failed', {
              bookId,
              index: idx,
              title: chapter.title,
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            resolvingDrawerTitlesRef.current.delete(chapter.id);
          }
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    book?.source?.name,
    bookId,
    chapters,
    drawerOpen,
    drawerTab,
    drawerVisibleKey,
  ]);

  const chapter = chapters[chapterIndex];
  const [clockText, setClockText] = React.useState(() =>
    formatReaderClock(new Date()),
  );
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
  const chapterTextLength = React.useMemo(
    () =>
      paragraphs.reduce((sum, paragraph) => {
        return sum + Array.from(paragraph).length;
      }, 0),
    [paragraphs],
  );
  const topChapterLabel = formatReaderChapterLabel(chapter, chapterIndex);

  React.useEffect(() => {
    const tick = () => setClockText(formatReaderClock(new Date()));
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  // 阅读列宽度：窄屏铺满，宽屏封顶到 READER_MAX_CONTENT 并居中（两侧多留白）。
  // paddingH 用于渲染时把文本块在整页/滚动容器内居中；textWidth 用于分页断行。
  const readerColumn = React.useMemo(() => {
    const clamped = Math.min(viewportWidth, READER_MAX_CONTENT);
    const sideGutter = Math.max(0, (viewportWidth - clamped) / 2);
    return {
      paddingH: PAGE_HORIZONTAL_PADDING + sideGutter,
      textWidth: Math.max(1, clamped - PAGE_HORIZONTAL_PADDING * 2),
    };
  }, [viewportWidth]);

  // 左右翻页先按真实字符宽度断行、组页，再交给 FlatList 虚拟渲染，避免大章节一次性挂载所有页面。
  const pageMetrics = React.useMemo(() => {
    const maxWidth = readerColumn.textWidth;
    const bodyHeight = Math.max(
      1,
      viewportHeight - readerTopPadding - PAGE_BOTTOM_PADDING,
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
    readerTopPadding,
    viewportHeight,
    readerColumn.textWidth,
  ]);
  const pages = React.useMemo<ReaderPageData[]>(() => {
    const chapterId = chapter?.id || bookId;
    const measure = getCharWidthMeasurer(bodyFont, display.fontSize);
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
    bodyFont,
  ]);

  React.useEffect(() => {
    const chapterChanged = prevChapterIdRef.current !== chapter?.id;
    prevChapterIdRef.current = chapter?.id;

    if (chapterChanged) {
      invalidateWebScrollSync();
      // 续读位置只在首个章节尝试一次，消费后清空，避免回到该章又跳回旧偏移。
      const resume = resumeRef.current;
      resumeRef.current = null;
      if (settings.pageMode === 'scroll') {
        let position = 0;
        if (pendingLandRef.current === 'last') {
          pendingLandRef.current = null;
          position = chapterTextLength;
          pendingScrollPositionRef.current = Number.MAX_SAFE_INTEGER;
        } else if (
          resume &&
          resume.chapterId === chapter?.id &&
          resume.position > 0
        ) {
          position = resume.position;
          pendingScrollPositionRef.current = position;
        } else {
          pendingScrollPositionRef.current = 0;
        }
        currentOffsetRef.current = position;
        setScrollPosition(position);
        setPageIndex(0);
        return;
      }
      let landing = 0;
      if (pendingLandRef.current === 'last') {
        pendingLandRef.current = null;
        landing = Math.max(0, pages.length - 1);
        currentOffsetRef.current = pages[landing]?.startOffset ?? 0;
      } else if (
        resume &&
        resume.chapterId === chapter?.id &&
        resume.position > 0
      ) {
        landing = findPageByOffset(pages, resume.position);
        currentOffsetRef.current = resume.position;
      } else {
        landing = 0;
        currentOffsetRef.current = 0;
      }
      setPageIndex(landing);
      // 换章会复用同一个横向滚动容器。即使目标是首页，也要在新内容布局完成后
      // 显式滚到 0，否则上一章末页的 scrollLeft 会被浏览器夹到新章最后一页。
      pendingScrollPageRef.current = landing;
      // 远距离落点先关吸附，避免程序滚动被 mandatory-snap 拽回；首页无需处理。
      if (Platform.OS === 'web') setSnapEnabled(landing <= 0);
      return;
    }

    // 同章重新分页时，用逻辑字符偏移映射回原段落附近，避免字号/行距调整后跳回首页。
    invalidateWebScrollSync();
    if (settings.pageMode === 'scroll') {
      pendingScrollPositionRef.current = currentOffsetRef.current;
      setScrollPosition(currentOffsetRef.current);
      setPageIndex(0);
      return;
    }
    const remapped = findPageByOffset(pages, currentOffsetRef.current);
    setPageIndex(remapped);
    // 页宽随分页变化，容器旧 scrollLeft 会指向错页，重排版后同样需要重定位。
    pendingScrollPageRef.current = remapped;
  }, [
    chapter?.id,
    chapterTextLength,
    invalidateWebScrollSync,
    pages,
    settings.pageMode,
  ]);

  const scrollChapterFraction =
    settings.pageMode === 'scroll' && chapterTextLength > 0
      ? Math.max(0, Math.min(1, scrollPosition / chapterTextLength))
      : 0;
  const pageProgressPct =
    total > 0
      ? settings.pageMode === 'page' && pages.length > 0
        ? Math.round(((chapterIndex + pageIndex / pages.length) / total) * 100)
        : Math.round(((chapterIndex + scrollChapterFraction) / total) * 100)
      : progressPct;
  const progressLabel =
    settings.pageMode === 'page'
      ? `本章 ${Math.min(pageIndex + 1, pages.length)} / ${
          pages.length
        } 页 · ${pageProgressPct}%`
      : `本章 ${Math.round(scrollChapterFraction * 100)}% · ${pageProgressPct}%`;

  // 翻页/滚动落定后，把当前页内偏移与书籍进度持久化，重开时精确续读。
  React.useEffect(() => {
    if (status !== 'ready' || !chapter) return;
    updateProgressRef.current(
      bookId,
      pageProgressPct,
      chapter.id,
      currentOffsetRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter?.id, pageIndex, pageProgressPct, scrollPosition, status]);

  // 在线书：当前章正文尚未抓取时按需拉取并缓存，复用现成的 loading / error 态。
  // 本地书章节已带正文，直接置为 ready。effect 以 chapter.id 为键，换章会自动重跑。
  React.useEffect(() => {
    if (!chapter) return;
    const tracker = contentRequestTrackerRef.current!;
    const hasUsableCachedContent =
      !!chapter.content &&
      (book?.source?.name !== 'bookshuku' ||
        (chapter.contentVersion === BOOKSHUKU_CONTENT_VERSION &&
          !isBlockedBookshukuText(chapter.content)));
    if (hasUsableCachedContent) {
      tracker.reset();
      setStatus(prev => (prev === 'ready' ? prev : 'ready'));
      return;
    }
    if (!isOnline) {
      tracker.reset();
      return;
    }
    let cancelled = false;
    const requestToken = tracker.start();
    setStatus('loading');
    ensureRef.current(bookId, chapterIndex)
      .then(filled => {
        if (cancelled || !tracker.isLatest(requestToken)) return;
        if (filled && filled.content) {
          setStatus('ready');
          // 分页章节先保证本章后续页按需续载；只有本章完整后才预取下一章。
          if (!filled.nextPageUrl && chapterIndex + 1 < chapters.length) {
            ensureRef
              .current(bookId, chapterIndex + 1, { background: true })
              .catch(() => {});
          }
        } else {
          setStatus('error');
        }
      })
      .catch(error => {
        console.warn('[ReaderScreen] ensure chapter failed', {
          bookId,
          chapterIndex,
          title: chapter.title,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled && tracker.isLatest(requestToken)) setStatus('error');
      });
    return () => {
      cancelled = true;
      tracker.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    book?.source?.name,
    bookId,
    chapter?.content,
    chapter?.contentVersion,
    chapter?.id,
    chapterIndex,
    contentReloadKey,
    isOnline,
  ]);

  React.useEffect(() => {
    if (status === 'ready') unlockChapterTurnSoon();
  }, [chapter?.id, status, unlockChapterTurnSoon]);

  const closeReadingChrome = React.useCallback(() => {
    // 翻页动作应回到沉浸阅读态：无论当前开的是上下栏、设置面板还是目录抽屉，
    // 都先收起，避免用户点左右翻页后旧浮层继续遮挡正文。
    setSettingsOpen(false);
    setDrawerOpen(false);
    setToolbarVisible(false);
  }, [setToolbarVisible]);

  const goToChapter = React.useCallback(
    (idx: number, intent: ChapterNavigationIntent = 'direct') => {
      if (idx < 0 || idx >= total) return;
      pendingLandRef.current =
        getChapterLanding(intent) === 'last' ? 'last' : null;
      lockChapterTurn();
      invalidateWebScrollSync();
      setStatus('loading');
      closeReadingChrome();
      if (transitionRef.current) clearTimeout(transitionRef.current);
      // 同一章节重试/重开时 chapter.id 不变；显式触发正文加载 effect，
      // 避免只进入 loading 覆盖层但没有重新发起 ensure 请求。
      setContentReloadKey(key => key + 1);
      openChapter(bookId, idx);
      // 目录点击要立即切章并启动正文抓取；抽屉退场动画不能阻塞网络请求，否则未缓存章节体感会多等一轮。
      if (
        chapters[idx]?.content &&
        (book?.source?.name !== 'bookshuku' ||
          (chapters[idx]?.contentVersion === BOOKSHUKU_CONTENT_VERSION &&
            !isBlockedBookshukuText(chapters[idx]?.content)))
      ) {
        setStatus('ready');
      }
      else if (isOnline) setStatus('loading');
      else setStatus('error');
    },
    [
      bookId,
      book?.source?.name,
      chapters,
      closeReadingChrome,
      invalidateWebScrollSync,
      isOnline,
      lockChapterTurn,
      openChapter,
      setToolbarVisible,
      total,
    ],
  );

  const loadCurrentChapterNextPage = React.useCallback(() => {
    if (!chapter?.nextPageUrl || status === 'loading') return false;
    const tracker = contentRequestTrackerRef.current!;
    const requestToken = tracker.start();
    const resumePosition = chapterTextLength;
    lockChapterTurn();
    invalidateWebScrollSync();
    setStatus('loading');
    closeReadingChrome();
    currentOffsetRef.current = resumePosition;
    pendingScrollPositionRef.current = resumePosition;
    pendingScrollPageRef.current = null;
    // 分页章续载只追加正文，不切换目录章节；加载完成后用旧正文末尾偏移定位到新分页开头。
    loadNextPageRef.current(bookId, chapterIndex)
      .then(filled => {
        if (!tracker.isLatest(requestToken)) return;
        if (filled?.content) {
          currentOffsetRef.current = resumePosition;
          pendingScrollPositionRef.current = resumePosition;
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(error => {
        console.warn('[ReaderScreen] load chapter next page failed', {
          bookId,
          chapterIndex,
          title: chapter.title,
          url: chapter.nextPageUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        if (tracker.isLatest(requestToken)) setStatus('error');
      });
    return true;
  }, [
    bookId,
    chapter?.nextPageUrl,
    chapter?.title,
    chapterIndex,
    chapterTextLength,
    closeReadingChrome,
    invalidateWebScrollSync,
    lockChapterTurn,
    status,
  ]);

  // 把横向翻页容器定位到指定页。同章翻页平滑滚动，换章/续读补位用即时定位。
  const scrollToPage = React.useCallback(
    (index: number, smooth: boolean) => {
      const offset = index * viewportWidth;
      // react-native-web 上 FlatList 的 scrollToIndex/scrollToOffset 会静默不滚动，
      // 需要定位真正横向 overflow 的 DOM 节点，scroll-snap 会把落点吸附到整页。
      if (Platform.OS === 'web') {
        const node = findReaderPageScrollNode();
        // RNW 会把 ScrollView DOM 节点的 scrollTo 覆写成 {x,y,animated} 签名，
        // 直接传 DOM 标准的 {left,behavior} 会被忽略，键盘/点击翻页因此不生效。
        // Web 程序翻页必须即时定位：浏览器 smooth scroll + scroll-snap 的结束时机
        // 不稳定，迟到的滚动事件会把页码同步回旧的末页。
        if (node) {
          markWebProgrammaticScroll(260);
          const nativeScrollTo = HTMLElement.prototype.scrollTo as unknown as (
            this: Element,
            options: { left: number; behavior: ScrollBehavior },
          ) => void;
          nativeScrollTo.call(node, {
            left: offset,
            behavior: 'auto',
          });
          requestAnimationFrame(() => {
            if (Math.abs(node.scrollLeft - offset) > 1) {
              nativeScrollTo.call(node, { left: offset, behavior: 'auto' });
            }
          });
        }
      } else {
        flatListRef.current?.scrollToOffset({ offset, animated: smooth });
      }
    },
    [markWebProgrammaticScroll, viewportWidth],
  );

  const goToPage = React.useCallback(
    (delta: number) => {
      closeReadingChrome();
      const target = pageIndex + delta;
      if (target < 0) {
        if (chapterIndex > 0) {
          goToChapter(chapterIndex - 1, 'prev');
        }
        return;
      }
      if (target >= pages.length) {
        if (loadCurrentChapterNextPage()) return;
        if (chapterIndex < total - 1) {
          goToChapter(chapterIndex + 1, 'next');
        }
        return;
      }
      scrollToPage(target, true);
      currentOffsetRef.current = pages[target]?.startOffset ?? 0;
      setPageIndex(target);
    },
    [
      chapterIndex,
      closeReadingChrome,
      goToChapter,
      loadCurrentChapterNextPage,
      pageIndex,
      pages,
      scrollToPage,
      total,
    ],
  );

  // 跳转到书签：跨章用 resumeRef 复用换章落点逻辑；同章直接定位到偏移对应页。
  const jumpToBookmark = React.useCallback(
    (chapterId: string, position: number) => {
      const idx = chapters.findIndex(c => c.id === chapterId);
      if (idx < 0) return;
      setDrawerOpen(false);
      if (idx !== chapterIndex) {
        resumeRef.current = { chapterId, position };
        goToChapter(idx);
        return;
      }
      if (settings.pageMode === 'page' && pages.length > 0) {
        const target = findPageByOffset(pages, position);
        currentOffsetRef.current = position;
        if (Platform.OS === 'web') setSnapEnabled(target <= 0);
        pendingScrollPageRef.current = target > 0 ? target : null;
        setPageIndex(target);
      } else if (settings.pageMode === 'scroll') {
        currentOffsetRef.current = position;
        pendingScrollPositionRef.current = position;
        setScrollPosition(position);
      }
    },
    [chapters, chapterIndex, goToChapter, pages, settings.pageMode],
  );

  // Web 键盘监听用 ref 取最新 goToPage，避免闭包过期。
  const goToPageRef = React.useRef(goToPage);
  React.useEffect(() => {
    goToPageRef.current = goToPage;
  }, [goToPage]);

  // 换章/重排版后把容器补位到目标页。横向列表在 web 上内容宽度是逐帧铺开的，
  // 过早滚动会被夹到当前最大宽度，故用 rAF 轮询到内容够宽（够到目标页）再定位。
  React.useEffect(() => {
    if (status !== 'ready' || pendingScrollPageRef.current == null) return;
    let rafId = 0;
    let tries = 0;
    const tick = () => {
      const target = pendingScrollPageRef.current;
      if (target == null) return;
      if (Platform.OS === 'web') {
        const node = findReaderPageScrollNode();
        const need = target * viewportWidth;
        if (node && node.scrollWidth >= need + node.clientWidth - 1) {
          pendingScrollPageRef.current = null;
          scrollToPage(target, false);
          // 滚动落定并渲染出目标页后恢复吸附（此时 scrollLeft 已在整页边界，不会跳动）。
          if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
          snapTimerRef.current = setTimeout(() => setSnapEnabled(true), 180);
          return;
        }
        if (tries++ < 60) {
          rafId = requestAnimationFrame(tick);
        } else {
          pendingScrollPageRef.current = null;
          setSnapEnabled(true);
        }
      } else {
        pendingScrollPageRef.current = null;
        scrollToPage(target, false);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status, pageIndex, pages.length, scrollToPage, viewportWidth]);

  const updateScrollMetrics = React.useCallback(
    (next: Partial<typeof scrollMetrics>) => {
      setScrollMetrics(prev => {
        const merged = { ...prev, ...next };
        return prev.contentHeight === merged.contentHeight &&
          prev.viewportHeight === merged.viewportHeight
          ? prev
          : merged;
      });
    },
    [],
  );

  React.useEffect(() => {
    if (
      status !== 'ready' ||
      settings.pageMode !== 'scroll' ||
      pendingScrollPositionRef.current == null ||
      scrollMetrics.contentHeight <= 0 ||
      scrollMetrics.viewportHeight <= 0
    ) {
      return;
    }
    const position = pendingScrollPositionRef.current;
    pendingScrollPositionRef.current = null;
    const rafId = requestAnimationFrame(() => {
      const y = readingPositionToScrollOffset({
        position,
        contentHeight: scrollMetrics.contentHeight,
        viewportHeight: scrollMetrics.viewportHeight,
        contentLength: chapterTextLength,
      });
      scrollViewRef.current?.scrollTo({ y, animated: false });
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    chapterTextLength,
    scrollMetrics.contentHeight,
    scrollMetrics.viewportHeight,
    settings.pageMode,
    status,
  ]);

  const handleScrollModeScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const position = scrollOffsetToReadingPosition({
        scrollY: event.nativeEvent.contentOffset.y,
        contentHeight: scrollMetrics.contentHeight,
        viewportHeight: scrollMetrics.viewportHeight,
        contentLength: chapterTextLength,
      });
      currentOffsetRef.current = position;
      if (scrollProgressTimerRef.current) {
        clearTimeout(scrollProgressTimerRef.current);
      }
      scrollProgressTimerRef.current = setTimeout(() => {
        setScrollPosition(prev => (prev === position ? prev : position));
      }, 120);
    },
    [
      chapterTextLength,
      scrollMetrics.contentHeight,
      scrollMetrics.viewportHeight,
    ],
  );

  const flushScrollModeProgress = React.useCallback(() => {
    if (scrollProgressTimerRef.current) {
      clearTimeout(scrollProgressTimerRef.current);
      scrollProgressTimerRef.current = undefined;
    }
    const position = currentOffsetRef.current;
    setScrollPosition(prev => (prev === position ? prev : position));
  }, []);

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

  // 安卓硬件返回键：优先关闭已打开的浮层（设置面板 / 目录抽屉 / 工具栏），
  // 都关闭后才交回导航栈退出阅读页，符合安卓返回习惯。
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (isToolbarVisible) {
        setToolbarVisible(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [settingsOpen, drawerOpen, isToolbarVisible, setToolbarVisible]);

  const renderPage = React.useCallback(
    ({ item, index }: { item: ReaderPageData; index: number }) => {
      const isLastPage = index === pages.length - 1;

      return (
        <Pressable
          onPress={(e: any) => {
            // react-native-web 上 onPress 来自 DOM click，其 nativeEvent 是 MouseEvent，
            // 没有 locationX，只有 pageX/offsetX；pageX 是相对浏览器视口的坐标，
            // 大屏下 #root 居中（margin: 0 auto），必须减去面板左偏移才能得到面板内坐标。
            const ne = e?.nativeEvent ?? {};
            let x: number;
            if (ne.locationX != null) {
              x = ne.locationX;
            } else if (ne.pageX != null && e?.currentTarget) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              x = ne.pageX - rect.left;
            } else {
              x = viewportWidth / 2;
            }
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
              paddingTop: readerTopPadding,
              paddingBottom: PAGE_BOTTOM_PADDING,
              paddingHorizontal: readerColumn.paddingH,
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
                fontFamily: bodyFont,
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
                selectable
                style={{
                  fontFamily: bodyFont,
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
              {chapter?.nextPageUrl ? '本页完' : '本章完'}
            </Text>
          )}
        </Pressable>
      );
    },
    [
      book?.author,
      book?.title,
      bodyFont,
      chapter?.title,
      chapter?.nextPageUrl,
      display.fontSize,
      display.lineHeight,
      display.paraGap,
      display.theme.sub,
      display.theme.text,
      display.titleSize,
      goToPage,
      pages.length,
      readerColumn.paddingH,
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
        if (webProgrammaticScrollRef.current) return;
        const scheduledEpoch = webScrollEpochRef.current;
        if (webScrollIdleRef.current) clearTimeout(webScrollIdleRef.current);
        // Web 端滑动期间只记录最后落点，等浏览器惯性 + scroll-snap 落定后再同步页码，避免高频 setState 影响滚动性能。
        webScrollIdleRef.current = setTimeout(() => {
          if (
            webProgrammaticScrollRef.current ||
            isStaleScrollSync(scheduledEpoch, webScrollEpochRef.current)
          ) {
            return;
          }
          syncPageByScrollOffset(x);
        }, 80);
        return;
      }

      const turn = getBoundaryTurn({
        offsetX: x,
        pageIndex,
        pagesLength: pages.length,
        viewportWidth,
        chapterIndex,
        totalChapters: total,
        locked: chapterTurnLockRef.current,
        threshold: CHAPTER_TURN_THRESHOLD,
      });
      if (turn === 'prev') {
        lockChapterTurn();
        goToChapter(chapterIndex - 1, 'prev');
      } else if (turn === 'next') {
        lockChapterTurn();
        if (!loadCurrentChapterNextPage()) goToChapter(chapterIndex + 1, 'next');
      }
    },
    [
      chapterIndex,
      goToChapter,
      loadCurrentChapterNextPage,
      lockChapterTurn,
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
          selectable
          style={{
            fontFamily: bodyFont,
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
      bodyFont,
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
    <View
      style={[styles.container, { backgroundColor: display.theme.bg }]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setLayout(prev =>
          prev && prev.w === width && prev.h === height
            ? prev
            : { w: width, h: height },
        );
      }}
    >
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
              style={[
                StyleSheet.absoluteFill,
                WEB_SNAP_CONTAINER,
                Platform.OS === 'web' && !snapEnabled
                  ? ({ scrollSnapType: 'none' } as any)
                  : null,
              ]}
              showsHorizontalScrollIndicator={false}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews
              getItemLayout={getPageLayout}
              onScrollBeginDrag={() => {
                markUserWebScroll();
                setToolbarVisible(false);
              }}
              onMomentumScrollEnd={
                Platform.OS === 'web' ? undefined : handlePageMomentumEnd
              }
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
            ref={scrollViewRef}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{
              paddingHorizontal: readerColumn.paddingH,
              paddingTop: readerTopPadding,
              paddingBottom: PAGE_BOTTOM_PADDING,
            }}
            onScrollBeginDrag={() => setToolbarVisible(false)}
            onLayout={e =>
              updateScrollMetrics({
                viewportHeight: e.nativeEvent.layout.height,
              })
            }
            onContentSizeChange={(_, height) =>
              updateScrollMetrics({ contentHeight: height })
            }
            onScroll={handleScrollModeScroll}
            onScrollEndDrag={flushScrollModeProgress}
            onMomentumScrollEnd={flushScrollModeProgress}
            scrollEventThrottle={120}
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
                  {chapter?.nextPageUrl ? '本页完' : '本章完'}
                </Text>
                <Pressable
                  onPress={() => {
                    if (!loadCurrentChapterNextPage()) {
                      goToChapter(chapterIndex + 1, 'next');
                    }
                  }}
                  disabled={!chapter?.nextPageUrl && chapterIndex >= total - 1}
                  style={[
                    styles.nextBtn,
                    {
                      borderColor: display.theme.text,
                      opacity:
                        !chapter?.nextPageUrl && chapterIndex >= total - 1
                          ? 0.4
                          : 1,
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
                    {chapter?.nextPageUrl
                      ? '继续本章 · 下一页'
                      : chapterIndex >= total - 1
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
          <ActivityIndicator size="large" color={NOVEL_ACCENT} />
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

      <View
        style={[styles.progressHint, { bottom: progressHintBottom }]}
        pointerEvents="none"
      >
        <Text style={{ color: display.theme.sub, fontSize: 10.5 }}>
          {progressLabel}
        </Text>
      </View>

      <View
        style={[
          styles.readerStatus,
          {
            top: readerStatusTop,
            paddingHorizontal: readerColumn.paddingH,
          },
        ]}
        pointerEvents="none"
      >
        <Text
          numberOfLines={1}
          style={[
            styles.readerStatusChapter,
            { color: display.theme.sub },
          ]}
        >
          {topChapterLabel}
        </Text>
        <Text
          style={[
            styles.readerStatusTime,
            { color: display.theme.sub },
          ]}
        >
          {clockText}
        </Text>
      </View>

      <Animated.View
        pointerEvents={isToolbarVisible ? 'auto' : 'none'}
        style={[
          styles.topBar,
          {
            paddingTop: topBarPad,
            backgroundColor: display.chrome.bg,
            borderBottomColor: display.chrome.hair,
            opacity: barsTransition.value,
            transform: [
              {
                translateY: barsTransition.value.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable onPress={handleBack} style={styles.barBtn}>
          <Icon name="arrow-back" size={20} color={display.chrome.ink} />
        </Pressable>
        <View style={styles.topTitleWrap}>
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
        <View style={styles.topRight}>
          {isFullscreenSupported ? (
            <Pressable onPress={() => toggleFullscreen()} style={styles.barBtn}>
              <Icon
                name={isFs ? 'fullscreen-exit' : 'fullscreen'}
                size={22}
                color={display.chrome.ink}
              />
            </Pressable>
          ) : (
            <View style={styles.barBtn} />
          )}
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents={isToolbarVisible ? 'auto' : 'none'}
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomBarPad,
            backgroundColor: display.chrome.bg,
            borderTopColor: display.chrome.hair,
            opacity: barsTransition.value,
            transform: [
              {
                translateY: barsTransition.value.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.chapterNav}>
          <Pressable
            onPress={() => goToChapter(chapterIndex - 1, 'prev')}
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
            onPress={() => {
              if (!loadCurrentChapterNextPage()) {
                goToChapter(chapterIndex + 1, 'next');
              }
            }}
            disabled={!chapter?.nextPageUrl && chapterIndex >= total - 1}
          >
            <Text
              style={{
                color: display.chrome.ink,
                fontSize: 12.5,
                opacity:
                  !chapter?.nextPageUrl && chapterIndex >= total - 1 ? 0.4 : 1,
              }}
            >
              {chapter?.nextPageUrl ? '下一页' : '下一章'}
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
            onPress={() =>
              chapter &&
              toggleBookmark(bookId, chapter.id, currentOffsetRef.current)
            }
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
      </Animated.View>

      {sheetTransition.mounted && (
        <>
          <Animated.View
            style={[styles.overlay, { opacity: sheetTransition.value }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setSettingsOpen(false)}
            />
          </Animated.View>
          <Animated.View
            onLayout={e => setSheetHeight(e.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              {
                backgroundColor: display.chrome.sheetBg,
                transform: [
                  {
                    translateY: sheetTransition.value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [sheetHeight + 40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View
              style={[styles.grabber, { backgroundColor: display.chrome.hair }]}
            />

            {Brightness.isSupported && (
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
                  onLayout={e => {
                    brightnessTrackWRef.current = e.nativeEvent.layout.width;
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={e =>
                    applyBrightness(
                      e.nativeEvent.locationX /
                        (brightnessTrackWRef.current || 1),
                    )
                  }
                  onResponderMove={e =>
                    applyBrightness(
                      e.nativeEvent.locationX /
                        (brightnessTrackWRef.current || 1),
                    )
                  }
                >
                  <View
                    style={[
                      styles.sliderFill,
                      {
                        width: `${Math.round(brightnessLevel * 100)}%`,
                        backgroundColor: NOVEL_GOLD,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.sliderThumb,
                      { left: `${Math.round(brightnessLevel * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            )}

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
                  marginBottom: 7,
                }}
              >
                字体
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {FONTS.map(f => {
                  const on = (settings.fontKey || DEFAULT_FONT_KEY) === f.key;
                  const remote = f.kind === 'remote';
                  const busy = remote && isFontLoading(f.key);
                  const needDl = remote && !isFontReady(f.key) && !busy;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => {
                        setReaderFont(f.key);
                        if (remote) ensureFont(f).catch(() => {});
                      }}
                      style={[
                        styles.fontBtn,
                        {
                          backgroundColor: on ? NOVEL_ACCENT : 'transparent',
                          borderColor: on ? NOVEL_ACCENT : display.chrome.hair,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: on ? '#fff' : display.chrome.sheetInk,
                          fontSize: 12,
                        }}
                      >
                        {f.label}
                        {busy ? ' …' : needDl ? ' ↓' : ''}
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
          </Animated.View>
        </>
      )}

      {drawerTransition.mounted && (
        <>
          <Animated.View
            style={[styles.overlay, { opacity: drawerTransition.value }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDrawerOpen(false)}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.drawer,
              {
                backgroundColor: display.chrome.sheetBg,
                transform: [
                  {
                    translateX: drawerTransition.value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-viewportWidth * 0.8, 0],
                    }),
                  },
                ],
              },
            ]}
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
                {drawerTab === 'toc' ? `共 ${total} 章` : `共 ${bookmarks.length} 条书签`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {(['toc', 'marks'] as const).map(tab => {
                  const active = drawerTab === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setDrawerTab(tab)}
                      style={{
                        paddingVertical: 5,
                        paddingHorizontal: 14,
                        borderRadius: 14,
                        backgroundColor: active
                          ? NOVEL_ACCENT
                          : display.chrome.field,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: active ? '#fff' : display.chrome.sheetSub,
                          fontWeight: active ? '600' : '400',
                        }}
                      >
                        {tab === 'toc' ? '目录' : '书签'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {drawerTab === 'toc' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
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
              )}
            </View>
            {drawerTab === 'marks' ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 6,
                  paddingBottom: 20,
                }}
              >
                {bookmarks.length === 0 ? (
                  <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                    <Icon
                      name="bookmark-border"
                      size={30}
                      color={display.chrome.sheetSub}
                    />
                    <Text
                      style={{
                        color: display.chrome.sheetSub,
                        fontSize: 12.5,
                        marginTop: 8,
                      }}
                    >
                      还没有书签，阅读时点底部「书签」添加
                    </Text>
                  </View>
                ) : (
                  bookmarks
                    .map(bm => ({
                      bm,
                      idx: chapters.findIndex(c => c.id === bm.chapterId),
                    }))
                    .filter(x => x.idx >= 0)
                    .sort((a, b) => a.idx - b.idx)
                    .map(({ bm, idx }) => (
                      <Pressable
                        key={bm.id}
                        onPress={() => jumpToBookmark(bm.chapterId, bm.position)}
                        onLongPress={() =>
                          toggleBookmark(bookId, bm.chapterId, bm.position)
                        }
                        delayLongPress={350}
                        style={styles.chapterRow}
                      >
                        <Icon
                          name="bookmark"
                          size={15}
                          color={NOVEL_ACCENT}
                          style={{ width: 34 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 13.5,
                              color: display.chrome.sheetInk,
                            }}
                          >
                            {chapters[idx]?.title || `第 ${idx + 1} 章`}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: display.chrome.sheetSub,
                              marginTop: 2,
                            }}
                          >
                            {`第 ${idx + 1} 章 · 长按删除`}
                          </Text>
                        </View>
                      </Pressable>
                    ))
                )}
              </ScrollView>
            ) : (
              <FlatList
                ref={drawerTocRef}
                style={{ flex: 1 }}
                data={drawerList}
                keyExtractor={({ c }) => c.id}
                initialNumToRender={18}
                maxToRenderPerBatch={16}
                windowSize={9}
                removeClippedSubviews={Platform.OS !== 'web'}
                keyboardShouldPersistTaps="handled"
                viewabilityConfig={drawerViewabilityConfigRef.current}
                onViewableItemsChanged={onDrawerViewableItemsChangedRef.current}
                contentContainerStyle={{
                  paddingHorizontal: 6,
                  paddingBottom: 20,
                }}
                getItemLayout={(_, index) => ({
                  length: DRAWER_CHAPTER_ROW_HEIGHT,
                  offset: DRAWER_CHAPTER_ROW_HEIGHT * index,
                  index,
                })}
                onScrollToIndexFailed={info => {
                  drawerTocRef.current?.scrollToOffset({
                    offset: info.averageItemLength * info.index,
                    animated: false,
                  });
                  setTimeout(() => scrollDrawerToIndex(info.index, true), 50);
                }}
                renderItem={({ item: { c, idx } }) => {
                  const isCur = idx === chapterIndex;
                  return (
                    <Pressable
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
                          color: isCur
                            ? NOVEL_ACCENT
                            : display.chrome.sheetSub,
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
                          color: isCur
                            ? NOVEL_ACCENT
                            : display.chrome.sheetInk,
                          fontWeight: isCur ? '700' : '400',
                        }}
                      >
                        {displayChapterTitle(c, idx)}
                      </Text>
                      {isCur && (
                        <Text style={{ color: NOVEL_ACCENT, fontSize: 10 }}>
                          在读
                        </Text>
                      )}
                    </Pressable>
                  );
                }}
                ListFooterComponent={
                  <Pressable
                    disabled
                    style={[
                      styles.drawerFooterBtn,
                      { borderColor: display.chrome.hair },
                    ]}
                  >
                    <Text
                      style={{ color: display.chrome.sheetSub, fontSize: 13 }}
                    >
                      已显示全部章节
                    </Text>
                  </Pressable>
                }
              />
            )}
          </Animated.View>
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
  container: { flex: 1, overflow: 'hidden' },
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
  readerStatus: {
    position: 'absolute',
    left: 0,
    right: 0,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  readerStatusChapter: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
  },
  readerStatusTime: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
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
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topRight: {
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
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
  optBtn: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 字体卡片：按标签宽度自适应（不 flex 拉伸），配合容器 flexWrap 自然换多行，
  // 让“霞鹜文楷 Lite”等长标签单行显示。
  fontBtn: {
    height: 34,
    paddingHorizontal: 14,
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
    height: DRAWER_CHAPTER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
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
