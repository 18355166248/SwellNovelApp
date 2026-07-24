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
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components';
import { useAddRecognizedBook } from '../store';
import {
  RECOGNIZER_JS,
  RECOGNIZE_MESSAGE,
  expandRecognizedCatalog,
  inputToUrl,
  RecognizedBook,
} from '../services/recognize/recognizer';
import { fetchRenderedHtml } from '../services/browserFetch/bridge';

// react-native-webview 的 class 组件类型与 React 19 的 JSX 类型不完全兼容，
// 以 any 组件形式渲染，绕过构造签名不匹配（不影响运行时）。
const WebView = RNWebView as unknown as React.ComponentType<any>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const HOME_URL = 'https://www.bing.com/';

export default function InAppBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const addRecognized = useAddRecognizedBook();

  const webRef = React.useRef<any>(null);
  const [url, setUrl] = React.useState(HOME_URL);
  const [input, setInput] = React.useState(HOME_URL);
  const [loading, setLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [recognized, setRecognized] = React.useState<RecognizedBook | null>(
    null,
  );
  const [adding, setAdding] = React.useState(false);
  const [addMessage, setAddMessage] = React.useState('');

  const go = () => {
    const next = inputToUrl(input);
    if (next) setUrl(next);
  };

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let data: any;
    try {
      data = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (data?.type !== RECOGNIZE_MESSAGE) return;
    if (data.ok && data.isDetail && Array.isArray(data.chapters)) {
      setRecognized(data as RecognizedBook);
    } else {
      setRecognized(null);
    }
  };

  const onAdd = async () => {
    if (!recognized || adding) return;
    setAdding(true);
    setAddMessage('正在整理目录…');
    try {
      const expanded = await expandRecognizedCatalog(
        recognized,
        url =>
          fetchRenderedHtml(url, {
            // 分页目录通常是静态 HTML；缩短等待以免 20 多页目录需要数分钟。
            waitMs: 1800,
            timeout: 20000,
            priority: 'high',
          }),
        (done, total) => setAddMessage(`正在加载目录 ${done}/${total}`),
      );
      const book = await addRecognized(expanded);
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
        <Pressable onPress={() => webRef.current?.reload()} style={styles.barBtn}>
          <Icon name="refresh" size={19} color={theme.colors.text} />
        </Pressable>
      </View>

      {loading && (
        <View style={styles.progressLine}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={onMessage}
        onLoadStart={() => {
          setLoading(true);
          setRecognized(null);
        }}
        onLoadEnd={() => {
          setLoading(false);
          // 页面就绪后跑识别器；SPA/延迟渲染再补一次。
          webRef.current?.injectJavaScript(RECOGNIZER_JS);
          setTimeout(() => webRef.current?.injectJavaScript(RECOGNIZER_JS), 1200);
        }}
        onNavigationStateChange={(nav: { url: string; canGoBack: boolean }) => {
          setInput(nav.url);
          setCanGoBack(nav.canGoBack);
        }}
        injectedJavaScript={RECOGNIZER_JS}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        style={{ flex: 1 }}
      />

      {/* 手动识别按钮（自动没认出来时兜底） */}
      {!recognized && (
        <Pressable
          onPress={() => webRef.current?.injectJavaScript(RECOGNIZER_JS)}
          style={[
            styles.fab,
            { backgroundColor: theme.colors.primary, bottom: insets.bottom + 20 },
          ]}
        >
          <Icon name="menu-book" size={16} color="#fff" />
          <Text style={styles.fabText}>识别本页</Text>
        </Pressable>
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
          {recognized.cover ? (
            <Image source={{ uri: recognized.cover }} style={styles.cover} />
          ) : (
            <View
              style={[styles.cover, { backgroundColor: theme.colors.background }]}
            />
          )}
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
                ' · 共 ' +
                recognized.chapters.length +
                ' 章' +
                (recognized.pageUrls?.length
                  ? ` · ${recognized.pageUrls.length + 1} 页目录`
                  : '')}
            </Text>
            {!!addMessage && (
              <Text
                numberOfLines={2}
                style={{ fontSize: 11, color: adding ? theme.colors.textSecondary : theme.colors.danger, marginTop: 3 }}
              >
                {addMessage}
              </Text>
            )}
          </View>
          <Pressable onPress={() => setRecognized(null)} style={styles.sheetGhost}>
            <Icon name="close" size={18} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={onAdd}
            disabled={adding}
            style={[styles.sheetAdd, { backgroundColor: theme.colors.primary }]}
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
  progressLine: { height: 2, justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  sheet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  cover: { width: 40, height: 54, borderRadius: 4 },
  sheetGhost: { padding: 6 },
  sheetAdd: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  sheetAddText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
