/**
 * 校验 Web 端书库持久化的拆分存储与旧数据迁移。
 */

class LocalStorageStub {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as any).window = { localStorage: new LocalStorageStub() };
});

const loadModule = () => require('../src/utils/libraryStorage.web');

const chapter = (bookId: string, order: number) => ({
  id: `${bookId}-${order}`,
  bookId,
  title: `第${order}章`,
  content: '正文',
  order,
});

describe('libraryStorage.web 拆分存储', () => {
  it('meta 与章节分开落盘，章节按书懒加载', async () => {
    const {
      saveLibraryMeta,
      saveBookChapters,
      loadLibrarySnapshot,
      loadBookChapters,
    } = loadModule();

    await saveLibraryMeta({
      version: 1,
      readerSettingsVersion: 2,
      books: [
        {
          id: 'b1',
          title: '书',
          author: '佚名',
          addedAt: 1,
          updatedAt: 1,
          progress: 0,
        },
      ],
      readingHistory: {},
      bookmarks: {},
      profileAppearance: { avatarId: 'reader', frameId: 'ink-jade' },
    });
    await saveBookChapters('b1', [chapter('b1', 0)]);

    const snapshot = await loadLibrarySnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.books).toHaveLength(1);
    // 启动快照不携带正文，改为懒加载。
    expect(snapshot!.chapters).toEqual({});
    expect(snapshot!.profileAppearance).toEqual({
      avatarId: 'reader',
      frameId: 'ink-jade',
    });

    const chapters = await loadBookChapters('b1');
    expect(chapters).toHaveLength(1);
    expect(chapters![0].content).toBe('正文');
  });

  it('迁移旧的单文件快照为 meta + 按书分文件', async () => {
    const { loadLibrarySnapshot, loadBookChapters } = loadModule();

    window.localStorage.setItem(
      'swell-novel-library-state-v1',
      JSON.stringify({
        version: 1,
        books: [
          {
            id: 'b9',
            title: '旧书',
            author: '佚名',
            addedAt: 1,
            updatedAt: 1,
            progress: 0,
          },
        ],
        chapters: { b9: [chapter('b9', 0), chapter('b9', 1)] },
        readingHistory: {},
        bookmarks: {},
      }),
    );

    const snapshot = await loadLibrarySnapshot();
    expect(snapshot!.books[0].id).toBe('b9');
    expect(snapshot!.chapters).toEqual({});

    // 旧的单文件已删除，章节已拆到按书分文件。
    expect(
      window.localStorage.getItem('swell-novel-library-state-v1'),
    ).toBeNull();
    const migrated = await loadBookChapters('b9');
    expect(migrated).toHaveLength(2);
  });
});
