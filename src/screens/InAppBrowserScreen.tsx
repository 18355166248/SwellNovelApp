/**
 * 内置浏览器（原生实现，基座文件）：你自由浏览/搜索小说站点，App 读你正看着的
 * **已渲染页面**，自动识别书籍详情/目录并一键加入书架。可见、由你操作 —— Cloudflare
 * / 登录 / JS 渲染都交给真浏览器，App 只做 DOM 识别，规避 CORS 与反爬。
 *
 * Web 端由 InAppBrowserScreen.web.tsx 覆盖为占位（浏览器不能内嵌外域站点）。
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import {
  RouteProp,
  useNavigation,
  useRoute,
  useIsFocused,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { Icon, BookCover } from '../components';
import { useAddRecognizedBook } from '../store';
import {
  RECOGNIZER_JS,
  RECOGNIZE_MESSAGE,
  getRecognitionTargetUrl,
  inputToUrl,
  recognizeBookHtml,
  RecognizedBook,
} from '../services/recognize/recognizer';
import { fetchRenderedHtml } from '../services/browserFetch/bridge';
import { useRecognizedBookMetadata } from '../services/recognize/useRecognizedBookMetadata';
import { prepareRecognizedCatalog } from '../services/recognize/prepareRecognizedCatalog';
import { isAbortError } from '../utils/abort';
import { useScreenTaskSignal } from '../store/hooks/useScreenTaskSignal';
import { PAGE_SANITIZER_JS } from '../services/browserFetch/pageSanitizer';
import {
  SOURCES,
  getSourceHomeUrl,
  resolveSource,
} from '../services/source/registry';
import {
  isRequestedBrowserNavigation,
  shouldBlockAdNavigation,
} from '../services/browserFetch/navigationGuard';
import {
  addBrowserHistory,
  loadBrowserHistory,
  saveBrowserHistory,
} from '../utils/browserHistory';

// react-native-webview 的 class 组件类型与 React 19 的 JSX 类型不完全兼容，
// 以 any 组件形式渲染，绕过构造签名不匹配（不影响运行时）。
const WebView = RNWebView as unknown as React.ComponentType<any>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type BrowserRoute = RouteProp<RootStackParamList, 'InAppBrowser'>;

/**
 * 起始页的站点入口。
 *
 * 已注册书源直接由 SOURCES 生成，新增书源会自动出现在这里，不必二次维护；
 * 末尾兜底一个搜索引擎，站点换域名或想找别的书时用户可以自己搜。
 */
const SITE_ENTRIES: {
  name: string;
  desc: string;
  url: string;
  supported: boolean;
}[] = [
  ...SOURCES.map(source => {
    const url = getSourceHomeUrl(source);
    // 展示真正会打开的域名：host 未必等于首页地址（明智屋浏览走繁体站）。
    const shown = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      name: source.name,
      desc: shown,
      url,
      supported: true,
    };
  }),
  {
    name: '用搜索引擎找书',
    desc: '打开必应，找到书籍目录页后再识别导入',
    url: 'https://www.bing.com/',
    supported: false,
  },
];
const RECOGNIZE_CALLBACK_PREFIX = 'nvl-recognize://result?data=';

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export default function InAppBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<BrowserRoute>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const addRecognized = useAddRecognizedBook();

  const webRef = React.useRef<any>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [input, setInput] = React.useState('');
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyExpanded, setHistoryExpanded] = React.useState(false);
  const [historyReady, setHistoryReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [recognizedPage, setRecognized] = React.useState<RecognizedBook | null>(
    null,
  );
  const focused = useIsFocused();
  const taskSignal = useScreenTaskSignal(navigation, url || '', focused);
  const { book: recognized, loading: metadataLoading } =
    useRecognizedBookMetadata(recognizedPage, focused);
  const [recognizing, setRecognizing] = React.useState(false);
  const [recognizeMessage, setRecognizeMessage] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addMessage, setAddMessage] = React.useState('');
  const currentPageUrlRef = React.useRef('');
  const requestedNavigationRef = React.useRef('');
  const recognizeAbortRef = React.useRef<AbortController | null>(null);
  const importAbortRef = React.useRef<AbortController | null>(null);
  const manualRecognizeRef = React.useRef('');
  const recognizeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const recognizeFallbackTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  React.useEffect(
    () => () => {
      if (recognizeTimerRef.current) clearTimeout(recognizeTimerRef.current);
      if (recognizeFallbackTimerRef.current)
        clearTimeout(recognizeFallbackTimerRef.current);
      recognizeAbortRef.current?.abort();
      importAbortRef.current?.abort();
      manualRecognizeRef.current = '';
      currentPageUrlRef.current = '';
    },
    [],
  );

  React.useEffect(() => {
    let active = true;
    // 最近访问只用于入口列表，不自动恢复上次网页，也不能迟到覆盖用户的新地址。
    loadBrowserHistory()
      .then(items => {
        if (active) setHistory(items);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistoryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const resetRecognition = React.useCallback(() => {
    // 页面切换后，旧 DOM/隐藏抓取的结果与重试计时器都失效，不能覆盖新书或首页。
    manualRecognizeRef.current = '';
    recognizeAbortRef.current?.abort();
    recognizeAbortRef.current = null;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setAdding(false);
    if (recognizeTimerRef.current) clearTimeout(recognizeTimerRef.current);
    if (recognizeFallbackTimerRef.current)
      clearTimeout(recognizeFallbackTimerRef.current);
    recognizeTimerRef.current = null;
    recognizeFallbackTimerRef.current = null;
    setRecognized(null);
    setRecognizing(false);
    setRecognizeMessage('');
    setAddMessage('');
  }, []);

  React.useEffect(() => {
    // 普通入口显示站点选择；详情/搜索传入具体链接时才直接打开该页。
    const initialUrl = route.params?.initialUrl ?? null;
    resetRecognition();
    webRef.current?.stopLoading();
    requestedNavigationRef.current = '';
    currentPageUrlRef.current = initialUrl ?? '';
    setUrl(initialUrl);
    setInput(initialUrl ?? '');
    setLoading(false);
    setCanGoBack(false);
    setHistoryExpanded(false);
  }, [route.params?.initialUrl, resetRecognition]);

  const openUrl = React.useCallback(
    (next: string) => {
      if (!next) return;
      Keyboard.dismiss();
      resetRecognition();
      webRef.current?.stopLoading();
      // 只授权用户提交的目标页，站点广告不能继承这次跨站许可。
      requestedNavigationRef.current = next;
      currentPageUrlRef.current = next;
      setInput(next);
      setUrl(next);
    },
    [resetRecognition],
  );

  const rememberUrl = React.useCallback((next: string) => {
    setHistory(current => {
      const updated = addBrowserHistory(current, next);
      saveBrowserHistory(updated).catch(() => {});
      return updated;
    });
  }, []);

  const go = () => {
    const next = inputToUrl(input);
    if (next) {
      // 用户在地址栏主动输入的网址可跨站；其余跨站跳转由广告防护规则决定。
      openUrl(next);
    }
  };

  const showHistory = () => {
    // 返回入口保留最近访问数据，但收起长列表；旧网页任务不能继续污染入口状态。
    resetRecognition();
    webRef.current?.stopLoading();
    setLoading(false);
    requestedNavigationRef.current = '';
    currentPageUrlRef.current = '';
    setUrl(null);
    setInput('');
    setHistoryExpanded(false);
    setCanGoBack(false);
    setRecognized(null);
  };

  const handleRecognizeData = (data: any) => {
    if (data?.type !== RECOGNIZE_MESSAGE) return;
    // 切站时 WebView 仍可能显示上一页，不能把旧页面目录挂到新网址下。
    if (
      data.url &&
      !isRequestedBrowserNavigation(currentPageUrlRef.current, data.url)
    )
      return;
    const isManual =
      !!data.requestId && data.requestId === manualRecognizeRef.current;
    if (isManual && recognizeTimerRef.current) {
      clearTimeout(recognizeTimerRef.current);
      recognizeTimerRef.current = null;
    }
    if (isManual && recognizeFallbackTimerRef.current) {
      clearTimeout(recognizeFallbackTimerRef.current);
      recognizeFallbackTimerRef.current = null;
    }
    if (isManual) setRecognizing(false);
    if (data.ok && data.isDetail && Array.isArray(data.chapters)) {
      setRecognized(data as RecognizedBook);
      if (isManual)
        setRecognizeMessage(`已识别到 ${data.chapters.length} 项目录`);
    } else {
      setRecognized(null);
      if (isManual) {
        setRecognizeMessage(
          '未识别到书籍目录，请打开书籍详情页或章节列表页后重试',
        );
      }
    }
    if (isManual) manualRecognizeRef.current = '';
  };

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      handleRecognizeData(data);
    } catch {
      // 非识别消息由 WebView 忽略。
    }
  };

  const recognizeCurrentPage = () => {
    if (!url || recognizing) return;
    resetRecognition();
    // source URL 保留最初首页以维持 WebView 历史；站内搜索后的识别必须使用实际当前页。
    const pageUrl = currentPageUrlRef.current || url;
    const controller = new AbortController();
    recognizeAbortRef.current = controller;
    const requestId = `manual-${Date.now()}`;
    manualRecognizeRef.current = requestId;
    setRecognized(null);
    setRecognizing(true);
    setRecognizeMessage('正在识别当前页面…');

    const readFromHiddenWebView = (targetUrl: string = pageUrl) => {
      if (manualRecognizeRef.current !== requestId) return;
      setRecognizeMessage(
        targetUrl === pageUrl ? '正在读取完整目录…' : '正在读取章节列表…',
      );
      // 可见页的 DOM 是首选；仅在站点阻断脚本回传时，再用常驻隐藏 WebView 兜底。
      // 两条链路共用同一解析器，避免出现“看得到章节、导入却读到广告页”的差异。
      fetchRenderedHtml(targetUrl, {
        signal: controller.signal,
        waitMs: 3500,
        timeout: 35000,
        priority: 'high',
      })
        .then(html => {
          if (manualRecognizeRef.current !== requestId) return;
          const parsed = recognizeBookHtml(html, targetUrl);
          setRecognizing(false);
          if (parsed.isDetail) {
            setRecognized(parsed);
            setRecognizeMessage(
              `已识别 ${parsed.chapters.length} 项目录 · ${
                parsed.pageUrls?.length ? parsed.pageUrls.length + 1 : 1
              } 页目录`,
            );
          } else {
            setRecognizeMessage(
              '页面已读取，但未找到足够章节链接；请打开章节列表页',
            );
          }
          manualRecognizeRef.current = '';
        })
        .catch(error => {
          if (manualRecognizeRef.current !== requestId) return;
          setRecognizing(false);
          setRecognizeMessage(
            error instanceof Error
              ? `目录读取失败：${error.message}`
              : '目录读取失败，请重试',
          );
          manualRecognizeRef.current = '';
        });
    };

    const recognitionTargetUrl = getRecognitionTargetUrl(pageUrl);
    if (recognitionTargetUrl !== pageUrl) {
      // 玄幻阁 info 页只有书籍资料，没有章节锚点。直接读取同书号目录，避免用户手动跳页。
      recognizeTimerRef.current = setTimeout(() => {
        if (manualRecognizeRef.current !== requestId) return;
        setRecognizing(false);
        setRecognizeMessage('识别超时：请刷新后在书籍详情页或章节列表页重试');
        manualRecognizeRef.current = '';
      }, 40000);
      readFromHiddenWebView(recognitionTargetUrl);
      return;
    }

    // 当前可见页面已经由用户亲自打开，优先注入并使用自定义 URL 回传，避免站点覆盖
    // ReactNativeWebView 消息对象后导致按钮没有反馈。若 4 秒没有回传才切隐藏页兜底。
    recognizeFallbackTimerRef.current = setTimeout(readFromHiddenWebView, 4000);
    recognizeTimerRef.current = setTimeout(() => {
      if (manualRecognizeRef.current !== requestId) return;
      setRecognizing(false);
      setRecognizeMessage('识别超时：请刷新后在书籍详情页或章节列表页重试');
      manualRecognizeRef.current = '';
    }, 40000);
    webRef.current?.injectJavaScript(
      `window.__nvlRecognizeRequestId=${JSON.stringify(requestId)};` +
        'window.__nvlRecognizeUseLocation=true;' +
        RECOGNIZER_JS,
    );
  };

  const onAdd = async () => {
    if (!recognized || importAbortRef.current || taskSignal.aborted) return;
    const controller = new AbortController();
    importAbortRef.current = controller;
    const cancel = () => controller.abort();
    taskSignal.addEventListener('abort', cancel);
    const addingPageUrl = currentPageUrlRef.current;
    const needsFullCatalog = !!resolveSource(recognized.url)
      ?.preferDirectImport;
    setAdding(true);
    setAddMessage(needsFullCatalog ? '正在获取完整目录…' : '正在整理目录…');
    try {
      // 已有专用适配器的站点直接完整校验；详情页的“最新 10 章”不能当整本目录。
      const expanded = needsFullCatalog
        ? recognized
        : await prepareRecognizedCatalog(
            recognized,
            pageUrl =>
              fetchRenderedHtml(pageUrl, {
                // 玄幻阁目录为静态 HTML；但连续翻 27 页时部分页会晚于首屏完成渲染，
                // 取 1.2 秒以提升长目录稳定性，同时避免 5 秒等待让整本导入过慢。
                // 其他站点仍沿用较长等待，避免把延迟渲染页面误判为空目录。
                waitMs: recognized.host === 'wap.xuanhuange.info' ? 1200 : 5000,
                timeout: 20000,
                priority: 'high',
                signal: controller.signal,
              }),
            (done, total, attempt = 1) =>
              !controller.signal.aborted &&
              setAddMessage(
                attempt > 1
                  ? `目录第 ${done + 1} 页重试 ${attempt}/3…`
                  : `正在加载目录 ${done}/${total}`,
              ),
            controller.signal,
          );
      const book = await addRecognized(expanded, controller.signal);
      // 入库可完成，但用户已离开或换站时不能迟到跳回旧书详情。
      if (
        controller.signal.aborted ||
        !isRequestedBrowserNavigation(addingPageUrl, currentPageUrlRef.current)
      )
        return;
      setRecognized(null);
      navigation.navigate('BookDetail', { bookId: book.id });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      setAddMessage(
        error instanceof Error ? error.message : '目录加载失败，请重试',
      );
    } finally {
      taskSignal.removeEventListener('abort', cancel);
      // 旧任务的 finally 不能解开新页正在进行的导入锁。
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
        setAdding(false);
      }
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      {/* 地址/搜索栏 */}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canGoBack ? '返回上一网页' : '返回上一页'}
          onPress={() =>
            canGoBack ? webRef.current?.goBack() : navigation.goBack()
          }
          style={styles.barBtn}
        >
          <Icon name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={[styles.field, { backgroundColor: theme.colors.surface }]}>
          <Icon name="search" size={15} color={theme.colors.textSecondary} />
          <TextInput
            accessibilityLabel="小说网址或搜索关键词"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={go}
            placeholder="输入网址或搜索小说"
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
            style={[styles.input, { color: theme.colors.text }]}
          />
        </View>
        {url ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="回到网站入口"
              onPress={showHistory}
              style={styles.barBtn}
            >
              <Icon name="home" size={21} color={theme.colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="刷新网页"
              onPress={() => webRef.current?.reload()}
              style={styles.barBtn}
            >
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel="网页加载中"
                  size="small"
                  color={theme.colors.primary}
                />
              ) : (
                <Icon name="refresh" size={21} color={theme.colors.text} />
              )}
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开网址或搜索小说"
            accessibilityState={{ disabled: !input.trim() }}
            disabled={!input.trim()}
            onPress={go}
            style={[
              styles.entryGo,
              {
                backgroundColor: theme.colors.primary,
                opacity: input.trim() ? 1 : 0.45,
              },
            ]}
          >
            <Text style={styles.entryGoText}>打开</Text>
          </Pressable>
        )}
      </View>

      {!historyReady ? (
        <View style={styles.startLoading}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : !url ? (
        <ScrollView
          style={styles.startPage}
          contentContainerStyle={styles.startPageContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.startCard}>
            <Text style={[styles.startTitle, { color: theme.colors.text }]}>
              网站导入
            </Text>
            <Text
              style={[styles.startHint, { color: theme.colors.textSecondary }]}
            >
              打开小说目录 → 识别书籍 → 加入书架
            </Text>
          </View>
          <View style={styles.siteSection}>
            <Text style={[styles.historyTitle, { color: theme.colors.text }]}>
              常用小说站
            </Text>
            <View style={styles.siteGrid}>
              {SITE_ENTRIES.filter(site => site.supported).map(site => (
                <Pressable
                  key={site.url}
                  accessibilityRole="button"
                  accessibilityLabel={`打开${site.name}`}
                  accessibilityHint="浏览书籍目录后识别导入"
                  onPress={() => openUrl(site.url)}
                  style={[
                    styles.siteTile,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.siteTileHeading}>
                    <Icon
                      name="auto-stories"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text
                      style={[styles.siteName, { color: theme.colors.text }]}
                    >
                      {site.name}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.siteDesc,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {site.desc}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {SITE_ENTRIES.filter(site => !site.supported).map(site => (
            <Pressable
              key={site.url}
              accessibilityRole="button"
              accessibilityLabel="用搜索引擎找书"
              onPress={() => openUrl(site.url)}
              style={[
                styles.siteRow,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Icon name="search" size={21} color={theme.colors.primary} />
              <View style={styles.siteInfo}>
                <Text
                  style={[styles.searchSiteName, { color: theme.colors.text }]}
                >
                  {site.name}
                </Text>
                <Text
                  style={[
                    styles.siteDesc,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  没找到站点？用必应搜索小说目录
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={18}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          ))}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: theme.colors.text }]}>
                最近访问
              </Text>
              {(historyExpanded ? history : history.slice(0, 3)).map(item => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`打开最近访问 ${item}`}
                  onPress={() => openUrl(item)}
                  style={[
                    styles.historyRow,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Icon
                    name="history"
                    size={17}
                    color={theme.colors.textSecondary}
                  />
                  <View style={styles.siteInfo}>
                    <Text
                      style={[
                        styles.historySiteName,
                        { color: theme.colors.text },
                      ]}
                    >
                      {resolveSource(item)?.name ??
                        displayUrl(item).split('/')[0]}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.historyText,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {displayUrl(item)}
                    </Text>
                  </View>
                  <Icon
                    name="chevron-right"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              ))}
              {history.length > 3 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    historyExpanded ? '收起最近访问' : '展开全部最近访问'
                  }
                  accessibilityState={{ expanded: historyExpanded }}
                  onPress={() => setHistoryExpanded(value => !value)}
                  style={styles.historyToggle}
                >
                  <Text
                    style={[
                      styles.historyToggleText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {historyExpanded
                      ? '收起最近访问'
                      : `查看全部 ${history.length} 条访问记录`}
                  </Text>
                  <Icon
                    name={historyExpanded ? 'expand-less' : 'expand-more'}
                    size={20}
                    color={theme.colors.primary}
                  />
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: url }}
          onMessage={onMessage}
          onLoadStart={() => {
            setLoading(true);
            resetRecognition();
          }}
          onLoadEnd={() => {
            setLoading(false);
            webRef.current?.injectJavaScript(PAGE_SANITIZER_JS);
            // 页面就绪后跑识别器；SPA/延迟渲染再补一次。
            webRef.current?.injectJavaScript(RECOGNIZER_JS);
            setTimeout(() => {
              webRef.current?.injectJavaScript(PAGE_SANITIZER_JS);
              webRef.current?.injectJavaScript(RECOGNIZER_JS);
            }, 1200);
          }}
          onNavigationStateChange={(nav: {
            url: string;
            canGoBack: boolean;
          }) => {
            setInput(nav.url);
            setCanGoBack(nav.canGoBack);
            currentPageUrlRef.current = nav.url;
            rememberUrl(nav.url);
          }}
          onShouldStartLoadWithRequest={(request: { url?: string }) => {
            const nextUrl = request.url || '';
            if (nextUrl.startsWith(RECOGNIZE_CALLBACK_PREFIX)) {
              try {
                const encoded = nextUrl.slice(RECOGNIZE_CALLBACK_PREFIX.length);
                handleRecognizeData(JSON.parse(decodeURIComponent(encoded)));
              } catch {
                setRecognizing(false);
                setRecognizeMessage('目录回传数据损坏，请刷新页面后重试');
              }
              return false;
            }
            if (
              isRequestedBrowserNavigation(
                requestedNavigationRef.current,
                nextUrl,
              )
            ) {
              requestedNavigationRef.current = '';
              return true;
            }
            // 同站首页、搜索、目录与章节均可浏览，拦截站点脚本发起的跨站广告。
            return !shouldBlockAdNavigation(currentPageUrlRef.current, nextUrl);
          }}
          onError={(event: {
            nativeEvent: { description?: string; url?: string };
          }) => {
            if (
              event.nativeEvent.url &&
              !isRequestedBrowserNavigation(
                currentPageUrlRef.current,
                event.nativeEvent.url,
              )
            )
              return;
            resetRecognition();
            setLoading(false);
            setRecognizeMessage(
              `网页加载失败：${
                event.nativeEvent.description || '请刷新或选择其他网站'
              }`,
            );
          }}
          onHttpError={(event: {
            nativeEvent: { statusCode?: number; url?: string };
          }) => {
            // 广告子资源或上一页的错误不能清掉当前书的识别结果。
            if (
              event.nativeEvent.url &&
              !isRequestedBrowserNavigation(
                currentPageUrlRef.current,
                event.nativeEvent.url,
              )
            )
              return;
            resetRecognition();
            setLoading(false);
            setRecognizeMessage(
              `网站返回错误 ${
                event.nativeEvent.statusCode || ''
              }，请刷新或选择其他网站`,
            );
          }}
          injectedJavaScript={PAGE_SANITIZER_JS + RECOGNIZER_JS}
          injectedJavaScriptBeforeContentLoaded={PAGE_SANITIZER_JS}
          originWhitelist={['*']}
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically={false}
          onOpenWindow={() => {
            // 正常链接由净化脚本改为当前页；剩余新窗口均不交给外部浏览器。
          }}
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          style={{ flex: 1 }}
        />
      )}

      {/* 手动识别按钮（自动没认出来时兜底） */}
      {!recognized && !!url && (
        <View style={[styles.recognizeArea, { bottom: insets.bottom + 20 }]}>
          {!!recognizeMessage && (
            <View
              style={[
                styles.recognizeHint,
                {
                  backgroundColor: recognizing
                    ? theme.colors.primary
                    : theme.colors.danger,
                },
              ]}
            >
              <View style={styles.recognizeBadge}>
                {recognizing ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <Icon
                    name="error-outline"
                    size={20}
                    color={theme.colors.danger}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recognizeLabel}>
                  {recognizing ? '智能目录识别中' : '目录识别未完成'}
                </Text>
                <Text style={styles.recognizeMessage}>{recognizeMessage}</Text>
              </View>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recognizing ? '正在识别本页目录' : '识别本页目录'
            }
            accessibilityState={{ disabled: recognizing, busy: recognizing }}
            onPress={recognizeCurrentPage}
            disabled={recognizing}
            style={[
              styles.fab,
              { backgroundColor: theme.colors.primary },
              recognizing && { opacity: 0.75 },
            ]}
          >
            {recognizing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="menu-book" size={20} color="#fff" />
            )}
            <View>
              <Text style={styles.fabText}>
                {recognizing ? '正在扫描目录…' : '识别本页目录'}
              </Text>
              {!recognizing && (
                <Text style={styles.fabSubText}>智能提取章节与分页</Text>
              )}
            </View>
          </Pressable>
        </View>
      )}

      {/* 识别结果横幅 */}
      {recognized && (
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + 14,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.sheetInfo}>
            <BookCover
              id={recognized.url}
              uri={recognized.cover}
              title={recognized.title || '未命名书籍'}
              author={recognized.author}
              compact
              style={styles.cover}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 23,
                  fontWeight: '600',
                  color: theme.colors.text,
                }}
              >
                {recognized.title || '未命名书籍'}
              </Text>
              {/* 当前页只代表已识别的条目；完整目录在入库前合并校验，不能称为整本书总章数。 */}
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: theme.colors.textSecondary,
                  marginTop: 3,
                }}
              >
                {(recognized.author || '佚名') +
                  (resolveSource(recognized.url)?.preferDirectImport
                    ? ' · 导入时校验完整目录'
                    : ' · 已识别 ' + recognized.chapters.length + ' 项目录') +
                  (recognized.pageUrls?.length
                    ? ` · ${recognized.pageUrls.length + 1} 页目录`
                    : '')}
              </Text>
              {metadataLoading && (
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.colors.textSecondary,
                    marginTop: 3,
                  }}
                >
                  正在补全书籍资料…
                </Text>
              )}
              {!metadataLoading &&
                !recognized.cover &&
                recognized.metadataIssues?.includes('placeholder-cover') && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.colors.textSecondary,
                      marginTop: 3,
                    }}
                  >
                    本站未提供原封面，暂用默认封面
                  </Text>
                )}
              {!!addMessage && (
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 11,
                    color: adding
                      ? theme.colors.textSecondary
                      : theme.colors.danger,
                    marginTop: 3,
                  }}
                >
                  {addMessage}
                </Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭书籍识别预览"
              accessibilityState={{ disabled: adding }}
              disabled={adding}
              onPress={() => setRecognized(null)}
              style={styles.sheetGhost}
            >
              <Icon name="close" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="加入书架"
            accessibilityState={{ disabled: adding, busy: adding }}
            onPress={onAdd}
            disabled={adding}
            style={[
              styles.sheetAdd,
              { backgroundColor: theme.colors.primary },
              adding && styles.sheetAddBusy,
            ]}
          >
            <Text style={styles.sheetAddText}>
              {adding ? '导入中…' : '加入书架'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  barBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
  },
  input: { flex: 1, fontSize: 13.5, padding: 0 },
  startLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startPage: { flex: 1 },
  startPageContent: { padding: 20, paddingTop: 18, paddingBottom: 36 },
  entryGo: {
    minWidth: 54,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryGoText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  startCard: { paddingBottom: 20 },
  startTitle: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  startHint: { fontSize: 12.5, lineHeight: 20, marginTop: 5 },
  siteSection: { marginBottom: 16 },
  siteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  siteTile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 90,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  siteTileHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  siteRow: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 11,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  siteInfo: { flex: 1, minWidth: 0 },
  siteName: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  searchSiteName: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  siteDesc: { fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  historySection: { marginTop: 20 },
  historyTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  historyRow: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  historySiteName: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  historyText: { fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  historyToggleText: { fontSize: 13, lineHeight: 20 },
  historyToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  // 识别是本页的主行动，按钮撑满可用宽度而不是缩在右下角，避免在整页网页内容里被淹没。
  recognizeArea: {
    alignItems: 'stretch',
    position: 'absolute',
    right: 18,
    left: 18,
  },
  recognizeHint: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    elevation: 7,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  recognizeBadge: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  recognizeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  recognizeMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    lineHeight: 16,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  fabSubText: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, marginTop: 2 },
  // 书籍信息与“加入书架”分成两行：主按钮独占一行才够显眼，
  // 书名和章节数也不再被右侧按钮挤到只剩一小条。
  sheet: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  sheetInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 44, borderRadius: 4 },
  sheetGhost: {
    minWidth: 44,
    minHeight: 44,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAdd: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  sheetAddBusy: { opacity: 0.75 },
  sheetAddText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
});
