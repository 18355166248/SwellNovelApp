import { getReaderKeyTurn } from '../src/utils/readerKeyboard';

const event = (key: string, overrides = {}) => ({
  key,
  defaultPrevented: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

it('supports arrows, paging keys and space in both directions', () => {
  for (const key of ['ArrowLeft', 'PageUp'])
    expect(getReaderKeyTurn(event(key), false)).toBe(-1);
  for (const key of ['ArrowRight', 'PageDown', ' '])
    expect(getReaderKeyTurn(event(key), false)).toBe(1);
  expect(getReaderKeyTurn(event(' ', { shiftKey: true }), false)).toBe(-1);
});

it('keeps editing, overlays, IME and system shortcuts out of page navigation', () => {
  expect(getReaderKeyTurn(event(' '), true)).toBeNull();
  for (const flag of [
    'defaultPrevented',
    'isComposing',
    'altKey',
    'ctrlKey',
    'metaKey',
  ]) {
    expect(
      getReaderKeyTurn(event('ArrowRight', { [flag]: true }), false),
    ).toBeNull();
  }
  expect(getReaderKeyTurn(event('a'), false)).toBeNull();
});
