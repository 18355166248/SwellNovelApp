/**
 * 跨端二次确认。
 * - 原生：用 RN Alert 的两按钮弹窗（删除为 destructive 样式）。
 * - Web：RN Web 的 Alert 不支持按钮回调，改用浏览器原生 window.confirm。
 */

import { Alert, Platform } from 'react-native';

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = '删除',
): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
