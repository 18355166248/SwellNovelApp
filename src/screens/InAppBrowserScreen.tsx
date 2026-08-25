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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
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
  getRecognitionTargetUrl,
  inputToUrl,
  recognizeBookHtml,
  RecognizedBook,
} from '../services/recognize/recognizer';
import { fetchRenderedHtml } from '../services/browserFetch/bridge';
import { shouldBlockAdNavigation } from '../services/browserFetch/navigationGuard';
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

const START_URL = 'http://wap.xuanhuange.info/';
const RECOGNIZE_CALLBACK_PREFIX = 'nvl-recognize://result?data=';

// 站点的广告脚本会让页面长时间处于 loading，不能等 onLoadEnd 才屏蔽。
// 该脚本通过 injectedJavaScriptBeforeContentLoaded 在 DOM 创建时注册监听，节点刚插入就移除。
const EARLY_XUAN_AD_BLOCKER_JS = `(function(){
  if (window.__nvlEarlyAdBlockerInstalled) return true;
  window.__nvlEarlyAdBlockerInstalled = true;
  var selector='h5[id^="swipercontainer"],h5[id^="gsagewad"],h5[id^="diantan"],h5[id^="alabelbox"],h5[id^="ababoxjia"],h5[id^="anshua"],iframe[id^="iframeid"]';
  function removeAds(root){
    if (!/xuanhuange\\.info$/i.test(location.hostname)) return;
    var nodes=[];
    try {
      if (root && root.matches && root.matches(selector)) nodes.push(root);
      if (root && root.querySelectorAll) nodes=nodes.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
    } catch(ignore) {}
    for (var i=0;i<nodes.length;i++) if(nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
  }
  var style=document.createElement('style');
  style.textContent=selector+'{display:none !important;visibility:hidden !important;height:0 !important;min-height:0 !important;max-height:0 !important;margin:0 !important;padding:0 !important;}';
  (document.head||document.documentElement).appendChild(style);
  removeAds(document);
  try { new MutationObserver(function(records){
    for(var i=0;i<records.length;i++) for(var j=0;j<records[i].addedNodes.length;j++) removeAds(records[i].addedNodes[j]);
  }).observe(document.documentElement,{childList:true,subtree:true}); } catch(ignore) {}
  return true;
})(); true;`;

// 内置浏览器只做页面“视觉净化”，不改写目录链接/正文 DOM，避免影响识别和阅读。
// 部分小说站会在首屏或延迟插入黄色横幅，故同时监听后续新增节点。
const AD_BLOCKER_JS = `(function(){
  if (window.__nvlAdBlockerInstalled) return true;
  window.__nvlAdBlockerInstalled = true;
  var selectors = [
    '#ad','#ads','#adbox','#ad-container','#ad_container',
    '.ad','.ads','.adbox','.ad-box','.ad-container','.advert','.advertisement','.adsbygoogle',
    '[id^="ad_"]','[id^="ads_"]','[id*="-ad-"]','[id*="_ad_"]',
    '[class^="ad_"]','[class^="ads_"]','[class*="-ad-"]','[class*="_ad_"]',
    'ins.adsbygoogle','[data-ad-client]','[data-ad-slot]',
    'iframe[src*="doubleclick"]','iframe[src*="googleads"]','iframe[src*="adservice"]','iframe[src*="union"]'
  ].join(',');
  var style = document.createElement('style');
  style.id = '__nvl_ad_style';
  style.textContent = selectors + '{display:none !important;visibility:hidden !important;height:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;}';
  (document.head || document.documentElement).appendChild(style);
  if (/xuanhuange\\.info$/i.test(location.hostname)) {
    var xuanStyle = document.createElement('style');
    // 真机抓到的广告由站点脚本以 h5#swipercontainer数字 固定层注入，内部 iframe 只是
    // 展示载体；同时清掉它预留的 h5#gsagewad数字 120px 高度，目录从站点头部开始排版。
    xuanStyle.textContent = [
      'h5[id^="swipercontainer"],h5[id^="gsagewad"],h5[id^="diantan"],',
      'h5[id^="alabelbox"],h5[id^="ababoxjia"],h5[id^="anshua"],iframe[id^="iframeid"]',
      '{display:none !important;visibility:hidden !important;position:absolute !important;',
      'height:0 !important;min-height:0 !important;max-height:0 !important;margin:0 !important;padding:0 !important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(xuanStyle);
  }
  function clean(root){
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll('iframe,ins,[data-ad-client],[data-ad-slot]');
    for (var i=0;i<nodes.length;i++) {
      var n = nodes[i], src = (n.getAttribute('src') || '').toLowerCase();
      if (n.tagName === 'INS' || n.hasAttribute('data-ad-client') || n.hasAttribute('data-ad-slot') || /doubleclick|googleads|adservice|\\/ad[/?._-]|union/.test(src)) {
        n.style.setProperty('display','none','important');
      }
    }
    // 这类站点常把黄色推广伪装成普通 a 标签，没有稳定的 class/id。目录页的章节
    // 链接始终同站，因此只收起“外站 + 短推广文案/黄色样式”的链接，不碰同站章节。
    var links = root.querySelectorAll('a[href]');
    for (var k=0;k<links.length;k++) {
      var link = links[k], href = link.href || '', label = (link.innerText || link.textContent || '').replace(/\\s+/g,' ').trim();
      var external = false;
      try { external = !!href && new URL(href, location.href).host !== location.host; } catch(ignore) {}
      if (!external || !label || label.length > 70) continue;
      var style = window.getComputedStyle ? window.getComputedStyle(link) : null;
      var color = (style ? (style.color + ' ' + style.backgroundColor) : '').match(/rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/g) || [];
      var yellow = false;
      for (var c=0;c<color.length;c++) { var m=/\\d+/g, rgb=color[c].match(m); if(rgb && +rgb[0]>160 && +rgb[1]>130 && +rgb[2]<120) yellow=true; }
      var promo = /广告|下载|福利|赚钱|游戏|APP|app|点击|推荐|免费领取|最新地址/.test(label);
      if (!yellow && !promo) continue;
      var box = link.parentElement;
      if (box && (box.innerText || '').replace(/\\s+/g,' ').trim().length <= 120 && !/第\\s*[0-9零一二三四五六七八九十百千两]+\\s*[章节回卷]/.test(box.innerText || '')) {
        box.style.setProperty('display','none','important');
      } else {
        link.style.setProperty('display','none','important');
      }
    }
    // 玄幻阁把成人推广做成“无广告标记的整图外链”，只出现在目录标题之前。
    // 不能按 img 一刀切（封面也可能是图片），因此限定为：首屏大图 + 外站 a 链接。
    if (/xuanhuange\\.info$/i.test(location.hostname)) {
      var isCatalog = /\\/wapbook-\\d+\\/?$/i.test(location.pathname);
      // 真机 HTML 已确认这些随机数字后缀节点全部属于顶部广告及其占位/点击层。
      // 直接删除比仅覆写 display 更可靠，能抵抗广告脚本随后重设 inline style。
      var exactAdNodes = root.querySelectorAll(
        'h5[id^="swipercontainer"],h5[id^="gsagewad"],h5[id^="diantan"],' +
        'h5[id^="alabelbox"],h5[id^="ababoxjia"],h5[id^="anshua"],iframe[id^="iframeid"]',
      );
      for (var x=0;x<exactAdNodes.length;x++) {
        var exactAdNode = exactAdNodes[x];
        if (exactAdNode.parentNode) exactAdNode.parentNode.removeChild(exactAdNode);
      }
      // 截图中的成人横幅并非普通图片节点，而是站内地址承载的广告 frame；域名白名单
      // 无法区分。小说目录不依赖 frame 渲染，因此该站目录页直接禁用所有嵌入式载体。
      if (isCatalog) {
        var frames = root.querySelectorAll('iframe,object,embed');
        for (var f=0;f<frames.length;f++) frames[f].style.setProperty('display','none','important');
      }
      var images = root.querySelectorAll('img');
      for (var z=0;z<images.length;z++) {
        var image = images[z], rect = image.getBoundingClientRect ? image.getBoundingClientRect() : null;
        var anchor = image.closest ? image.closest('a[href]') : null;
        var outLink = false;
        try { outLink = !!anchor && new URL(anchor.href, location.href).host !== location.host; } catch(ignore) {}
        // 实测该站广告可能先落到本站跳转页，不一定是外域。目录页中，首屏的宽幅图
        // 不会是书籍封面，直接视为横幅；其它页面仍要求外链，防止误伤正常图片。
        var topBanner = !!rect && rect.top < Math.max(700, window.innerHeight) && rect.width >= Math.min(240, window.innerWidth * 0.55) && rect.height >= 70;
        if (!topBanner || (!outLink && !isCatalog)) continue;
        var target = anchor || image;
        // 横幅通常独占一行；优先隐藏链接，若父容器只有该广告则连空白一起收起。
        target.style.setProperty('display','none','important');
        var wrap = target.parentElement;
        if (wrap && (wrap.innerText || '').trim().length < 20 && wrap.querySelectorAll('a').length <= 1) {
          wrap.style.setProperty('display','none','important');
        }
      }
      // 有些横幅用 CSS background-image 而非 img。仅处理首屏、大尺寸、且不包含章节锚点的块。
      var blocks = root.querySelectorAll('div,section,a');
      for (var b=0;b<blocks.length;b++) {
        var block = blocks[b], br = block.getBoundingClientRect ? block.getBoundingClientRect() : null;
        if (!br || br.top >= Math.max(700, window.innerHeight) || br.width < Math.min(240, window.innerWidth * 0.55) || br.height < 70) continue;
        var bs = window.getComputedStyle ? window.getComputedStyle(block) : null;
        if (!bs || !bs.backgroundImage || bs.backgroundImage === 'none' || /第\\s*[0-9零一二三四五六七八九十百千两]+\\s*[章节回卷]/.test(block.innerText || '')) continue;
        block.style.setProperty('display','none','important');
      }
    }
  }
  clean(document);
  // 站点广告常在页面 load 后才替换图片 src；延迟复扫可避免只清到占位图。
  setTimeout(function(){ clean(document); }, 600);
  setTimeout(function(){ clean(document); }, 1600);
  setTimeout(function(){ clean(document); }, 3500);
  // 广告脚本可能在首轮图片 load 之后再替换 iframe；目录页前 30 秒持续净化即可。
  var repeat = 0;
  var cleaner = setInterval(function(){
    clean(document);
    repeat++;
    if (repeat >= 15) clearInterval(cleaner);
  }, 2000);
  try { new MutationObserver(function(){
    // 图片横幅常先插入空 img 再异步填 src；每次变更都扫整页，确保图片加载后也会被收起。
    clean(document);
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href','class']}); } catch(ignore) {}
  return true;
})(); true;`;

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
  const allowTypedNavigationRef = React.useRef(false);
  const manualRecognizeRef = React.useRef('');
  const recognizeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const recognizeFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(
    () => () => {
      if (recognizeTimerRef.current) clearTimeout(recognizeTimerRef.current);
      if (recognizeFallbackTimerRef.current) clearTimeout(recognizeFallbackTimerRef.current);
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

  const openUrl = React.useCallback((next: string) => {
    if (!next) return;
    allowTypedNavigationRef.current = true;
    setInput(next);
    setUrl(next);
  }, []);

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
    currentPageUrlRef.current = '';
    setUrl(null);
    setInput('');
    setCanGoBack(false);
    setRecognized(null);
  };

  const handleRecognizeData = (data: any) => {
    if (data?.type !== RECOGNIZE_MESSAGE) return;
    const isManual = !!data.requestId && data.requestId === manualRecognizeRef.current;
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
      if (isManual) setRecognizeMessage(`已识别到 ${data.chapters.length} 章目录`);
    } else {
      setRecognized(null);
      if (isManual) {
        setRecognizeMessage('未识别到书籍目录，请打开书籍详情页或章节列表页后重试');
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
    if (recognizeTimerRef.current) clearTimeout(recognizeTimerRef.current);
    if (recognizeFallbackTimerRef.current) clearTimeout(recognizeFallbackTimerRef.current);
    const requestId = `manual-${Date.now()}`;
    manualRecognizeRef.current = requestId;
    setRecognized(null);
    setRecognizing(true);
    setRecognizeMessage('正在识别当前页面…');

    const readFromHiddenWebView = (targetUrl: string = url) => {
      if (manualRecognizeRef.current !== requestId) return;
      setRecognizeMessage(targetUrl === url ? '正在读取完整目录…' : '正在读取章节列表…');
      // 可见页的 DOM 是首选；仅在站点阻断脚本回传时，再用常驻隐藏 WebView 兜底。
      // 两条链路共用同一解析器，避免出现“看得到章节、导入却读到广告页”的差异。
      fetchRenderedHtml(targetUrl, {
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
              `已识别 ${parsed.chapters.length} 章 · ${parsed.pageUrls?.length ? parsed.pageUrls.length + 1 : 1} 页目录`,
            );
          } else {
            setRecognizeMessage('页面已读取，但未找到足够章节链接；请打开章节列表页');
          }
          manualRecognizeRef.current = '';
        })
        .catch(error => {
          if (manualRecognizeRef.current !== requestId) return;
          setRecognizing(false);
          setRecognizeMessage(
            error instanceof Error ? `目录读取失败：${error.message}` : '目录读取失败，请重试',
          );
          manualRecognizeRef.current = '';
        });
    };

    const recognitionTargetUrl = getRecognitionTargetUrl(url);
    if (recognitionTargetUrl !== url) {
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
    if (!recognized || adding) return;
    setAdding(true);
    setAddMessage('正在整理目录…');
    try {
      const expanded = await expandRecognizedCatalog(
        recognized,
        url =>
          fetchRenderedHtml(url, {
            // 玄幻阁目录为静态 HTML；但连续翻 27 页时部分页会晚于首屏完成渲染，
            // 取 1.2 秒以提升长目录稳定性，同时避免 5 秒等待让整本导入过慢。
            // 其他站点仍沿用较长等待，避免把延迟渲染页面误判为空目录。
            waitMs: recognized.host === 'wap.xuanhuange.info' ? 1200 : 5000,
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
          onPress={() => (canGoBack ? webRef.current?.goBack() : navigation.goBack())}
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
          <Icon name="refresh" size={19} color={theme.colors.text} />
        </Pressable>
      </View>

      {loading && (
        <View style={styles.progressLine}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {!historyReady ? (
        <View style={styles.startLoading}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : !url ? (
        <View style={styles.startPage}>
          <View style={[styles.startCard, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
            <Icon name="menu-book" size={27} color={theme.colors.primary} />
            <Text style={[styles.startTitle, { color: theme.colors.text }]}>从书籍目录页开始</Text>
            <Text style={[styles.startHint, { color: theme.colors.textSecondary }]}>输入网址，或从最近访问继续浏览</Text>
            <Pressable
              onPress={() => openUrl(START_URL)}
              style={[styles.startPrimary, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.startPrimaryText}>打开玄幻阁</Text>
            </Pressable>
          </View>
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: theme.colors.text }]}>最近访问</Text>
              {history.map(item => (
                <Pressable
                  key={item}
                  onPress={() => openUrl(item)}
                  style={[styles.historyRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                >
                  <Icon name="history" size={17} color={theme.colors.textSecondary} />
                  <Text numberOfLines={1} style={[styles.historyText, { color: theme.colors.text }]}>{displayUrl(item)}</Text>
                  <Icon name="chevron-right" size={18} color={theme.colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : (
      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={onMessage}
        onLoadStart={() => {
          setLoading(true);
          setRecognized(null);
          setRecognizeMessage('');
          manualRecognizeRef.current = '';
        }}
        onLoadEnd={() => {
          setLoading(false);
          webRef.current?.injectJavaScript(AD_BLOCKER_JS);
          // 页面就绪后跑识别器；SPA/延迟渲染再补一次。
          webRef.current?.injectJavaScript(RECOGNIZER_JS);
          setTimeout(() => {
            webRef.current?.injectJavaScript(AD_BLOCKER_JS);
            webRef.current?.injectJavaScript(RECOGNIZER_JS);
          }, 1200);
        }}
        onNavigationStateChange={(nav: { url: string; canGoBack: boolean }) => {
          setInput(nav.url);
          setCanGoBack(nav.canGoBack);
          currentPageUrlRef.current = nav.url;
          allowTypedNavigationRef.current = false;
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
          if (allowTypedNavigationRef.current) return true;
          // 玄幻阁的目录/章节均在本站，跨域顶层跳转属于广告，直接留在当前页。
          return !shouldBlockAdNavigation(currentPageUrlRef.current, nextUrl);
        }}
        injectedJavaScript={AD_BLOCKER_JS + RECOGNIZER_JS}
        injectedJavaScriptBeforeContentLoaded={EARLY_XUAN_AD_BLOCKER_JS}
        originWhitelist={['*']}
        javaScriptEnabled
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
                  backgroundColor: recognizing ? theme.colors.primary : theme.colors.danger,
                },
              ]}
            >
              <View style={styles.recognizeBadge}>
                {recognizing ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon name="error-outline" size={20} color={theme.colors.danger} />
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
            style={[styles.fab, { backgroundColor: theme.colors.primary }, recognizing && { opacity: 0.75 }]}
          >
            {recognizing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="menu-book" size={20} color="#fff" />
            )}
            <View>
              <Text style={styles.fabText}>{recognizing ? '正在扫描目录…' : '识别本页目录'}</Text>
              {!recognizing && <Text style={styles.fabSubText}>智能提取章节与分页</Text>}
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
  progressLine: { height: 2, justifyContent: 'center' },
  startLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startPage: { flex: 1, padding: 20 },
  startCard: { alignItems: 'center', borderRadius: 18, paddingHorizontal: 24, paddingVertical: 28 },
  startTitle: { fontSize: 17, fontWeight: '700', marginTop: 11 },
  startHint: { fontSize: 13, marginTop: 7, textAlign: 'center' },
  startPrimary: { borderRadius: 20, marginTop: 18, paddingHorizontal: 20, paddingVertical: 10 },
  startPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  historySection: { marginTop: 26 },
  historyTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  historyRow: { alignItems: 'center', borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 10, marginBottom: 8, paddingHorizontal: 13, paddingVertical: 13 },
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
  recognizeArea: { alignItems: 'stretch', position: 'absolute', right: 18, left: 18 },
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
  recognizeBadge: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  recognizeLabel: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  recognizeMessage: { color: 'rgba(255,255,255,0.9)', fontSize: 11, lineHeight: 16 },
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
  cover: { width: 44, height: 59, borderRadius: 4 },
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
