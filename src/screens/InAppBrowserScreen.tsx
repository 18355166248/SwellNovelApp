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
} from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { Icon, BookCover } from '../components';
import { useAddRecognizedBook } from '../store';
import {
  RECOGNIZER_JS,
  RECOGNIZE_MESSAGE,
  expandRecognizedCatalog,
  inputToUrl,
  recognizeBookHtml,
  RecognizedBook,
} from '../services/recognize/recognizer';
import { fetchRenderedHtml } from '../services/browserFetch/bridge';
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
      desc: `${shown} · 支持识别目录一键导入`,
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
  const [historyReady, setHistoryReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [recognized, setRecognized] = React.useState<RecognizedBook | null>(
    null,
  );
  const [recognizing, setRecognizing] = React.useState(false);
  const [recognizeMessage, setRecognizeMessage] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addMessage, setAddMessage] = React.useState('');
  const currentPageUrlRef = React.useRef('');
  const requestedNavigationRef = React.useRef('');
  const recognizeAbortRef = React.useRef<AbortController | null>(null);
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
      manualRecognizeRef.current = '';
      currentPageUrlRef.current = '';
    },
    [],
  );

  React.useEffect(() => {
    loadBrowserHistory()
      .then(items => {
        setHistory(items);
        const initialUrl = route.params?.initialUrl;
        // 从“搜书”页粘贴链接进入时，链接优先于最近历史，避免用户又被带回上次网页。
        if (initialUrl) {
          setUrl(initialUrl);
          setInput(initialUrl);
          currentPageUrlRef.current = initialUrl;
          return;
        }
        // 有历史时直接恢复最近书页；无历史则展示起始页，不再强制加载 Bing。
        if (items[0]) {
          setUrl(items[0]);
          setInput(items[0]);
          currentPageUrlRef.current = items[0];
        }
      })
      .finally(() => setHistoryReady(true));
  }, [route.params?.initialUrl]);

  const resetRecognition = React.useCallback(() => {
    // 页面切换后，旧 DOM/隐藏抓取的结果与重试计时器都失效，不能覆盖新书或首页。
    manualRecognizeRef.current = '';
    recognizeAbortRef.current?.abort();
    recognizeAbortRef.current = null;
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

  const openUrl = React.useCallback(
    (next: string) => {
      if (!next) return;
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
    // 返回起始页时保留 WebView 历史记录，用户可一键回到任意最近访问的网站。
    resetRecognition();
    webRef.current?.stopLoading();
    setLoading(false);
    requestedNavigationRef.current = '';
    currentPageUrlRef.current = '';
    setUrl(null);
    setInput('');
    setCanGoBack(false);
    setRecognized(null);
  };

  const handleRecognizeData = (data: any) => {
    if (data?.type !== RECOGNIZE_MESSAGE) return;
    // 切站时 WebView 仍可能显示上一页，不能把旧页面目录挂到新网址下。
    if (
      data.ok &&
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
        setRecognizeMessage(`已识别到 ${data.chapters.length} 章目录`);
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
              `已识别 ${parsed.chapters.length} 章 · ${
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
    if (!recognized || adding) return;
    const addingPageUrl = currentPageUrlRef.current;
    const needsFullCatalog = !!resolveSource(recognized.url)
      ?.preferDirectImport;
    setAdding(true);
    setAddMessage(needsFullCatalog ? '正在获取完整目录…' : '正在整理目录…');
    try {
      // 已有专用适配器的站点直接完整校验；详情页的“最新 10 章”不能当整本目录。
      const expanded = needsFullCatalog
        ? recognized
        : await expandRecognizedCatalog(
            recognized,
            url =>
              fetchRenderedHtml(url, {
                waitMs: 5000,
                timeout: 20000,
                priority: 'high',
              }),
            (done, total, attempt = 1) =>
              setAddMessage(
                attempt > 1
                  ? `目录第 ${done + 1} 页重试 ${attempt}/3…`
                  : `正在加载目录 ${done}/${total}`,
              ),
          );
      const book = await addRecognized(expanded);
      // 入库可完成，但用户已离开或换站时不能迟到跳回旧书详情。
      if (
        !isRequestedBrowserNavigation(addingPageUrl, currentPageUrlRef.current)
      )
        return;
      setRecognized(null);
      navigation.navigate('BookDetail', { bookId: book.id });
    } catch (error) {
      setAddMessage(
        error instanceof Error ? error.message : '目录加载失败，请重试',
      );
    } finally {
      setAdding(false);
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
        <Pressable onPress={showHistory} style={styles.barBtn}>
          <Icon name="history" size={19} color={theme.colors.text} />
        </Pressable>
        <Pressable
          disabled={!url}
          onPress={() => webRef.current?.reload()}
          style={[styles.barBtn, !url && { opacity: 0.35 }]}
        >
          {/* 加载提示使用工具栏的固定尺寸，避免从 2px 容器溢出后被原生网页盖住。 */}
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="网页加载中"
              size="small"
              color={theme.colors.primary}
            />
          ) : (
            <Icon name="refresh" size={19} color={theme.colors.text} />
          )}
        </Pressable>
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
        >
          <View
            style={[
              styles.startCard,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <Icon name="menu-book" size={27} color={theme.colors.primary} />
            <Text style={[styles.startTitle, { color: theme.colors.text }]}>
              从书籍目录页开始
            </Text>
            <Text
              style={[styles.startHint, { color: theme.colors.textSecondary }]}
            >
              选一个站点开始浏览，也可以在上方直接输入网址
            </Text>
          </View>

          <View style={styles.siteSection}>
            <Text style={[styles.historyTitle, { color: theme.colors.text }]}>
              常用站点
            </Text>
            {SITE_ENTRIES.map(site => (
              <Pressable
                key={site.url}
                onPress={() => openUrl(site.url)}
                style={[
                  styles.siteRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.siteBadge,
                    { backgroundColor: theme.colors.background },
                  ]}
                >
                  <Icon
                    name={site.supported ? 'auto-stories' : 'search'}
                    size={17}
                    color={
                      site.supported
                        ? theme.colors.primary
                        : theme.colors.textSecondary
                    }
                  />
                </View>
                <View style={styles.siteInfo}>
                  <Text
                    numberOfLines={1}
                    style={[styles.siteName, { color: theme.colors.text }]}
                  >
                    {site.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.siteDesc,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {site.desc}
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
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: theme.colors.text }]}>
                最近访问
              </Text>
              {history.map(item => (
                <Pressable
                  key={item}
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
                  <Text
                    numberOfLines={1}
                    style={[styles.historyText, { color: theme.colors.text }]}
                  >
                    {displayUrl(item)}
                  </Text>
                  <Icon
                    name="chevron-right"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              ))}
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
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: theme.colors.text,
                }}
              >
                {recognized.title || '未命名书籍'}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: 3,
                }}
              >
                {(recognized.author || '佚名') +
                  (resolveSource(recognized.url)?.preferDirectImport
                    ? ' · 导入时校验完整目录'
                    : ' · 共 ' + recognized.chapters.length + ' 章') +
                  (recognized.pageUrls?.length
                    ? ` · ${recognized.pageUrls.length + 1} 页目录`
                    : '')}
              </Text>
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
              onPress={() => setRecognized(null)}
              style={styles.sheetGhost}
            >
              <Icon name="close" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable
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
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
  },
  input: { flex: 1, fontSize: 13.5, padding: 0 },
  startLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startPage: { flex: 1 },
  startPageContent: { padding: 20, paddingBottom: 36 },
  startCard: {
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  startTitle: { fontSize: 17, fontWeight: '700', marginTop: 11 },
  startHint: { fontSize: 13, marginTop: 7, textAlign: 'center' },
  siteSection: { marginTop: 22 },
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
  siteBadge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  siteInfo: { flex: 1, minWidth: 0 },
  siteName: { fontSize: 13.5, fontWeight: '600' },
  siteDesc: { fontSize: 11, marginTop: 3 },
  historySection: { marginTop: 26 },
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
  historyText: { flex: 1, fontSize: 13 },
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
  sheetGhost: { padding: 6 },
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
