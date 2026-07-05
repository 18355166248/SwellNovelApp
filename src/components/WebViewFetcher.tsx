/**
 * 常驻隐藏 WebView 取正文器（原生）。挂在 App 根部，0×0 不可见。
 *
 * 从 bridge 领取任务（章节 URL），导航到该页 → onLoadEnd 后稍等再注入抽正文脚本
 * → onMessage 回传纯文本 → resolve。一次只处理一个任务，串行防止相互干扰；WebView
 * 常驻以复用 cookie（cf_clearance 等），避免每章重新过 Cloudflare。
 *
 * Web 端由 WebViewFetcher.web.tsx 覆盖为 null。
 */
import React from 'react';
import { View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import {
  CONTENT_MESSAGE,
  extractorJs,
  registerBrowserFetcher,
  unregisterBrowserFetcher,
  FetchJob,
} from '../services/browserFetch/bridge';

// react-native-webview 的 class 组件类型与 React 19 JSX 类型不完全兼容，以 any 渲染。
const WebView = RNWebView as unknown as React.ComponentType<any>;

const BLANK = 'about:blank';

export function WebViewFetcher() {
  const ref = React.useRef<any>(null);
  const [job, setJob] = React.useState<FetchJob | null>(null);
  const jobRef = React.useRef<FetchJob | null>(null);
  jobRef.current = job;
  const queue = React.useRef<FetchJob[]>([]);

  const pump = React.useCallback(() => {
    if (jobRef.current || queue.current.length === 0) return;
    setJob(queue.current.shift()!);
  }, []);

  React.useEffect(() => {
    registerBrowserFetcher(j => {
      queue.current.push(j);
      pump();
    });
    return () => {
      unregisterBrowserFetcher();
    };
  }, [pump]);

  // 上一个任务完成置空后，继续处理队列里的下一个。
  React.useEffect(() => {
    if (!job) pump();
  }, [job, pump]);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let d: any;
    try {
      d = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (d?.type !== CONTENT_MESSAGE) return;
    const cur = jobRef.current;
    if (!cur || d.id !== cur.id) return;
    if (d.ok) cur.resolve(String(d.text || ''));
    else cur.reject(new Error(d.error || '抽取正文失败'));
    setJob(null);
  };

  return (
    <View
      style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }}
      pointerEvents="none"
    >
      <WebView
        ref={ref}
        source={{ uri: job ? job.url : BLANK }}
        onLoadEnd={() => {
          const cur = jobRef.current;
          if (!cur) return;
          // 留一点时间让 CF 挑战/JS 渲染完成，再抽正文。
          setTimeout(() => ref.current?.injectJavaScript(extractorJs(cur.id)), 800);
        }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
    </View>
  );
}
