import React from 'react';

interface ScreenNavigation {
  addListener?: (
    event: 'beforeRemove' | 'blur',
    callback: () => void,
  ) => () => void;
}

export function useScreenTaskSignal(
  navigation: ScreenNavigation,
  identity: string,
  focused: boolean,
) {
  const controller = React.useMemo(
    () => new AbortController(),
    // 每次切书或重新聚焦都属于新任务会话，必须生成未取消的控制器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity, focused],
  );
  const activeController = React.useRef<AbortController | null>(null);
  React.useLayoutEffect(() => {
    activeController.current = controller;
    const abort = () => controller.abort();
    if (!focused) abort();
    // 原生返回过渡期间页面可能仍挂载，不能等卸载才停止读盘、正文抓取与预取。
    const removeBefore = navigation.addListener?.('beforeRemove', abort);
    const removeBlur = navigation.addListener?.('blur', abort);
    return () => {
      activeController.current = null;
      // StrictMode 会立即重放 effect；仅真正卸载或换会话才在下一微任务取消。
      Promise.resolve().then(() => {
        if (activeController.current !== controller) abort();
      });
      removeBefore?.();
      removeBlur?.();
    };
  }, [controller, focused, navigation]);
  return controller.signal;
}
