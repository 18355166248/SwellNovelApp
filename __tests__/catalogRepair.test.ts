import {
  migrateCatalogReferences,
  migrateReaderSelection,
  normalizedChapterIdentity,
  progressAfterCatalogRepair,
  repairCatalogPreservingIdentity,
} from '../src/utils/catalogRepair';
import type { Book, Chapter } from '../src/store/types/book';

function chapter(sequence: number, index: number): Chapter {
  return {
    id: `book-1-old-${index}`,
    bookId: 'book-1',
    title: `第${sequence}章`,
    content: `第${sequence}章正文`,
    order: index,
    sourceUrl: `http://wap.bookshuku.org/read/1_${sequence}.html`,
  };
}

describe('catalog repair', () => {
  it('preserves identities and only counts chapters newer than the old max URL sequence', () => {
    const existing = Array.from({ length: 11 }, (_, index) =>
      chapter(690 + index, index),
    );
    const metas = Array.from({ length: 701 }, (_, index) => ({
      title: `第${index + 1}章`,
      url: `http://wap.bookshuku.org/read/1_${index + 1}.html`,
    }));

    const repaired = repairCatalogPreservingIdentity(
      'book-1',
      existing,
      metas,
      () => true,
    );

    expect(repaired.chapters).toHaveLength(701);
    expect(repaired.newChapterCount).toBe(1);
    expect(repaired.chapters[689].id).toBe(existing[0].id);
    expect(repaired.chapters[699].id).toBe(existing[10].id);
    expect(repaired.chapterIdMap.get(existing[0].id)).toBe(existing[0].id);
    expect(new Set(repaired.chapters.map(item => item.id)).size).toBe(701);
    expect(
      migrateReaderSelection(
        existing,
        repaired.chapters,
        0,
        undefined,
        repaired.chapterIdMap,
      ),
    ).toMatchObject({
      chapterIndex: 689,
      chapterContent: existing[0].content,
    });
  });

  it('keeps identity and cached content across bookshuku URL entry variants', () => {
    const existing: Chapter[] = [
      {
        ...chapter(7, 0),
        id: 'stable-chapter-id',
        content: '可复用的正文缓存',
        sourceUrl: 'http://wap.bookshuku.org/read/001_007.html?legacy=1',
      },
    ];
    const nextUrl =
      'https://www.bookshuku.org/read/1_7.html?source=new-entry#reader';

    expect(normalizedChapterIdentity(existing[0].sourceUrl)).toBe(
      normalizedChapterIdentity(nextUrl),
    );
    const repaired = repairCatalogPreservingIdentity(
      'book-1',
      existing,
      [{ title: '第7章 新标题', url: nextUrl }],
      () => true,
    );

    expect(repaired.chapters[0]).toMatchObject({
      id: 'stable-chapter-id',
      title: '第7章 新标题',
      content: '可复用的正文缓存',
      sourceUrl: nextUrl,
    });
    expect(repaired.chapterIdMap.get('stable-chapter-id')).toBe(
      'stable-chapter-id',
    );
  });

  it('moves disappeared chapters to the nearest URL sequence without guessing by index', () => {
    const existing = [chapter(7, 0), chapter(8, 1)];
    const repaired = repairCatalogPreservingIdentity(
      'book-1',
      existing,
      [
        {
          title: '第8章',
          url: 'https://www.bookshuku.org/read/1_8.html',
        },
      ],
      () => false,
    );

    expect(repaired.chapterIdMap.get(existing[0].id)).toBe(existing[1].id);
    expect(repaired.chapterIdMap.get(existing[1].id)).toBe(existing[1].id);
    expect(repaired.chapters[0]).toMatchObject({
      id: existing[1].id,
      content: '',
    });

    const migrated = migrateCatalogReferences(
      'book-1',
      existing[0].id,
      {
        bookId: 'book-1',
        chapterId: existing[0].id,
        position: 5,
        updatedAt: 1,
      },
      [
        {
          id: 'removed-bookmark',
          bookId: 'book-1',
          chapterId: existing[0].id,
          position: 5,
          createdAt: 1,
        },
        {
          id: 'retained-bookmark',
          bookId: 'book-1',
          chapterId: existing[1].id,
          position: 99,
          createdAt: 2,
        },
      ],
      repaired.chapters,
      repaired.chapterIdMap,
    );

    expect(migrated.currentChapterId).toBe(existing[1].id);
    expect(migrated.history).toEqual(
      expect.objectContaining({
        chapterId: existing[1].id,
        position: 0,
      }),
    );
    expect(migrated.bookmarks).toEqual([
      expect.objectContaining({
        id: 'removed-bookmark',
        chapterId: existing[1].id,
        position: 0,
      }),
      expect.objectContaining({
        id: 'retained-bookmark',
        chapterId: existing[1].id,
        position: 0,
      }),
    ]);
  });

  it('preserves unlocatable user data but resets contradictory book progress', () => {
    const existing: Chapter[] = [
      {
        ...chapter(7, 0),
        sourceUrl: 'not-a-sequenced-source://legacy-chapter',
      },
    ];
    const repaired = repairCatalogPreservingIdentity(
      'book-1',
      existing,
      [
        {
          title: '新目录第一章',
          url: 'https://example.com/chapter/new',
        },
      ],
      () => false,
    );
    const book: Book = {
      id: 'book-1',
      title: '测试书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 70,
      currentChapterId: existing[0].id,
    };
    const orphanHistory = {
      bookId: 'book-1',
      chapterId: existing[0].id,
      position: 4,
      updatedAt: 1,
    };
    const orphanBookmark = {
      id: 'orphan-bookmark',
      bookId: 'book-1',
      chapterId: existing[0].id,
      position: 4,
      createdAt: 1,
    };

    expect(repaired.chapterIdMap.get(existing[0].id)).toBeNull();
    expect(
      migrateCatalogReferences(
        'book-1',
        existing[0].id,
        orphanHistory,
        [orphanBookmark],
        repaired.chapters,
        repaired.chapterIdMap,
      ),
    ).toMatchObject({
      currentChapterId: undefined,
      history: orphanHistory,
      bookmarks: [orphanBookmark],
    });
    expect(
      progressAfterCatalogRepair(
        book,
        existing,
        repaired.chapters,
        undefined,
        repaired.chapterIdMap,
      ),
    ).toBe(0);
  });

  it('remaps a completed sparse catalog to the retained chapter instead of old array length', () => {
    const existing = Array.from({ length: 11 }, (_, index) =>
      chapter(690 + index, index),
    );
    const metas = Array.from({ length: 701 }, (_, index) => ({
      title: `第${index + 1}章`,
      url: `http://wap.bookshuku.org/read/1_${index + 1}.html`,
    }));
    const repaired = repairCatalogPreservingIdentity(
      'book-1',
      existing,
      metas,
      () => true,
    );
    const book: Book = {
      id: 'book-1',
      title: '测试书',
      author: '作者',
      addedAt: 1,
      updatedAt: 1,
      progress: 100,
      currentChapterId: existing[10].id,
    };

    expect(
      progressAfterCatalogRepair(
        book,
        existing,
        repaired.chapters,
        undefined,
        repaired.chapterIdMap,
      ),
    ).toBe(99);
  });
});
