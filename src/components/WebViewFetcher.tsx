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
  registerBrowserFetcher,
  unregisterBrowserFetcher,
  FetchJob,
} from '../services/browserFetch/bridge';

// react-native-webview 的 class 组件类型与 React 19 JSX 类型不完全兼容，以 any 渲染。
const WebView = RNWebView as unknown as React.ComponentType<any>;

// iOS 的 RNCWebView 会把 about:blank 走到 loadFileURL 分支并触发崩溃；空闲态用空 HTML 占位即可。
const EMPTY_SOURCE = { html: '<!doctype html><html><head></head><body></body></html>' };

export function WebViewFetcher() {
  const ref = React.useRef<any>(null);
  const [job, setJob] = React.useState<FetchJob | null>(null);
  const jobRef = React.useRef<FetchJob | null>(null);
  jobRef.current = job;
  const queue = React.useRef<FetchJob[]>([]);
  const injectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const jobTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const pump = React.useCallback(() => {
    if (jobRef.current || queue.current.length === 0) return;
    const next = queue.current.shift()!;
    console.info('[WebViewFetcher] start job', {
      id: next.id,
      url: next.url,
      queue: queue.current.length,
    });
    setJob(next);
  }, []);

  React.useEffect(() => {
    registerBrowserFetcher(j => {
      // 当前阅读章节使用 high 优先级，目录浮层标题解析使用 low；
      // WebView 只有一个实例，按优先级排队可以避免后台目录解析阻塞用户点击章节。
      if (j.priority === 'high') queue.current.unshift(j);
      else queue.current.push(j);
      console.info('[WebViewFetcher] queued job', {
        id: j.id,
        url: j.url,
        priority: j.priority,
        queue: queue.current.length,
      });
      pump();
    });
    return () => {
      unregisterBrowserFetcher();
      if (injectTimerRef.current) clearTimeout(injectTimerRef.current);
      if (jobTimerRef.current) clearTimeout(jobTimerRef.current);
    };
  }, [pump]);

  // 上一个任务完成置空后，继续处理队列里的下一个。
  React.useEffect(() => {
    if (!job) pump();
  }, [job, pump]);

  React.useEffect(() => {
    if (jobTimerRef.current) clearTimeout(jobTimerRef.current);
    if (!job) return;
    // bridge 层的 Promise 超时只能通知调用方，不能自动释放 WebViewFetcher 当前任务；
    // 这里同步清理当前 job，避免一次 WebView 无回调把后续章节全部卡在队列里。
    jobTimerRef.current = setTimeout(() => {
      const cur = jobRef.current;
      if (!cur || cur.id !== job.id) return;
      console.warn('[WebViewFetcher] job timeout, clearing queue head', {
        id: cur.id,
        url: cur.url,
        queue: queue.current.length,
      });
      cur.reject(new Error(cur.timeoutMessage));
      setJob(null);
    }, job.timeoutMs + 1000);
    return () => {
      if (jobTimerRef.current) clearTimeout(jobTimerRef.current);
    };
  }, [job]);

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
    console.info('[WebViewFetcher] message', {
      id: cur.id,
      ok: !!d.ok,
      length: String(d.text || '').length,
    });
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
        source={job ? { uri: job.url } : EMPTY_SOURCE}
        onLoadEnd={() => {
          const cur = jobRef.current;
          if (!cur) return;
          // 留足时间让 CF 挑战/JS 渲染完成，再按任务类型抽正文或 HTML；过早读取会拿到挑战页。
          if (injectTimerRef.current) clearTimeout(injectTimerRef.current);
          console.info('[WebViewFetcher] load end, wait inject', {
            id: cur.id,
            waitMs: cur.waitMs,
          });
          injectTimerRef.current = setTimeout(() => {
            const latest = jobRef.current;
            if (!latest || latest.id !== cur.id) return;
            console.info('[WebViewFetcher] inject', { id: cur.id });
            ref.current?.injectJavaScript(cur.script(cur.id));
          }, cur.waitMs);
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
