import RNFS from 'react-native-fs';
import {
  loadBookChapters,
  saveLibraryMeta,
  saveBookChapters,
  deleteBookChapters,
} from '../src/utils/libraryStorage';

const meta = (progress: number) => ({
  version: 1 as const,
  books: [
    {
      id: 'b',
      title: '书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress,
    },
  ],
  readingHistory: {},
  bookmarks: {},
});
const chapters = (bookId: string, content: string) => [
  {
    id: `${bookId}-1`,
    bookId,
    title: '第一章',
    order: 0,
    content,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
  (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
});

it('旧元数据写入结束后才开始新写入，最终保留最新进度', async () => {
  let finishFirst!: () => void;
  const first = new Promise<void>(resolve => {
    finishFirst = resolve;
  });
  (RNFS.writeFile as jest.Mock).mockReturnValueOnce(first);
  const oldSave = saveLibraryMeta(meta(10));
  const newSave = saveLibraryMeta(meta(40));
  expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
  finishFirst();
  await Promise.all([oldSave, newSave]);
  expect(
    JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[1][1]).books[0]
      .progress,
  ).toBe(40);
});

it('写入失败不阻塞下一次保存，调用者仍能收到原始错误', async () => {
  (RNFS.writeFile as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  const failed = saveLibraryMeta(meta(10));
  const recovered = saveLibraryMeta(meta(20));
  await expect(failed).rejects.toThrow('disk full');
  await recovered;
  expect(RNFS.writeFile).toHaveBeenCalledTimes(2);
});

it('不同书籍并行保存，同书清理等待正文写入结束', async () => {
  let finish!: () => void;
  (RNFS.writeFile as jest.Mock).mockReturnValueOnce(
    new Promise<void>(resolve => {
      finish = resolve;
    }),
  );
  const pending = saveBookChapters('a', chapters('a', '旧正文'));
  const independent = saveBookChapters('b', chapters('b', '其他书'));
  const deletion = deleteBookChapters('a');
  await independent;
  expect(RNFS.writeFile).toHaveBeenCalledTimes(2);
  expect(RNFS.unlink).not.toHaveBeenCalled();
  finish();
  await Promise.all([pending, deletion]);
  expect(RNFS.unlink).toHaveBeenCalledWith(
    '/mock-documents/book-chapters/a.json',
  );
});

it('创建章节目录失败会反馈给导入调用者，不会误报正文已保存', async () => {
  (RNFS.mkdir as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await expect(saveBookChapters('a', chapters('a', '正文'))).rejects.toThrow(
    'disk full',
  );
  expect(RNFS.writeFile).not.toHaveBeenCalled();
});

it('返回后读盘才结束，不再解析整本 JSON', async () => {
  let finish!: (data: string) => void;
  (RNFS.readFile as jest.Mock).mockReturnValueOnce(
    new Promise<string>(resolve => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  const loading = loadBookChapters('a', controller.signal);
  await Promise.resolve();
  expect(RNFS.readFile).toHaveBeenCalled();
  controller.abort();
  // 无效 JSON 若仍被解析会抛 SyntaxError；正确路径应直接结束为取消。
  finish('invalid large JSON');
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
});
