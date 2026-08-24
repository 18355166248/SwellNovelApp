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
  Alert,
  Image,
  ImageBackground,
  useWindowDimensions,
  InteractionManager,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Brightness from '../native/Brightness';
import * as Orientation from '../native/Orientation';
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
  useSetReaderBackgroundOpacity,
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
  useSaveExcerpt,
  useRemoveBookmark,
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
  getReaderChrome,
  isReaderNightTheme,
} from '../theme/readerThemes';
import {
  getReaderArtworkOpacity,
  READER_BACKGROUND_ARTWORK,
  READER_BACKGROUND_DECORATION,
} from '../theme/readerBackgroundAssets';
import type { Chapter } from '../store/types/book';
import {
  isBadChapterTitle,
  isBlockedText,
} from '../services/source/contentGuards';
import { SERIF_FONT } from '../theme/fonts';
import { useReaderFontFamily } from '../services/fonts/useReaderFontFamily';
import { FONTS, getFontDef } from '../theme/fontCatalog';
import {
  ensureFont,
  fontFamilyFor,
  isAnyFontLoading,
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
  canHandleBoundaryTurnGesture,
  ChapterNavigationIntent,
  getChapterLanding,
  getChapterLandingPage,
  getBoundaryTurn,
  isChapterSwitchInFlight,
  isStaleScrollSync,
} from '../utils/readerScrollGuard';
import {
  resolveChapterSearchIndex,
  searchChapterText,
} from '../utils/chapterSearch';
import { getForwardPrefetchIndices } from '../utils/chapterPrefetch';
import { useReaderGuards } from './reader/useReaderGuards';
import { useWebDavAutoBackup } from '../services/webdav/useWebDavAutoBackup';
import {
  paragraphsFromContent,
  resolveExcerptDraft,
  resolveExcerptRange,
} from '../utils/readerExcerpt';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;
type DrawerChapterItem = { c: Chapter; idx: number };

interface ExcerptDraft {
  chapterId: string;
  position: number;
  excerpt: string;
  note: string;
}

function isBlockedBookshukuText(content?: string): boolean {
  if (!content) return false;
  // 拦截页/广告卡片特征由 contentGuards 统一判定；这里再叠加“正文过短”这条
  // 阅读器专属规则:缓存里不足 200 字的正文按不可用处理,触发重新抓取。
  return isBlockedText(content) || content.replace(/\s+/g, '').length < 200;
}

function hasUsableChapterContent(
  chapter: Chapter | undefined,
  sourceName?: string,
): boolean {
  if (!chapter?.content) return false;
  return (
    sourceName !== 'bookshuku' ||
    (chapter.contentVersion === BOOKSHUKU_CONTENT_VERSION &&
      !isBlockedBookshukuText(chapter.content))
  );
}

function displayChapterTitle(chapter: Chapter, index: number): string {
  const fallback = `第${index + 1}章`;
  const title = chapter.title.replace(/\s+/g, ' ').trim();
  const suffix = title
    .replace(/^第\s*(?:\d+|[零一二三四五六七八九十百千两万]+)\s*章\s*/, '')
    .trim();
  if (isBadChapterTitle(title) || isBadChapterTitle(suffix)) {
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
    isBadChapterTitle(title) ||
    isBadChapterTitle(suffix)
  );
}

const LINE_LABELS = ['紧凑', '适中', '宽松'];
const SOLID_THEME_ORDER: ReaderThemeKey[] = ['paper', 'gray', 'green', 'night'];
const SCENIC_THEME_ORDER: ReaderThemeKey[] = [
  'cosmos',
  'lake',
  'bamboo',
  'sunset',
];
/** 一级设置只保留高频且差异明显的四种背景，其余主题继续在完整背景面板中选择。 */
const QUICK_THEME_ORDER: ReaderThemeKey[] = [
  'paper',
  'green',
  'cosmos',
  'bamboo',
];
// 左右各 30% 用于翻页，中间 40% 呼出阅读工具栏；适当放宽中心区，降低单手点击误翻页率。
const PAGE_TURN_EDGE_RATIO = 0.3;
const BACKGROUND_INTENSITY_PRESETS = [
  { label: '淡', value: 0.3 },
  { label: '适中', value: 0.5 },
  { label: '清晰', value: 0.75 },
  { label: '原图', value: 1 },
] as const;

function closestBackgroundIntensity(value: number): number {
  let closest: number = BACKGROUND_INTENSITY_PRESETS[0].value;
  for (const preset of BACKGROUND_INTENSITY_PRESETS) {
    if (Math.abs(preset.value - value) < Math.abs(closest - value)) {
      closest = preset.value;
    }
  }
  return closest;
}
/**
 * 正文左右固定留白。字号和字体只改变排版测量，不参与边距计算，避免切换设置后
 * 阅读列左右跳动；28pt 延续大字号（36）下已经确认过的视觉间距。
 */
const PAGE_HORIZONTAL_PADDING = 28;
const PAGE_TOP_PADDING = 36;
const PAGE_BOTTOM_PADDING = 48;
/** 阅读列最大宽度（含左右内边距）：宽屏下超出则居中留白，避免一行几十字难读。 */
const READER_MAX_CONTENT = 680;
/** 章节边界越界回弹翻章的位移阈值 */
// 单章列表只在边界回弹时识别跨章，阈值过大会让用户需要反复用力拖动。
const CHAPTER_TURN_THRESHOLD = 18;
// 快速甩动可能在越界位移达到阈值前就结束，用松手速度及时确认跨章意图。
const CHAPTER_TURN_VELOCITY_THRESHOLD = 0.18;
// 先给 React 一次提交和原生一帧绘制机会，确保分页计算开始前 Loading 已可见。
const CHAPTER_SWITCH_COMMIT_DELAY = 32;
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
// 后续章节在交互空闲时先用跨端字符宽度表断行；真正展示后原生端仍会用
// onTextLayout 的实测结果覆盖，兼顾切章速度和最终排版精度。
const estimatedLinesCache = new Map<string, ReaderLine[]>();
const MEASURED_CACHE_LIMIT = 16;
type ParsedChapterContent = {
  content: string;
  paragraphs: string[];
  textLength: number;
};
// 来回切章时分页虽已缓存，但重新 split 正文并逐字符统计 Unicode 长度仍会阻塞
// 超长章节。按章节保留最近解析结果，让返回相邻章节只做 O(1) 命中检查。
const parsedChapterCache = new Map<string, ParsedChapterContent>();
const PARSED_CHAPTER_CACHE_LIMIT = 12;
// 完整分页结果也要缓存。只缓存断行仍会在章节边界同步遍历所有行重新组页，
// 大字号章节会占住 JS 线程，直接表现为手势结束时掉帧。
const readerPagesCache = new Map<string, ReaderPageData[]>();
const READER_PAGES_CACHE_LIMIT = 24;

function getParsedChapterContent(
  chapterId: string,
  content: string,
): ParsedChapterContent {
  const cached = parsedChapterCache.get(chapterId);
  if (cached?.content === content) {
    parsedChapterCache.delete(chapterId);
    parsedChapterCache.set(chapterId, cached);
    return cached;
  }

  const paragraphs = paragraphsFromContent(content);
  const parsed = {
    content,
    paragraphs,
    textLength: paragraphs.reduce(
      (sum, paragraph) => sum + Array.from(paragraph).length,
      0,
    ),
  };
  if (
    !parsedChapterCache.has(chapterId) &&
    parsedChapterCache.size >= PARSED_CHAPTER_CACHE_LIMIT
  ) {
    const oldest = parsedChapterCache.keys().next().value;
    if (oldest != null) parsedChapterCache.delete(oldest);
  }
  parsedChapterCache.set(chapterId, parsed);
  return parsed;
}

function cacheReaderLines(
  cache: Map<string, ReaderLine[]>,
  key: string,
  lines: ReaderLine[],
) {
  if (cache.size >= MEASURED_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  cache.set(key, lines);
}

function readerLineCacheKey({
  chapterId,
  textLength,
  maxWidth,
  fontSize,
  lineHeight,
  fontFamily,
}: {
  chapterId: string;
  textLength: number;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
}): string {
  // 正文续载或解析修复后 chapter id 不变，必须带长度使旧断行缓存失效。
  return `${chapterId}|${textLength}|${maxWidth}|${fontSize}|${lineHeight}|${
    fontFamily || 'system'
  }`;
}

function readerPagesCacheKey({
  lineCacheKey,
  measured,
  lineHeight,
  paraGap,
  bodyHeight,
  firstBodyHeight,
}: {
  lineCacheKey: string;
  measured: boolean;
  lineHeight: number;
  paraGap: number;
  bodyHeight: number;
  firstBodyHeight: number;
}): string {
  return `${lineCacheKey}|${
    measured ? 'measured' : 'estimated'
  }|${lineHeight}|${paraGap}|${bodyHeight}|${firstBodyHeight}`;
}

function cacheReaderPages(key: string, pages: ReaderPageData[]) {
  if (readerPagesCache.has(key)) readerPagesCache.delete(key);
  if (readerPagesCache.size >= READER_PAGES_CACHE_LIMIT) {
    const oldest = readerPagesCache.keys().next().value;
    if (oldest != null) readerPagesCache.delete(oldest);
  }
  readerPagesCache.set(key, pages);
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
  const topBarPad = Platform.OS === 'web' ? 12 : Math.max(insets.top, 12) + 8;
  const readerStatusTop = Platform.OS === 'web' ? 10 : Math.max(insets.top, 8);
  // 正文标题必须落在常驻章节状态行下方；仅按安全区加偏移会在刘海屏上只剩
  // 1～2pt 间隔，大字号标题的字形上沿容易与状态行叠住。
  const readerTopPadding =
    Platform.OS === 'web'
      ? PAGE_TOP_PADDING
      : Math.max(
          PAGE_TOP_PADDING + Math.max(0, insets.top - 12),
          readerStatusTop + 32,
        );
  const bottomBarPad =
    Platform.OS === 'web' ? 22 : Math.max(insets.bottom, 8) + 14;
  const progressHintBottom =
    Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 10);
  const { bookId, openDrawer } = route.params;
  // 仅阅读器存活期间检查自动备份，避免书架浏览也产生不必要的云端上传。
  const { trackReadingPosition } = useWebDavAutoBackup();

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
  const storedDisplay = useReaderDisplay();
  // 阅读正文字体：随设置切换，远程字体就绪后自动重渲染；用于正文与分页测量。
  const bodyFont = useReaderFontFamily();
  const fontDownloadBusy = isAnyFontLoading();
  const setReaderTheme = useSetReaderTheme();
  const setReaderBackgroundOpacity = useSetReaderBackgroundOpacity();
  const { inc: incFont, dec: decFont } = useAdjustFontSize();
  const setLineHeightIndex = useSetLineHeightIndex();
  const setReaderFont = useSetReaderFont();
  const setPageMode = useSetPageMode();
  const setBrightness = useSetBrightness();

  const { isToolbarVisible } = useReaderState();
  const toggleToolbar = useToggleToolbar();
  const setToolbarVisible = useSetToolbarVisible();

  // 原生状态栏交给 native-stack 对应的 UIViewController 管理；现代 iOS 已不再
  // 可靠支持 UIApplication 的旧式隐藏 API。工具栏显示时恢复，收起时沉浸。
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    navigation.setOptions({
      statusBarHidden: !isToolbarVisible,
      statusBarAnimation: 'fade',
      statusBarStyle: isReaderNightTheme(settings.theme) ? 'light' : 'dark',
    });
  }, [isToolbarVisible, navigation, settings.theme]);
  React.useEffect(
    () => () => {
      if (Platform.OS !== 'web') {
        navigation.setOptions({ statusBarHidden: false });
      }
    },
    [navigation],
  );

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
  const saveExcerpt = useSaveExcerpt();
  const removeBookmark = useRemoveBookmark();
  const plainBookmarks = React.useMemo(
    () => bookmarks.filter(item => !item.excerpt),
    [bookmarks],
  );
  const excerpts = React.useMemo(
    () => bookmarks.filter(item => !!item.excerpt),
    [bookmarks],
  );

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [excerptDraft, setExcerptDraft] = React.useState<ExcerptDraft | null>(
    null,
  );
  const [backgroundOpen, setBackgroundOpen] = React.useState(false);
  const [backgroundPreviewTheme, setBackgroundPreviewTheme] =
    React.useState<ReaderThemeKey>(settings.theme);
  const [backgroundPreviewOpacity, setBackgroundPreviewOpacity] =
    React.useState(settings.backgroundOpacity ?? 0.45);
  const [backgroundCategory, setBackgroundCategory] = React.useState<
    'solid' | 'scenic'
  >(() => READER_THEMES[settings.theme].category);
  const [readerOrientation, setReaderOrientation] =
    React.useState<Orientation.AppOrientation>('portrait');
  const [drawerOpen, setDrawerOpen] = React.useState(!!openDrawer);

  React.useEffect(() => {
    // 阅读页每次进入都从竖屏开始，离开前也恢复竖屏，避免横屏状态泄漏到书架等页面。
    Orientation.lockTo('portrait');
    return () => Orientation.lockTo('portrait');
  }, []);

  const toggleReaderOrientation = React.useCallback(() => {
    const next = readerOrientation === 'portrait' ? 'landscape' : 'portrait';
    setReaderOrientation(next);
    Orientation.lockTo(next);
    setToolbarVisible(false);
  }, [readerOrientation, setToolbarVisible]);
  // 目录首次挂载会先渲染列表顶部、再定位当前章；定位完成前锁住条目，避免快速点击误入第一章。
  const [drawerPositioning, setDrawerPositioning] = React.useState(
    !!openDrawer,
  );

  // 工具栏 / 设置面板 / 目录抽屉的进出场过渡。
  const barsTransition = useOverlayTransition(isToolbarVisible);
  const sheetTransition = useOverlayTransition(settingsOpen);
  const backgroundTransition = useOverlayTransition(backgroundOpen);
  const drawerTransition = useOverlayTransition(drawerOpen);
  const [sheetHeight, setSheetHeight] = React.useState(420);
  const [backgroundSheetHeight, setBackgroundSheetHeight] = React.useState(330);

  const activeThemeKey = backgroundOpen
    ? backgroundPreviewTheme
    : settings.theme;
  const activeBackgroundOpacity = backgroundOpen
    ? backgroundPreviewOpacity
    : settings.backgroundOpacity ?? 0.45;
  const display = React.useMemo(
    () => ({
      ...storedDisplay,
      theme: READER_THEMES[activeThemeKey],
      chrome: getReaderChrome(activeThemeKey),
      isNight: isReaderNightTheme(activeThemeKey),
    }),
    [activeThemeKey, storedDisplay],
  );

  const openBackgroundStudio = React.useCallback(() => {
    // 工作台打开时同步当前值；后续每次选择直接持久化，关闭只负责收起面板。
    setBackgroundPreviewTheme(settings.theme);
    setBackgroundPreviewOpacity(settings.backgroundOpacity ?? 0.45);
    setBackgroundCategory(READER_THEMES[settings.theme].category);
    setSettingsOpen(false);
    setBackgroundOpen(true);
  }, [settings.backgroundOpacity, settings.theme]);

  const closeBackgroundStudio = React.useCallback(() => {
    setBackgroundOpen(false);
  }, []);

  const updateBackgroundOpacity = React.useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      setBackgroundPreviewOpacity(next);
      setReaderBackgroundOpacity(next);
    },
    [setReaderBackgroundOpacity],
  );

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
  const [drawerTab, setDrawerTab] = React.useState<
    'toc' | 'search' | 'notes' | 'marks'
  >('toc');
  const [drawerQuery, setDrawerQuery] = React.useState('');
  const [textSearchInput, setTextSearchInput] = React.useState('');
  const [textSearchQuery, setTextSearchQuery] = React.useState('');
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
  // status=ready 只代表正文与分页数据已计算完成；原生 FlatList 的首屏 cell
  // 可能仍未挂载。只有对应页面真正可见后才开放连续翻页。
  const [readyPageSessionKey, setReadyPageSessionKey] = React.useState<
    string | null
  >(null);
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
  // state 用于渲染页码，ref 用于连续手势的同步判定；惯性被下一次拖动打断时，
  // 不能等 React 提交后才知道用户实际已经在哪一页。
  const currentPageIndexRef = React.useRef(0);
  const pageRenderGateRef = React.useRef<{
    sessionKey: string;
    expectedItemKey: string;
  } | null>(null);
  const pageReadyFrameRef = React.useRef<number | undefined>(undefined);
  const pageViewabilityConfigRef = React.useRef({
    itemVisiblePercentThreshold: 1,
  });
  const onPageViewableItemsChangedRef = React.useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item?: ReaderPageData; isViewable?: boolean }>;
    }) => {
      const gate = pageRenderGateRef.current;
      if (!gate) return;
      const targetVisible = viewableItems.some(
        token =>
          token.isViewable !== false &&
          token.item?.key === gate.expectedItemKey,
      );
      if (!targetVisible) return;
      if (pageReadyFrameRef.current != null) {
        cancelAnimationFrame(pageReadyFrameRef.current);
      }
      // Viewability 回调说明目标 cell 已进入布局；再等一帧，让原生文字完成绘制后
      // 才移除 Loading 并开放滚动，避免手势跑在首屏渲染前面。
      pageReadyFrameRef.current = requestAnimationFrame(() => {
        if (pageRenderGateRef.current?.sessionKey !== gate.sessionKey) return;
        pageReadyFrameRef.current = undefined;
        setReadyPageSessionKey(gate.sessionKey);
      });
    },
  );
  const pendingLandRef = React.useRef<'last' | null>(null);
  // 换章/重排版后需要把横向容器定位到的目标页；setPageIndex 只更新页码，
  // 不会滚动容器，需在新内容布局完成后由 rAF 轮询补一次定位。
  const pendingScrollPageRef = React.useRef<number | null>(null);
  const prevChapterIdRef = React.useRef<string | undefined>(undefined);
  // 续读：捕获打开时保存的页内偏移，仅在首个匹配章节应用一次。
  const resumeRef = React.useRef<{
    chapterId: string;
    position: number;
  } | null>(null);
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
  // 同步 ref 比 loading state 更早生效，拦住 React 提交前连续到达的第二次切章请求。
  const chapterSwitchTargetRef = React.useRef<number | null>(null);
  // 一次原生拖动最多消费一次跨章；chapterId 用来拒绝旧列表卸载后迟到的滚动事件。
  const chapterTurnGestureRef = React.useRef<{
    chapterId?: string;
    startPageIndex: number;
    dragging: boolean;
    consumed: boolean;
  }>({ startPageIndex: 0, dragging: false, consumed: true });
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
    unlockChapterTurn,
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
      if (pageReadyFrameRef.current != null) {
        cancelAnimationFrame(pageReadyFrameRef.current);
      }
      if (scrollProgressTimerRef.current) {
        clearTimeout(scrollProgressTimerRef.current);
      }
    },
    [],
  );

  const total = chapters.length;
  React.useEffect(() => {
    const timer = setTimeout(
      () => setTextSearchQuery(textSearchInput.trim()),
      220,
    );
    return () => clearTimeout(timer);
  }, [textSearchInput]);

  const searchableChapters = React.useMemo(
    () =>
      chapters.map(item =>
        hasUsableChapterContent(item, book?.source?.name)
          ? item
          : { ...item, content: '' },
      ),
    [book?.source?.name, chapters],
  );
  const textSearchResults = React.useMemo(
    () => searchChapterText(searchableChapters, textSearchQuery),
    [searchableChapters, textSearchQuery],
  );
  const searchableChapterCount = React.useMemo(
    () => searchableChapters.filter(item => item.content.length > 0).length,
    [searchableChapters],
  );
  const textSearchPending = textSearchInput.trim() !== textSearchQuery;
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
    if (drawerList.length === 0) return;
    // 目录不再按搜索词过滤，输入只驱动滚动定位；打开目录时默认把当前阅读章节带到视野中。
    scrollDrawerToIndex(drawerTargetIndex, drawerQuery.trim().length > 0);
    if (!drawerPositioning) return;

    // 等抽屉动画和列表定位都提交后再放开点击；章节仍在磁盘懒加载时保持锁定。
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setDrawerPositioning(false)),
      );
    });
    return () => task.cancel();
  }, [
    drawerOpen,
    drawerTab,
    drawerTargetIndex,
    drawerQuery,
    drawerList.length,
    drawerPositioning,
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
    drawerVisibleIndices,
    drawerVisibleKey,
  ]);

  const chapter = chapters[chapterIndex];
  const chapterExcerpts = React.useMemo(
    () => excerpts.filter(item => item.chapterId === chapter?.id),
    [chapter?.id, excerpts],
  );
  const chapterSourceContent = content || chapter?.content || '';
  const chapterExcerptRanges = React.useMemo(
    () =>
      chapterExcerpts
        .filter(item => !!item.excerpt)
        .map(item =>
          resolveExcerptRange(
            chapterSourceContent,
            item.excerpt!,
            item.position,
          ),
        ),
    [chapterExcerpts, chapterSourceContent],
  );
  const isExcerptRange = React.useCallback(
    (start: number, end: number) =>
      chapterExcerptRanges.some(
        range => range.start < end && range.end > start,
      ),
    [chapterExcerptRanges],
  );
  const [clockText, setClockText] = React.useState(() =>
    formatReaderClock(new Date()),
  );
  const isNight = isReaderNightTheme(settings.theme);
  const hasBookmark = chapter
    ? plainBookmarks.some(b => b.chapterId === chapter.id)
    : false;
  const progressPct =
    total > 0 ? Math.round(((chapterIndex + 1) / total) * 100) : 0;
  const parsedChapter = React.useMemo(
    () => getParsedChapterContent(chapter?.id || bookId, chapterSourceContent),
    [bookId, chapter?.id, chapterSourceContent],
  );
  const paragraphs = parsedChapter.paragraphs;
  const chapterTextLength = parsedChapter.textLength;
  const openExcerptDraft = React.useCallback(
    (visibleText: string, fallbackPosition: number) => {
      if (!chapter) return;
      const resolved = resolveExcerptDraft(
        content || chapter.content,
        visibleText,
        fallbackPosition,
      );
      if (!resolved) return;
      setSettingsOpen(false);
      setBackgroundOpen(false);
      setDrawerOpen(false);
      setToolbarVisible(false);
      setExcerptDraft({
        chapterId: chapter.id,
        position: resolved.position,
        excerpt: resolved.excerpt,
        note: '',
      });
    },
    [chapter, content, setToolbarVisible],
  );
  const topChapterLabel = formatReaderChapterLabel(chapter, chapterIndex);

  React.useEffect(() => {
    const tick = () => setClockText(formatReaderClock(new Date()));
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  // 阅读列宽度：窄屏使用固定对称留白，宽屏封顶到 READER_MAX_CONTENT 并居中。
  // 字号、字体不得参与 paddingH 计算，否则切换排版设置会让正文列左右跳动。
  // 同一 padding 同时用于渲染和分页断行，保证两侧严格对称且不会分页错位。
  const readerColumn = React.useMemo(() => {
    const clamped = Math.min(viewportWidth, READER_MAX_CONTENT);
    const sideGutter = Math.max(0, (viewportWidth - clamped) / 2);
    return {
      paddingH: PAGE_HORIZONTAL_PADDING + sideGutter,
      textWidth: Math.max(1, clamped - PAGE_HORIZONTAL_PADDING * 2),
    };
  }, [viewportWidth]);

  const chapterTitleLineHeight = Math.ceil(display.titleSize * 1.25);

  // 左右翻页先按真实字符宽度断行、组页，再交给 FlatList 虚拟渲染，避免大章节一次性挂载所有页面。
  const pageMetrics = React.useMemo(() => {
    const maxWidth = readerColumn.textWidth;
    const bodyHeight = Math.max(
      1,
      viewportHeight - readerTopPadding - PAGE_BOTTOM_PADDING,
    );
    const lineHeight = display.fontSize * display.lineHeight;
    // 首页扣除标题区（章节名 + meta + 间距）真实占用的高度，消除首页尾部留白。
    const headerHeight = chapterTitleLineHeight + 8 + 15 + 24;
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
    chapterTitleLineHeight,
    readerTopPadding,
    viewportHeight,
    readerColumn.textWidth,
  ]);
  const pages = React.useMemo<ReaderPageData[]>(() => {
    const chapterId = chapter?.id || bookId;
    const measure = getCharWidthMeasurer(bodyFont, display.fontSize);
    // 断行随正文字体变化：不同字体字宽不同，缓存 key 必须带 bodyFont，
    // 否则切字体后仍复用旧字体的测量结果，断行/每页行数会对不上。
    const lineCacheKey = readerLineCacheKey({
      chapterId,
      textLength: chapterTextLength,
      maxWidth: pageMetrics.maxWidth,
      fontSize: display.fontSize,
      lineHeight: display.lineHeight,
      fontFamily: bodyFont,
    });
    const hasMeasuredLines = measuredLinesCache.has(lineCacheKey);
    const lines = hasMeasuredLines
      ? measuredLinesCache.get(lineCacheKey)!
      : estimatedLinesCache.get(lineCacheKey) ||
        breakLines(paragraphs, pageMetrics.maxWidth, measure);
    const pagesCacheKey = readerPagesCacheKey({
      lineCacheKey,
      measured: hasMeasuredLines,
      lineHeight: pageMetrics.lineHeight,
      paraGap: pageMetrics.paraGap,
      bodyHeight: pageMetrics.bodyHeight,
      firstBodyHeight: pageMetrics.firstBodyHeight,
    });
    const cachedPages = readerPagesCache.get(pagesCacheKey);
    if (cachedPages) return cachedPages;
    const builtPages = buildPages({
      chapterId,
      lines,
      lineHeight: pageMetrics.lineHeight,
      paraGap: pageMetrics.paraGap,
      bodyHeight: pageMetrics.bodyHeight,
      firstBodyHeight: pageMetrics.firstBodyHeight,
    });
    cacheReaderPages(pagesCacheKey, builtPages);
    return builtPages;
  }, [
    bookId,
    chapter?.id,
    chapterTextLength,
    display.fontSize,
    display.lineHeight,
    pageMetrics.bodyHeight,
    pageMetrics.firstBodyHeight,
    pageMetrics.lineHeight,
    pageMetrics.maxWidth,
    pageMetrics.paraGap,
    paragraphs,
    bodyFont,
  ]);

  // FlatList 在 data 换成新章节时会沿用旧横向 offset。首帧目标必须在列表挂载前
  // 算好，并配合章节级 key 创建全新滚动容器，否则下一章会先露出末页，上一章
  // 会先露出首页再远距离补滚。
  const initialChapterPageIndex = React.useMemo(() => {
    if (pendingLandRef.current === 'last') {
      return getChapterLandingPage('last', pages.length);
    }
    const resume = resumeRef.current;
    if (resume && resume.chapterId === chapter?.id && resume.position > 0) {
      return findPageByOffset(pages, resume.position);
    }
    return 0;
  }, [chapter?.id, pages]);

  const pageSessionKey = `${bookId}|${
    chapter?.id || 'chapter'
  }|${chapterTextLength}|${pages.length}`;
  const expectedInitialPageKey = pages[initialChapterPageIndex]?.key;
  pageRenderGateRef.current =
    status === 'ready' &&
    settings.pageMode === 'page' &&
    expectedInitialPageKey &&
    readyPageSessionKey !== pageSessionKey
      ? { sessionKey: pageSessionKey, expectedItemKey: expectedInitialPageKey }
      : null;
  const pageInteractionReady =
    settings.pageMode !== 'page' ||
    pages.length === 0 ||
    readyPageSessionKey === pageSessionKey;

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
        currentPageIndexRef.current = 0;
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
      currentPageIndexRef.current = landing;
      setPageIndex(landing);
      // 换章会复用同一个横向滚动容器。即使目标是首页，也要在新内容布局完成后
      // 显式滚到 0，否则上一章末页的 scrollLeft 会被浏览器夹到新章最后一页。
      // 原生端改为按章节重建 FlatList，并通过 initialScrollIndex 首帧直达；不再
      // 等下一帧二次补位。Web 端仍保留 DOM 宽度就绪后的兜底定位。
      pendingScrollPageRef.current = Platform.OS === 'web' ? landing : null;
      // 远距离落点先关吸附，避免程序滚动被 mandatory-snap 拽回；首页无需处理。
      if (Platform.OS === 'web') setSnapEnabled(landing <= 0);
      return;
    }

    // 同章重新分页时，用逻辑字符偏移映射回原段落附近，避免字号/行距调整后跳回首页。
    invalidateWebScrollSync();
    if (settings.pageMode === 'scroll') {
      pendingScrollPositionRef.current = currentOffsetRef.current;
      setScrollPosition(currentOffsetRef.current);
      currentPageIndexRef.current = 0;
      setPageIndex(0);
      return;
    }
    const remapped = findPageByOffset(pages, currentOffsetRef.current);
    currentPageIndexRef.current = remapped;
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
      : `本章 ${Math.round(
          scrollChapterFraction * 100,
        )}% · ${pageProgressPct}%`;

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

  React.useEffect(() => {
    if (status !== 'ready' || !chapter) return;
    trackReadingPosition({
      chapterId: chapter.id,
      pageIndex,
      pageMode: settings.pageMode,
    });
  }, [chapter, pageIndex, settings.pageMode, status, trackReadingPosition]);

  // 在线书：当前章正文尚未抓取时按需拉取并缓存，复用现成的 loading / error 态。
  // 本地书章节已带正文，直接置为 ready。effect 以 chapter.id 为键，换章会自动重跑。
  React.useEffect(() => {
    if (!chapter) return;
    const tracker = contentRequestTrackerRef.current!;
    const hasUsableCachedContent = hasUsableChapterContent(
      chapter,
      book?.source?.name,
    );
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
    ensureRef
      .current(bookId, chapterIndex)
      .then(filled => {
        if (cancelled || !tracker.isLatest(requestToken)) return;
        if (filled && filled.content) {
          setStatus('ready');
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
    if (status !== 'ready' || !isOnline || !chapter) return;
    let cancelled = false;
    // 先让当前章完成首屏渲染，再顺序低优先级抓后续三章；串行可避免后台缓存
    // 抢占书源/WebView，用户主动切章时则由请求合并逻辑直接复用在途结果。
    const timer = setTimeout(() => {
      (async () => {
        const indices = getForwardPrefetchIndices(chapterIndex, total);
        for (const index of indices) {
          if (cancelled) return;
          try {
            await ensureRef.current(bookId, index, { background: true });
          } catch (error) {
            console.info('[ReaderScreen] background prefetch skipped', {
              bookId,
              index,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })().catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookId, chapter, chapterIndex, isOnline, status, total]);

  React.useEffect(() => {
    if (status !== 'ready' || settings.pageMode !== 'page') return;
    const neighborIndices = [
      ...(chapterIndex > 0 ? [chapterIndex - 1] : []),
      ...getForwardPrefetchIndices(chapterIndex, total),
    ];
    const targets = neighborIndices
      .map(index => chapters[index])
      .filter((item): item is Chapter =>
        hasUsableChapterContent(item, book?.source?.name),
      );
    if (targets.length === 0) return;

    // 网络预取回填后，在所有触摸/导航动画结束再预断行；切到缓存章时直接复用，
    // 原生端展示后仍会以 onTextLayout 的实测行数据校正。
    const task = InteractionManager.runAfterInteractions(() => {
      const measure = getCharWidthMeasurer(bodyFont, display.fontSize);
      targets.forEach(target => {
        const targetParsed = getParsedChapterContent(target.id, target.content);
        const targetParagraphs = targetParsed.paragraphs;
        const textLength = targetParsed.textLength;
        const lineCacheKey = readerLineCacheKey({
          chapterId: target.id,
          textLength,
          maxWidth: pageMetrics.maxWidth,
          fontSize: display.fontSize,
          lineHeight: display.lineHeight,
          fontFamily: bodyFont,
        });
        if (
          !measuredLinesCache.has(lineCacheKey) &&
          !estimatedLinesCache.has(lineCacheKey)
        ) {
          cacheReaderLines(
            estimatedLinesCache,
            lineCacheKey,
            breakLines(targetParagraphs, pageMetrics.maxWidth, measure),
          );
        }
        const hasMeasuredLines = measuredLinesCache.has(lineCacheKey);
        const lines = hasMeasuredLines
          ? measuredLinesCache.get(lineCacheKey)!
          : estimatedLinesCache.get(lineCacheKey)!;
        const pagesCacheKey = readerPagesCacheKey({
          lineCacheKey,
          measured: hasMeasuredLines,
          lineHeight: pageMetrics.lineHeight,
          paraGap: pageMetrics.paraGap,
          bodyHeight: pageMetrics.bodyHeight,
          firstBodyHeight: pageMetrics.firstBodyHeight,
        });
        if (!readerPagesCache.has(pagesCacheKey)) {
          cacheReaderPages(
            pagesCacheKey,
            buildPages({
              chapterId: target.id,
              lines,
              lineHeight: pageMetrics.lineHeight,
              paraGap: pageMetrics.paraGap,
              bodyHeight: pageMetrics.bodyHeight,
              firstBodyHeight: pageMetrics.firstBodyHeight,
            }),
          );
        }
      });
    });
    return () => task.cancel();
  }, [
    bodyFont,
    book?.source?.name,
    chapterIndex,
    chapters,
    display.fontSize,
    display.lineHeight,
    pageMetrics.bodyHeight,
    pageMetrics.firstBodyHeight,
    pageMetrics.lineHeight,
    pageMetrics.maxWidth,
    pageMetrics.paraGap,
    settings.pageMode,
    status,
    total,
  ]);

  React.useEffect(() => {
    const target = chapterSwitchTargetRef.current;
    if (!isChapterSwitchInFlight(target, chapterIndex, status)) {
      chapterSwitchTargetRef.current = null;
    }
  }, [chapterIndex, status]);

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
      // 切换期间旧手势、惯性回调和连续点击都可能再次进入这里；首个请求完成前
      // 一律拒绝后续请求，避免目标章被覆盖或一次拖动连跳多章。
      const activeTarget = chapterSwitchTargetRef.current;
      if (isChapterSwitchInFlight(activeTarget, chapterIndex, status)) return;
      // 新章节的首帧可能早于上方清锁 effect；事件阶段同步收口，确保用户一看到
      // 正文就能立即反向翻回，不会吞掉这次手势。
      chapterSwitchTargetRef.current = null;
      const targetReady = hasUsableChapterContent(
        chapters[idx],
        book?.source?.name,
      );
      if (idx !== chapterIndex) chapterSwitchTargetRef.current = idx;
      pendingLandRef.current =
        getChapterLanding(intent, targetReady) === 'last' ? 'last' : null;
      lockChapterTurn();
      invalidateWebScrollSync();
      closeReadingChrome();
      if (transitionRef.current) clearTimeout(transitionRef.current);

      const commitChapter = () => {
        transitionRef.current = undefined;
        // 同一章节重试/重开时 chapter.id 不变；显式触发正文加载 effect。
        if (!targetReady) setContentReloadKey(key => key + 1);
        openChapter(bookId, idx);
      };

      if (idx !== chapterIndex) {
        if (!targetReady && !isOnline) {
          // 离线且无缓存没有可等待的任务，直接切到目标章错误态。
          setStatus('error');
          commitChapter();
          return;
        }
        // 先独立提交等待态，再切章节触发同步分页；否则 React 批处理会让 Loading
        // 与新正文同批出现，用户只能感知到手势失灵和一段主线程停顿。
        setStatus('loading');
        transitionRef.current = setTimeout(
          commitChapter,
          CHAPTER_SWITCH_COMMIT_DELAY,
        );
        return;
      }

      setStatus(targetReady ? 'ready' : isOnline ? 'loading' : 'error');
      commitChapter();
    },
    [
      bookId,
      book?.source?.name,
      chapters,
      chapterIndex,
      closeReadingChrome,
      invalidateWebScrollSync,
      isOnline,
      lockChapterTurn,
      openChapter,
      status,
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
    loadNextPageRef
      .current(bookId, chapterIndex)
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
      // 新章节首屏尚未完成原生挂载时，不响应边缘点击、键盘或连续翻页；Loading
      // 消失后再统一开放，避免把用户送到未渲染的虚拟 cell。
      if (!pageInteractionReady) return;
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
      currentPageIndexRef.current = target;
      setPageIndex(target);
    },
    [
      chapterIndex,
      closeReadingChrome,
      goToChapter,
      loadCurrentChapterNextPage,
      pageInteractionReady,
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
        currentPageIndexRef.current = target;
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

  // 安卓硬件返回键：优先关闭已打开的浮层（背景工作台 / 设置面板 / 目录抽屉 / 工具栏），
  // 都关闭后才交回导航栈退出阅读页，符合安卓返回习惯。
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (excerptDraft) {
        setExcerptDraft(null);
        return true;
      }
      if (backgroundOpen) {
        closeBackgroundStudio();
        return true;
      }
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
  }, [
    backgroundOpen,
    closeBackgroundStudio,
    excerptDraft,
    settingsOpen,
    drawerOpen,
    isToolbarVisible,
    setToolbarVisible,
  ]);

  const handlePagedReaderPress = React.useCallback(
    (event: any) => {
      // 带长按摘抄的 Text 会成为独立响应节点，轻触正文时必须主动复用页级点击路由；
      // 同时停止冒泡，避免 Text 与外层 Pressable 各切换一次，最终看起来像工具栏没有响应。
      event?.stopPropagation?.();
      const nativeEvent = event?.nativeEvent ?? {};
      const pageX = nativeEvent.pageX;
      const windowGutter = Math.max(0, (winDims.width - viewportWidth) / 2);
      const x =
        typeof pageX === 'number'
          ? pageX - windowGutter
          : typeof nativeEvent.locationX === 'number'
          ? nativeEvent.locationX
          : viewportWidth / 2;

      if (x < viewportWidth * PAGE_TURN_EDGE_RATIO) {
        goToPage(-1);
      } else if (x > viewportWidth * (1 - PAGE_TURN_EDGE_RATIO)) {
        goToPage(1);
      } else {
        toggleToolbar();
      }
    },
    [goToPage, toggleToolbar, viewportWidth, winDims.width],
  );

  const handleScrollReaderTextPress = React.useCallback(
    (event: any) => {
      // 滚动模式没有左右点击翻页；正文轻触仅负责稳定显示/隐藏阅读工具栏。
      event?.stopPropagation?.();
      toggleToolbar();
    },
    [toggleToolbar],
  );

  const renderPage = React.useCallback(
    ({ item, index }: { item: ReaderPageData; index: number }) => {
      const isLastPage = index === pages.length - 1;

      return (
        <ImageBackground
          source={READER_BACKGROUND_ARTWORK[activeThemeKey]!}
          resizeMode="stretch"
          imageStyle={{
            opacity: getReaderArtworkOpacity(
              activeThemeKey,
              activeBackgroundOpacity,
            ),
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
          <Pressable
            onPress={handlePagedReaderPress}
            // ImageBackground 负责页内原画，Pressable 只承载正文和翻页点击，避免原生分页裁掉绝对定位图片。
            style={styles.pagePressTarget}
          >
            {item.showHeader && (
              <>
                <Text
                  style={[
                    styles.chapterTitle,
                    {
                      fontSize: display.titleSize,
                      lineHeight: chapterTitleLineHeight,
                      color: display.theme.text,
                    },
                  ]}
                >
                  {chapter?.title || book?.title}
                </Text>
                <Text
                  style={[styles.chapterMeta, { color: display.theme.sub }]}
                >
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
                  // 正文长按用于摘抄，但普通轻触仍应只交给页级点击区处理；
                  // 关闭 iOS 的文字按压高亮，避免轻触正文时误以为已触发划线/摘抄。
                  suppressHighlighting
                  onPress={handlePagedReaderPress}
                  onLongPress={event => {
                    event.stopPropagation();
                    openExcerptDraft(block.text, block.startOffset);
                  }}
                  style={{
                    fontFamily: bodyFont,
                    fontSize: display.fontSize,
                    lineHeight: display.fontSize * display.lineHeight,
                    color: display.theme.text,
                    textAlign: 'justify',
                    marginTop: i === 0 ? 0 : display.paraGap,
                    backgroundColor: isExcerptRange(
                      block.startOffset,
                      block.startOffset +
                        Array.from(block.text.replace(/\n/g, '')).length,
                    )
                      ? 'rgba(202,154,70,.18)'
                      : 'transparent',
                  }}
                >
                  {
                    // 分页器保存的换行只用于计算页高，不能作为正文硬换行渲染。
                    // iOS 会把每个硬换行都视为段落末行，导致两端对齐失效，
                    // 尤其在 31 等字号下表现为右侧残留一块明显空白。
                    block.text.replace(/\n/g, '')
                  }
                </Text>
              ))
            )}
            {isLastPage && (
              <Text style={[styles.pageEndText, { color: display.theme.sub }]}>
                {chapter?.nextPageUrl ? '本页完' : '本章完'}
              </Text>
            )}
          </Pressable>
        </ImageBackground>
      );
    },
    [
      book?.author,
      book?.title,
      bodyFont,
      activeBackgroundOpacity,
      activeThemeKey,
      chapter?.title,
      chapter?.nextPageUrl,
      display.fontSize,
      display.lineHeight,
      display.paraGap,
      display.theme.sub,
      display.theme.text,
      display.titleSize,
      chapterTitleLineHeight,
      handlePagedReaderPress,
      isExcerptRange,
      pages.length,
      openExcerptDraft,
      readerColumn.paddingH,
      readerTopPadding,
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
      if (currentPageIndexRef.current === next) return;
      currentPageIndexRef.current = next;
      setPageIndex(next);
    },
    [pages, viewportWidth],
  );

  const syncPageByScrollOffset = React.useCallback(
    (offsetX: number) => {
      const raw = Math.round(offsetX / viewportWidth);
      const next = Math.max(0, Math.min(pages.length - 1, raw));
      if (currentPageIndexRef.current === next) return;
      currentOffsetRef.current = pages[next]?.startOffset ?? 0;
      currentPageIndexRef.current = next;
      setPageIndex(next);
    },
    [pages, viewportWidth],
  );

  const tryTurnChapterFromGesture = React.useCallback(
    (offsetX: number, releaseVelocityX = 0) => {
      const gesture = chapterTurnGestureRef.current;
      if (!canHandleBoundaryTurnGesture(gesture, chapter?.id)) return false;

      const turn = getBoundaryTurn({
        offsetX,
        // 只允许“从边界页开始”的手势跨章；页码在滑动中实时更新后，也不能让
        // 一次长距离拖动从倒数第二页直接穿过末页并继续切到下一章。
        pageIndex: gesture.startPageIndex,
        pagesLength: pages.length,
        viewportWidth,
        chapterIndex,
        totalChapters: total,
        locked: chapterTurnLockRef.current,
        threshold: CHAPTER_TURN_THRESHOLD,
        releaseVelocityX,
        velocityThreshold: CHAPTER_TURN_VELOCITY_THRESHOLD,
      });
      if (!turn) return false;

      // 先同步消费手势再触发任何状态更新，保证同一批 onScroll/onScrollEndDrag
      // 即使连续到达，也只有第一个事件能进入切章路径。
      gesture.consumed = true;
      gesture.dragging = false;
      lockChapterTurn();
      if (turn === 'prev') {
        goToChapter(chapterIndex - 1, 'prev');
      } else if (!loadCurrentChapterNextPage()) {
        goToChapter(chapterIndex + 1, 'next');
      }
      return true;
    },
    [
      chapter?.id,
      chapterIndex,
      chapterTurnLockRef,
      goToChapter,
      loadCurrentChapterNextPage,
      lockChapterTurn,
      pages.length,
      total,
      viewportWidth,
    ],
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

      // 原生端越过半页时才会命中新页，ref 去重后一次正常翻页只提交一次状态，
      // 底部页码无需再等惯性结束，也不会在每个 onScroll 事件里重渲染。
      syncPageByScrollOffset(x);
      tryTurnChapterFromGesture(x);
    },
    [
      syncPageByScrollOffset,
      tryTurnChapterFromGesture,
      webProgrammaticScrollRef,
      webScrollEpochRef,
      webScrollIdleRef,
    ],
  );

  const paragraphNodes = React.useMemo(() => {
    let logicalPosition = 0;
    return paragraphs.map((p, i) => {
      const position = logicalPosition;
      const paragraphLength = Array.from(p).length;
      logicalPosition += paragraphLength;
      const highlighted = isExcerptRange(position, position + paragraphLength);
      return (
        <Text
          key={i}
          // 滚动模式同样只在真正长按后打开摘抄，轻触不显示文字按压效果。
          suppressHighlighting
          onPress={handleScrollReaderTextPress}
          onLongPress={event => {
            event.stopPropagation();
            openExcerptDraft(p, position);
          }}
          style={{
            fontFamily: bodyFont,
            fontSize: display.fontSize,
            lineHeight: display.fontSize * display.lineHeight,
            marginBottom: display.paraGap,
            color: display.theme.text,
            textAlign: 'justify',
            backgroundColor: highlighted
              ? 'rgba(202,154,70,.18)'
              : 'transparent',
          }}
        >
          {'　　' + p}
        </Text>
      );
    });
  }, [
    bodyFont,
    display.fontSize,
    display.lineHeight,
    display.paraGap,
    display.theme.text,
    handleScrollReaderTextPress,
    isExcerptRange,
    openExcerptDraft,
    paragraphs,
  ]);

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
      {settings.pageMode !== 'page' &&
        READER_BACKGROUND_ARTWORK[activeThemeKey] && (
          <Image
            source={READER_BACKGROUND_ARTWORK[activeThemeKey]!}
            // 滚动模式只在页面底层绘制一次；翻页模式由各分页单元绘制，避免透明度叠加失真。
            resizeMode="stretch"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: getReaderArtworkOpacity(
                  activeThemeKey,
                  activeBackgroundOpacity,
                ),
              },
            ]}
          />
        )}
      {status === 'ready' &&
        (settings.pageMode === 'page' ? (
          <>
            <FlatList
              key={chapter?.id || bookId}
              ref={flatListRef}
              testID="reader-page-list"
              data={pages}
              renderItem={renderPage}
              keyExtractor={item => item.key}
              horizontal
              scrollEnabled={pageInteractionReady}
              pagingEnabled={Platform.OS !== 'web'}
              style={[
                StyleSheet.absoluteFill,
                WEB_SNAP_CONTAINER,
                Platform.OS === 'web' && !snapEnabled
                  ? ({ scrollSnapType: 'none' } as any)
                  : null,
              ]}
              showsHorizontalScrollIndicator={false}
              // 新章首批至少铺好 3 页，并在一帧内补齐前后页；否则连续快速翻页
              // 会先抵达尚未挂载的 cell，短暂看到空白。
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              updateCellsBatchingPeriod={16}
              windowSize={5}
              // 页面内有绝对定位的边缘原画；iOS 开启裁剪会误删这类子视图，
              // 5 页文本窗口内存增量可控，关闭裁剪可避免正文被误清空。
              removeClippedSubviews={false}
              getItemLayout={getPageLayout}
              initialScrollIndex={initialChapterPageIndex}
              viewabilityConfig={pageViewabilityConfigRef.current}
              onViewableItemsChanged={onPageViewableItemsChangedRef.current}
              onScrollBeginDrag={event => {
                markUserWebScroll();
                if (Platform.OS !== 'web') {
                  // 连续翻页可能在上一段惯性尚未结束时开始；先按原生实际 offset
                  // 补齐页码和逻辑位置，避免后续重定位仍拿到上一页（常见是章首页）。
                  syncPageByScrollOffset(event.nativeEvent.contentOffset.x);
                }
                // 新的用户拖动才重新武装跨章能力。自动滚动、上一手势的惯性以及
                // 换章后的迟到事件都不会自行解锁。
                chapterTurnGestureRef.current = {
                  chapterId: chapter?.id,
                  startPageIndex: currentPageIndexRef.current,
                  dragging: true,
                  consumed: false,
                };
                unlockChapterTurn();
                setToolbarVisible(false);
              }}
              onScrollEndDrag={event => {
                if (Platform.OS !== 'web') {
                  const nativeVelocity = event.nativeEvent.velocity?.x ?? 0;
                  // Android 上报的是手指速度，方向与内容滚动相反；iOS 上报内容速度。
                  const releaseVelocity =
                    Platform.OS === 'android'
                      ? -nativeVelocity
                      : nativeVelocity;
                  tryTurnChapterFromGesture(
                    event.nativeEvent.contentOffset.x,
                    releaseVelocity,
                  );
                }
                const gesture = chapterTurnGestureRef.current;
                if (gesture.chapterId === chapter?.id) {
                  gesture.dragging = false;
                  gesture.consumed = true;
                }
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
                  // 用真实正文字体测量：断行结果要与渲染一致，硬编码 SERIF_FONT
                  // 会让非衬线字体下的每页行数/末页留白算错。
                  fontFamily: bodyFont,
                  fontSize: display.fontSize,
                  lineHeight: display.fontSize * display.lineHeight,
                }}
                onTextLayout={e => {
                  const chapterId = chapter?.id || bookId;
                  const cacheKey = readerLineCacheKey({
                    chapterId,
                    textLength: chapterTextLength,
                    maxWidth: pageMetrics.maxWidth,
                    fontSize: display.fontSize,
                    lineHeight: display.lineHeight,
                    fontFamily: bodyFont,
                  });
                  if (measuredLinesCache.has(cacheKey)) return;
                  const lineTexts = e.nativeEvent.lines.map(l => l.text);
                  const lines = linesFromTextLayout(paragraphs, lineTexts);
                  cacheReaderLines(measuredLinesCache, cacheKey, lines);
                  // 当前 FlatList 挂载期间不替换分页 data。连续滑动中途从估算分页
                  // 切到实测分页会导致虚拟列表短暂空白，并按尚未落定的旧偏移跳回
                  // 章首页；实测结果缓存到下次进入本章时直接使用即可。
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
                  {
                    fontSize: display.titleSize,
                    lineHeight: chapterTitleLineHeight,
                    color: display.theme.text,
                  },
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
            正在准备章节…
          </Text>
        </View>
      )}

      {status === 'ready' &&
        settings.pageMode === 'page' &&
        !pageInteractionReady && (
          <View
            testID="reader-page-preparing"
            style={[
              StyleSheet.absoluteFill,
              styles.pagePreparingOverlay,
              { backgroundColor: display.theme.bg },
            ]}
          >
            <ActivityIndicator size="large" color={NOVEL_ACCENT} />
            <Text style={{ color: display.theme.sub, fontSize: 13 }}>
              正在准备页面…
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
          style={[styles.readerStatusChapter, { color: display.theme.sub }]}
        >
          {topChapterLabel}
        </Text>
        <Text style={[styles.readerStatusTime, { color: display.theme.sub }]}>
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
        {/* 与左侧返回按钮等宽占位，确保书名相对整个屏幕几何居中。 */}
        <View style={styles.barBtn} />
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
              setDrawerPositioning(true);
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
            onPress={() =>
              setReaderTheme(isNight ? settings.dayTheme ?? 'paper' : 'night')
            }
          />
          {Orientation.isSupported && (
            <ReaderAction
              icon="screen-rotation"
              label={readerOrientation === 'portrait' ? '横屏' : '竖屏'}
              color={display.chrome.ink}
              onPress={toggleReaderOrientation}
            />
          )}
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

      {excerptDraft ? (
        <>
          <View style={[styles.overlay, styles.excerptOverlay]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setExcerptDraft(null)}
            />
          </View>
          <KeyboardAvoidingView
            pointerEvents="box-none"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.excerptKeyboardLayer}
          >
            <View
              style={[
                styles.excerptSheet,
                { backgroundColor: display.chrome.sheetBg },
              ]}
            >
              <View style={styles.excerptHeader}>
                <View>
                  <Text
                    style={[
                      styles.excerptTitle,
                      { color: display.chrome.sheetInk },
                    ]}
                  >
                    保存摘抄
                  </Text>
                  <Text
                    style={{
                      color: display.chrome.sheetSub,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {chapter?.title || `第 ${chapterIndex + 1} 章`}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="关闭摘抄面板"
                  onPress={() => setExcerptDraft(null)}
                  style={styles.excerptClose}
                >
                  <Icon
                    name="close"
                    size={20}
                    color={display.chrome.sheetSub}
                  />
                </Pressable>
              </View>
              <View
                style={[
                  styles.excerptPreview,
                  { backgroundColor: display.chrome.field },
                ]}
              >
                <Text
                  numberOfLines={5}
                  style={{
                    color: display.chrome.sheetInk,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  {excerptDraft.excerpt}
                </Text>
              </View>
              <TextInput
                value={excerptDraft.note}
                onChangeText={note =>
                  setExcerptDraft(current =>
                    current ? { ...current, note } : current,
                  )
                }
                multiline
                maxLength={500}
                placeholder="写一句想法（可选）"
                placeholderTextColor={display.chrome.sheetSub}
                style={[
                  styles.excerptNoteInput,
                  {
                    color: display.chrome.sheetInk,
                    borderColor: display.chrome.hair,
                  },
                ]}
              />
              <View style={styles.excerptActions}>
                <Pressable
                  onPress={() => setExcerptDraft(null)}
                  style={[
                    styles.excerptActionButton,
                    { borderColor: display.chrome.hair },
                  ]}
                >
                  <Text
                    style={{ color: display.chrome.sheetSub, fontSize: 13 }}
                  >
                    取消
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    saveExcerpt(
                      bookId,
                      excerptDraft.chapterId,
                      excerptDraft.position,
                      excerptDraft.excerpt,
                      excerptDraft.note,
                    );
                    setExcerptDraft(null);
                  }}
                  style={[
                    styles.excerptActionButton,
                    {
                      backgroundColor: NOVEL_ACCENT,
                      borderColor: NOVEL_ACCENT,
                    },
                  ]}
                >
                  <Text style={styles.excerptSaveText}>保存</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </>
      ) : null}

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
                {fontDownloadBusy ? '字体下载处理中，请稍候' : '字体'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {FONTS.map(f => {
                  // 旧版本若保存了已删除的 system/lxgwlite，目录解析会回退宋体，
                  // 这里也用同一解析结果，避免界面出现“没有任何字体被选中”。
                  const on = getFontDef(settings.fontKey).key === f.key;
                  const remote = f.kind === 'remote';
                  const busy = remote && isFontLoading(f.key);
                  const needDl = remote && !isFontReady(f.key) && !busy;
                  return (
                    <Pressable
                      key={f.key}
                      disabled={fontDownloadBusy}
                      accessibilityState={{
                        disabled: fontDownloadBusy,
                        busy,
                      }}
                      onPress={async () => {
                        // disabled 状态更新前仍可能发生同一帧连点，管理器同步锁再兜底。
                        if (isAnyFontLoading()) return;
                        if (!remote || isFontReady(f.key)) {
                          setReaderFont(f.key);
                          return;
                        }
                        try {
                          // 待下载字体只有在文件下载并完成原生注册后才写入设置；
                          // 失败时继续保留当前字体，避免渲染不存在的 family。
                          await ensureFont(f);
                          if (!isFontReady(f.key)) {
                            throw new Error('字体注册未完成');
                          }
                          setReaderFont(f.key);
                        } catch (error) {
                          console.warn('[ReaderScreen] font download failed', {
                            key: f.key,
                            error:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          });
                          Alert.alert(
                            '字体下载失败',
                            '请检查网络后重试，当前阅读字体不会改变。',
                          );
                        }
                      }}
                      style={[
                        styles.fontBtn,
                        {
                          backgroundColor: on ? NOVEL_ACCENT : 'transparent',
                          borderColor: on ? NOVEL_ACCENT : display.chrome.hair,
                          opacity: fontDownloadBusy && !busy ? 0.42 : 1,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: on ? '#fff' : display.chrome.sheetInk,
                          fontSize: 12,
                          // 已可用的选项直接用自身字体展示名称，切换结果更直观。
                          fontFamily: fontFamilyFor(f),
                        }}
                      >
                        {f.label}
                        {needDl ? ' ↓' : ''}
                      </Text>
                      {busy && (
                        <ActivityIndicator
                          size="small"
                          color={on ? '#fff' : NOVEL_ACCENT}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.quickThemeSection}>
              <View style={styles.quickThemeHeader}>
                <View>
                  <Text
                    style={{ color: display.chrome.sheetSub, fontSize: 12 }}
                  >
                    常用背景
                  </Text>
                  <Text
                    style={{ color: display.chrome.sheetSub, fontSize: 10 }}
                  >
                    点击立即生效
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="打开全部阅读背景"
                  onPress={openBackgroundStudio}
                  style={styles.quickThemeMore}
                >
                  <Text style={{ color: NOVEL_ACCENT, fontSize: 12 }}>
                    更多背景
                  </Text>
                  <Icon name="chevron-right" size={16} color={NOVEL_ACCENT} />
                </Pressable>
              </View>
              <View style={styles.quickThemeRow}>
                {QUICK_THEME_ORDER.map(key => {
                  const theme = READER_THEMES[key];
                  const selected = settings.theme === key;
                  const artwork =
                    READER_BACKGROUND_DECORATION[key] ||
                    READER_BACKGROUND_ARTWORK[key];
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`快捷阅读背景 ${theme.label}`}
                      onPress={() => setReaderTheme(key)}
                      style={[
                        styles.quickThemeItem,
                        {
                          borderColor: selected
                            ? NOVEL_ACCENT
                            : display.chrome.hair,
                          backgroundColor: selected
                            ? `${NOVEL_ACCENT}12`
                            : 'transparent',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.quickThemePreview,
                          { backgroundColor: theme.bg },
                        ]}
                      >
                        {artwork && (
                          <Image
                            source={artwork}
                            resizeMode="stretch"
                            style={StyleSheet.absoluteFill}
                          />
                        )}
                        {selected && (
                          <View style={styles.quickThemeCheck}>
                            <Icon name="check" size={10} color="#fff" />
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected
                            ? NOVEL_ACCENT
                            : display.chrome.sheetInk,
                          fontSize: 10.5,
                        }}
                      >
                        {theme.label}
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

      {backgroundTransition.mounted && (
        <>
          <Animated.View
            style={[
              styles.backgroundOverlay,
              { opacity: backgroundTransition.value },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeBackgroundStudio}
            />
          </Animated.View>
          <Animated.View
            onLayout={e =>
              setBackgroundSheetHeight(e.nativeEvent.layout.height)
            }
            style={[
              styles.backgroundSheet,
              {
                backgroundColor: display.chrome.sheetBg,
                transform: [
                  {
                    translateY: backgroundTransition.value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [backgroundSheetHeight + 40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View
              style={[styles.grabber, { backgroundColor: display.chrome.hair }]}
            />
            <View style={styles.backgroundHeader}>
              <View>
                <Text
                  style={[
                    styles.backgroundTitle,
                    { color: display.chrome.sheetInk },
                  ]}
                >
                  阅读背景
                </Text>
                <Text
                  style={{ color: display.chrome.sheetSub, fontSize: 10.5 }}
                >
                  点击即生效
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="取消背景选择"
                onPress={closeBackgroundStudio}
                style={styles.backgroundClose}
              >
                <Icon name="close" size={22} color={display.chrome.sheetSub} />
              </Pressable>
            </View>

            <View style={styles.backgroundTabs}>
              {(
                [
                  { key: 'solid', label: '素色' },
                  { key: 'scenic', label: '意境' },
                ] as const
              ).map(item => {
                const active = backgroundCategory === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setBackgroundCategory(item.key)}
                    style={styles.backgroundTab}
                  >
                    <Text
                      style={{
                        color: active ? NOVEL_ACCENT : display.chrome.sheetSub,
                        fontSize: 15,
                        fontWeight: active ? '600' : '400',
                      }}
                    >
                      {item.label}
                    </Text>
                    {active && <View style={styles.backgroundTabIndicator} />}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.backgroundThemeList}
            >
              {(backgroundCategory === 'solid'
                ? SOLID_THEME_ORDER
                : SCENIC_THEME_ORDER
              ).map(key => {
                const theme = READER_THEMES[key];
                const selected = backgroundPreviewTheme === key;
                const artwork =
                  READER_BACKGROUND_DECORATION[key] ||
                  READER_BACKGROUND_ARTWORK[key];
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`阅读背景 ${theme.label}`}
                    onPress={() => {
                      setBackgroundPreviewTheme(key);
                      setReaderTheme(key);
                    }}
                    style={styles.backgroundThemeItem}
                  >
                    <View
                      style={[
                        styles.backgroundThemePreview,
                        {
                          backgroundColor: theme.bg,
                          borderColor: selected
                            ? NOVEL_ACCENT
                            : display.chrome.hair,
                        },
                      ]}
                    >
                      {artwork ? (
                        <Image
                          source={artwork}
                          resizeMode="contain"
                          // 缩略卡片必须给出明确尺寸；部分 iOS Release 构建不会为 absoluteFill 图片推导父级尺寸。
                          style={styles.backgroundThemeArtwork}
                        />
                      ) : (
                        <Text
                          style={{
                            color: theme.text,
                            fontFamily: SERIF_FONT,
                            fontSize: 23,
                          }}
                        >
                          文
                        </Text>
                      )}
                      {selected && (
                        <View style={styles.backgroundCheck}>
                          <Icon name="check" size={13} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected
                          ? NOVEL_ACCENT
                          : display.chrome.sheetSub,
                        fontSize: 11,
                      }}
                    >
                      {theme.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {READER_THEMES[backgroundPreviewTheme].category === 'scenic' && (
              <View style={styles.backgroundIntensitySection}>
                <Text style={{ color: display.chrome.sheetInk, fontSize: 12 }}>
                  背景浓度
                </Text>
                <View style={styles.backgroundIntensityRow}>
                  {BACKGROUND_INTENSITY_PRESETS.map(preset => {
                    const selected =
                      closestBackgroundIntensity(backgroundPreviewOpacity) ===
                      preset.value;
                    return (
                      <Pressable
                        key={preset.label}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`背景浓度 ${
                          preset.label
                        } ${Math.round(preset.value * 100)}%`}
                        // 离散点击只触发一次图片更新，避免拖动时连续重绘原生分页导致闪动。
                        onPress={() => updateBackgroundOpacity(preset.value)}
                        style={[
                          styles.backgroundIntensityButton,
                          {
                            borderColor: selected
                              ? NOVEL_ACCENT
                              : display.chrome.hair,
                            backgroundColor: selected
                              ? NOVEL_ACCENT
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? '#fff' : display.chrome.sheetInk,
                            fontSize: 11.5,
                          }}
                        >
                          {preset.label} {Math.round(preset.value * 100)}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </Animated.View>
        </>
      )}

      {drawerTransition.mounted && (
        <>
          <Animated.View
            // 目录是阅读内容的侧向导航，不应复用普通弹窗的黑色遮罩；
            // 透明层仍负责点击正文区域关闭目录，但不会让用户误以为系统亮度被降低。
            style={[
              styles.overlay,
              styles.drawerOverlay,
              { opacity: drawerTransition.value },
            ]}
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
                {drawerTab === 'toc'
                  ? `共 ${total} 章`
                  : drawerTab === 'search'
                  ? `可搜索 ${searchableChapterCount} / ${total} 章正文`
                  : drawerTab === 'notes'
                  ? `共 ${excerpts.length} 条摘抄`
                  : `共 ${plainBookmarks.length} 条书签`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {(['toc', 'search', 'notes', 'marks'] as const).map(tab => {
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
                        {tab === 'toc'
                          ? '目录'
                          : tab === 'search'
                          ? '全文'
                          : tab === 'notes'
                          ? '摘抄'
                          : '书签'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {(drawerTab === 'toc' || drawerTab === 'search') && (
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
                      value={
                        drawerTab === 'toc' ? drawerQuery : textSearchInput
                      }
                      onChangeText={
                        drawerTab === 'toc'
                          ? setDrawerQuery
                          : setTextSearchInput
                      }
                      placeholder={
                        drawerTab === 'toc' ? '搜索章节' : '搜索正文关键词'
                      }
                      placeholderTextColor={display.chrome.sheetSub}
                      returnKeyType="search"
                      style={{
                        flex: 1,
                        color: display.chrome.sheetInk,
                        fontSize: 12,
                        padding: 0,
                        marginLeft: 7,
                      }}
                    />
                  </View>
                  {drawerTab === 'toc' ? (
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
                  ) : null}
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
                {plainBookmarks.length === 0 ? (
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
                  plainBookmarks
                    .map(bm => ({
                      bm,
                      idx: chapters.findIndex(c => c.id === bm.chapterId),
                    }))
                    .filter(x => x.idx >= 0)
                    .sort((a, b) => a.idx - b.idx)
                    .map(({ bm, idx }) => (
                      <Pressable
                        key={bm.id}
                        onPress={() =>
                          jumpToBookmark(bm.chapterId, bm.position)
                        }
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
            ) : drawerTab === 'notes' ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 8,
                  paddingBottom: 20,
                  flexGrow: 1,
                }}
              >
                {excerpts.length === 0 ? (
                  <View style={styles.textSearchEmpty}>
                    <Icon
                      name="format-quote"
                      size={30}
                      color={display.chrome.sheetSub}
                    />
                    <Text
                      style={{
                        color: display.chrome.sheetSub,
                        fontSize: 12.5,
                        lineHeight: 19,
                        textAlign: 'center',
                        marginTop: 9,
                      }}
                    >
                      长按正文段落，即可保存摘抄和笔记
                    </Text>
                  </View>
                ) : (
                  excerpts
                    .map(item => ({
                      item,
                      idx: chapters.findIndex(
                        chapterItem => chapterItem.id === item.chapterId,
                      ),
                    }))
                    .filter(entry => entry.idx >= 0)
                    .sort(
                      (a, b) =>
                        a.idx - b.idx || a.item.position - b.item.position,
                    )
                    .map(({ item, idx }) => (
                      <Pressable
                        key={item.id}
                        onPress={() =>
                          jumpToBookmark(item.chapterId, item.position)
                        }
                        onLongPress={() =>
                          Alert.alert('删除摘抄', '确定删除这条摘抄和笔记？', [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => removeBookmark(bookId, item.id),
                            },
                          ])
                        }
                        delayLongPress={350}
                        style={[
                          styles.excerptListItem,
                          { borderColor: display.chrome.hair },
                        ]}
                      >
                        <View style={styles.excerptListHeader}>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: NOVEL_ACCENT,
                              fontSize: 11,
                              flex: 1,
                            }}
                          >
                            {displayChapterTitle(chapters[idx], idx)}
                          </Text>
                          <Text
                            style={{
                              color: display.chrome.sheetSub,
                              fontSize: 10,
                            }}
                          >
                            长按删除
                          </Text>
                        </View>
                        <Text
                          numberOfLines={3}
                          style={{
                            color: display.chrome.sheetInk,
                            fontSize: 12.5,
                            lineHeight: 19,
                          }}
                        >
                          {item.excerpt}
                        </Text>
                        {item.note ? (
                          <View
                            style={[
                              styles.excerptListNote,
                              { backgroundColor: display.chrome.field },
                            ]}
                          >
                            <Text
                              numberOfLines={2}
                              style={{
                                color: display.chrome.sheetSub,
                                fontSize: 11.5,
                                lineHeight: 17,
                              }}
                            >
                              {item.note}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    ))
                )}
              </ScrollView>
            ) : drawerTab === 'search' ? (
              <FlatList
                // 全文结果与目录虽然位于同一条件分支位置，但监听配置不同；必须使用独立 key，
                // 否则 RN 会复用 FlatList 并因 onViewableItemsChanged 可空性变化直接触发原生崩溃。
                key="drawer-text-search-results"
                style={{ flex: 1 }}
                data={textSearchPending ? [] : textSearchResults}
                keyExtractor={item => `${item.chapterId}-${item.position}`}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: 6,
                  paddingBottom: 20,
                  flexGrow: 1,
                }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() =>
                      jumpToBookmark(item.chapterId, item.position)
                    }
                    style={styles.textSearchResult}
                  >
                    <Icon
                      name="find-in-page"
                      size={16}
                      color={NOVEL_ACCENT}
                      style={styles.textSearchResultIcon}
                    />
                    <View style={styles.textSearchResultBody}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: display.chrome.sheetInk,
                          fontSize: 13.5,
                          fontWeight: '600',
                        }}
                      >
                        {displayChapterTitle(
                          chapters[item.chapterIndex],
                          item.chapterIndex,
                        )}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: display.chrome.sheetSub,
                          fontSize: 11.5,
                          lineHeight: 17,
                          marginTop: 4,
                        }}
                      >
                        {item.excerpt}
                      </Text>
                    </View>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.textSearchEmpty}>
                    <Icon
                      name={textSearchPending ? 'hourglass-empty' : 'search'}
                      size={30}
                      color={display.chrome.sheetSub}
                    />
                    <Text
                      style={{
                        color: display.chrome.sheetSub,
                        fontSize: 12.5,
                        lineHeight: 19,
                        textAlign: 'center',
                        marginTop: 9,
                      }}
                    >
                      {textSearchPending
                        ? '正在搜索…'
                        : !textSearchQuery
                        ? '输入人物、地点或句子，查找正文内容'
                        : '当前可搜索正文中没有找到相关内容'}
                    </Text>
                    {isOnline && searchableChapterCount < total ? (
                      <Text
                        style={{
                          color: display.chrome.sheetSub,
                          opacity: 0.72,
                          fontSize: 11,
                          lineHeight: 17,
                          textAlign: 'center',
                          marginTop: 7,
                        }}
                      >
                        未缓存章节暂不搜索，可在书籍详情中缓存全本
                      </Text>
                    ) : null}
                  </View>
                }
                ListFooterComponent={
                  !textSearchPending &&
                  textSearchResults.length > 0 &&
                  isOnline &&
                  searchableChapterCount < total ? (
                    <Text
                      style={[
                        styles.textSearchCoverage,
                        { color: display.chrome.sheetSub },
                      ]}
                    >
                      已搜索缓存的 {searchableChapterCount} / {total}{' '}
                      章，缓存全本后可搜索完整正文
                    </Text>
                  ) : null
                }
              />
            ) : (
              <FlatList
                key="drawer-table-of-contents"
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
                  const isCached =
                    isOnline && hasUsableChapterContent(c, book?.source?.name);
                  return (
                    <Pressable
                      disabled={drawerPositioning}
                      accessibilityState={{ disabled: drawerPositioning }}
                      onPress={() => goToChapter(idx)}
                      style={[
                        styles.chapterRow,
                        {
                          backgroundColor: isCur
                            ? 'rgba(46,107,94,.1)'
                            : 'transparent',
                          opacity: drawerPositioning ? 0.56 : 1,
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
                      <View style={styles.chapterTitleGroup}>
                        <Text
                          numberOfLines={1}
                          style={{
                            flexShrink: 1,
                            fontSize: 13.5,
                            color: isCur
                              ? NOVEL_ACCENT
                              : display.chrome.sheetInk,
                            fontWeight: isCur ? '700' : '400',
                          }}
                        >
                          {displayChapterTitle(c, idx)}
                        </Text>
                        {isCached && (
                          <View style={styles.chapterCacheBadge}>
                            <Text style={styles.chapterCacheBadgeText}>
                              已缓存
                            </Text>
                          </View>
                        )}
                      </View>
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
  pagePressTarget: { flex: 1 },
  pageEndText: {
    marginTop: 18,
    fontSize: 12,
    textAlign: 'center',
  },
  chapterTitle: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    marginBottom: 8,
  },
  chapterMeta: { fontSize: 12, marginBottom: 24 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  pagePreparingOverlay: {
    zIndex: 20,
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
    zIndex: 2,
  },
  // 原生分页列表可能拥有独立合成层；显式抬高透明装饰，才能稳定显示在正文页之上。
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
    zIndex: 2,
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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    zIndex: 2,
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
    zIndex: 3,
  },
  excerptOverlay: {
    zIndex: 7,
  },
  drawerOverlay: {
    // 关闭手势只覆盖目录右侧正文，不能拦截目录内部的标签、搜索和章节点击。
    left: DRAWER_WIDTH,
    backgroundColor: 'transparent',
  },
  excerptKeyboardLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
  excerptSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  excerptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  excerptTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  excerptClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excerptPreview: {
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },
  excerptNoteInput: {
    minHeight: 76,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  excerptActions: {
    flexDirection: 'row',
    gap: 10,
  },
  excerptActionButton: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excerptSaveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // 背景工作台本身就是实时预览，遮罩只做层级提示，不能像普通弹窗一样压暗正文。
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,.07)',
    zIndex: 3,
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
    zIndex: 4,
  },
  backgroundSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 24,
    zIndex: 4,
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
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickThemeSection: {
    marginBottom: 18,
    gap: 9,
  },
  quickThemeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickThemeMore: {
    minHeight: 32,
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickThemeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickThemeItem: {
    flex: 1,
    minWidth: 0,
    height: 60,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  quickThemePreview: {
    width: 28,
    height: 28,
    overflow: 'hidden',
    borderRadius: 8,
  },
  quickThemeCheck: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: NOVEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backgroundTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  backgroundClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundTabs: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 14,
  },
  backgroundTab: {
    minWidth: 72,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  backgroundTabIndicator: {
    position: 'absolute',
    bottom: 1,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: NOVEL_GOLD,
  },
  backgroundThemeList: {
    gap: 12,
    paddingRight: 8,
    paddingBottom: 16,
  },
  backgroundThemeItem: {
    width: 92,
    alignItems: 'center',
    gap: 7,
  },
  backgroundThemePreview: {
    width: 92,
    height: 86,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundThemeArtwork: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  backgroundCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: NOVEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundIntensitySection: {
    gap: 8,
  },
  backgroundIntensityRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 0,
  },
  backgroundIntensityButton: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    // 明确压在关闭遮罩之上，避免不同原生平台的兄弟节点触摸层级差异。
    zIndex: 4,
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
  chapterTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chapterCacheBadge: {
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(46,107,94,.1)',
  },
  chapterCacheBadgeText: {
    color: NOVEL_ACCENT,
    fontSize: 9.5,
    lineHeight: 12,
  },
  textSearchResult: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
  },
  textSearchResultIcon: {
    width: 28,
    marginTop: 1,
  },
  textSearchResultBody: {
    flex: 1,
    minWidth: 0,
  },
  textSearchEmpty: {
    flex: 1,
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  textSearchCoverage: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: 'center',
  },
  excerptListItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 13,
  },
  excerptListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  excerptListNote: {
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginTop: 8,
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
