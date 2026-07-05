/**
 * WebViewFetcher（Web 占位）：浏览器识别源仅原生产生，Web 无需隐藏 WebView。
 * 渲染 null，且不引入 react-native-webview，保证 Web 构建不受影响。
 */
export function WebViewFetcher() {
  return null;
}
