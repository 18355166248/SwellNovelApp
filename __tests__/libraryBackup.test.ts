import { strToU8, zipSync } from 'fflate';
import {
  createLibraryBackup,
  readLibraryBackup,
} from '../src/services/backup/libraryBackup';
import { LibraryMeta } from '../src/utils/libraryStorage';

const meta: LibraryMeta = {
  version: 1,
  readerSettingsVersion: 2,
  books: [
    {
      id: 'book-1',
      title: '测试小说',
      author: '轻读',
      addedAt: 1,
      updatedAt: 1,
      progress: 42,
    },
  ],
  readingHistory: {
    'book-1': {
      bookId: 'book-1',
      chapterId: 'chapter-1',
      position: 12,
      updatedAt: 2,
    },
  },
  bookmarks: {
    'book-1': [
      {
        id: 'excerpt-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        position: 6,
        excerpt: '值得记住的正文',
        note: '稍后再读',
        createdAt: 3,
      },
    ],
  },
  readerSettings: {
    theme: 'paper',
    fontSizeIndex: 4,
    lineHeightIndex: 1,
    pageMode: 'page',
  },
  searchHistory: ['测试小说'],
  readingStats: { secondsByDate: { '2026-07-10': 120 } },
  profileAppearance: { avatarId: 'moon', frameId: 'bookplate' },
};

describe('library backup archive', () => {
  it('保留书库元数据与按书拆分的章节内容', () => {
    const archive = createLibraryBackup(
      meta,
      {
        'book-1': [
          {
            id: 'chapter-1',
            bookId: 'book-1',
            title: '第一章',
            content: '正文',
            order: 0,
          },
        ],
      },
      100,
    );

    expect(readLibraryBackup(archive)).toEqual({
      meta,
      chapters: {
        'book-1': [
          {
            id: 'chapter-1',
            bookId: 'book-1',
            title: '第一章',
            content: '正文',
            order: 0,
          },
        ],
      },
      createdAt: 100,
    });
  });

  it('拒绝校验和不匹配的内容', () => {
    const library = strToU8(JSON.stringify(meta));
    const archive = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          format: 'swell-novel-backup',
          version: 1,
          createdAt: 1,
          entries: { 'library.json': '00000000' },
        }),
      ),
      'library.json': library,
    });

    expect(() => readLibraryBackup(archive)).toThrow(
      '备份校验失败：library.json',
    );
  });

  it('拒绝未知备份格式', () => {
    const archive = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          format: 'other',
          version: 1,
          createdAt: 1,
          entries: {},
        }),
      ),
      'library.json': strToU8(JSON.stringify(meta)),
    });

    expect(() => readLibraryBackup(archive)).toThrow('不支持的备份文件版本');
  });
});
