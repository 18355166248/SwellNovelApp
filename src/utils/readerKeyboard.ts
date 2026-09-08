type ReaderKeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'defaultPrevented'
  | 'isComposing'
  | 'altKey'
  | 'ctrlKey'
  | 'metaKey'
  | 'shiftKey'
>;

/** 输入框、浮层和组合输入保留自己的键盘行为。 */
export function getReaderKeyTurn(
  event: ReaderKeyEvent,
  blocked: boolean,
): -1 | 1 | null {
  if (
    blocked ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return null;
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') return -1;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') return 1;
  if (event.key === ' ') return event.shiftKey ? -1 : 1;
  return null;
}
