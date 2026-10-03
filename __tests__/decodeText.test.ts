import { base64ToBytes, decodeBytes } from '../src/utils/decodeText';

const nativeDecoder = globalThis.TextDecoder;
afterEach(() => {
  globalThis.TextDecoder = nativeDecoder;
});

it('Hermes 无 TextDecoder 时 UTF-8 中英文和扩展字符正常解码', () => {
  globalThis.TextDecoder = undefined as unknown as typeof TextDecoder;
  const bytes = new Uint8Array([
    0xe4, 0xb8, 0xad, 0x41, 0xf0, 0xa0, 0xae, 0xb7, 0xf0, 0x9f, 0x98, 0x80,
  ]);
  expect(decodeBytes(bytes)).toBe('中A𠮷😀');
  expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]))).toBe(
    '中A𠮷😀',
  );
});

it('Hermes 无 TextDecoder 时 UTF-16 双字节序和代理对正常解码', () => {
  globalThis.TextDecoder = undefined as unknown as typeof TextDecoder;
  expect(
    decodeBytes(
      new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x3d, 0xd8, 0x00, 0xde]),
    ),
  ).toBe('中😀');
  expect(
    decodeBytes(
      new Uint8Array([0xfe, 0xff, 0x4e, 0x2d, 0xd8, 0x3d, 0xde, 0x00]),
    ),
  ).toBe('中😀');
});

it('不支持的 GBK 或非法 UTF-8 提示转换编码，避免导入空书或乱码', () => {
  globalThis.TextDecoder = undefined as unknown as typeof TextDecoder;
  for (const bytes of [
    [0xd6, 0xd0],
    [0xc0, 0xaf],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
  ]) {
    expect(() => decodeBytes(new Uint8Array(bytes))).toThrow('转换为 UTF-8');
  }
});

it('base64 有填充的文件不添加额外空字节', () => {
  expect(Array.from(base64ToBytes('5LitQQ=='))).toEqual([
    0xe4, 0xb8, 0xad, 0x41,
  ]);
});
