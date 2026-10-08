import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { readChapterFile } from '../src/utils/readChapterFile';

function file(bytes: Uint8Array, maxRead = Infinity) {
  jest
    .mocked(RNFS.stat)
    .mockResolvedValue({ size: bytes.length } as Awaited<
      ReturnType<typeof RNFS.stat>
    >);
  jest
    .mocked(RNFS.read)
    .mockImplementation(async (_path, length = 0, position = 0) =>
      Buffer.from(
        bytes.subarray(position, position + Math.min(length, maxRead)),
      ).toString('base64'),
    );
}

beforeEach(() => jest.clearAllMocks());

it('按字节分块保持中文、扩展字符、BOM 和 JSON 转义，兼容旧章节文件', async () => {
  const chapters = [
    {
      id: '中😀',
      bookId: 'b',
      order: 0,
      title: '测试𠮷',
      content: '中文\n\\"{},[]\uFEFF正文😀',
    },
  ];
  file(Buffer.from(JSON.stringify(chapters)), 2);
  await expect(readChapterFile('/book')).resolves.toEqual(chapters);
  expect(RNFS.readFile).not.toHaveBeenCalled();
  expect(
    jest.mocked(RNFS.read).mock.calls.every(call => call[3] === 'base64'),
  ).toBe(true);
});

it('块间让出事件循环，用户返回后不再读取剩余正文', async () => {
  const chapters = [{ content: '中文正文'.repeat(40000) }];
  file(Buffer.from(JSON.stringify(chapters)));
  const controller = new AbortController();
  const pending = readChapterFile('/book', controller.signal);
  const result = pending.catch(error => error);
  setTimeout(() => controller.abort(), 0);
  await expect(result).resolves.toMatchObject({ name: 'AbortError' });
  expect(RNFS.read).toHaveBeenCalledTimes(1);
  expect(jest.mocked(RNFS.read).mock.calls[0][1]).toBeLessThanOrEqual(32768);
});

it.each([
  [0xe4, 0xb8],
  [0xed, 0xa0, 0x80],
  [0xc0, 0xaf],
])('损坏 UTF-8 不发布半份章节 %j', async (...invalid) => {
  file(
    new Uint8Array([
      ...Buffer.from('[{"content":"'),
      ...invalid,
      ...Buffer.from('"}]'),
    ]),
    2,
  );
  await expect(readChapterFile('/book')).rejects.toThrow();
});

it('读盘提前结束不能把已有部分当作整本加载成功', async () => {
  file(Buffer.from('[{}]'));
  jest.mocked(RNFS.read).mockResolvedValueOnce('');
  await expect(readChapterFile('/book')).rejects.toThrow('读取不完整');
});
