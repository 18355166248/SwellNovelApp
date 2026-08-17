import { togglePlainBookmark, upsertExcerpt } from '../src/utils/bookmarks';
import type { Bookmark } from '../src/store/types/book';

describe('togglePlainBookmark', () => {
  const excerpt: Bookmark = {
    id: 'excerpt-1',
    bookId: 'book-1',
    chapterId: 'chapter-1',
    position: 20,
    excerpt: '需要保留的摘抄',
    note: '需要保留的笔记',
    createdAt: 1,
  };

  it('removes only the plain bookmark and preserves same-chapter excerpts', () => {
    const plain: Bookmark = {
      id: 'plain-1',
      bookId: 'book-1',
      chapterId: 'chapter-1',
      position: 10,
      createdAt: 2,
    };

    expect(
      togglePlainBookmark(
        [excerpt, plain],
        'book-1',
        'chapter-1',
        10,
        3,
      ),
    ).toEqual([excerpt]);
  });

  it('adds a plain bookmark without replacing excerpts', () => {
    const result = togglePlainBookmark(
      [excerpt],
      'book-1',
      'chapter-1',
      30,
      100,
    );

    expect(result[0]).toEqual(excerpt);
    expect(result[1]).toMatchObject({
      id: 'book-1-chapter-1-100',
      position: 30,
    });
    expect(result[1].excerpt).toBeUndefined();
  });
});

describe('upsertExcerpt', () => {
  const plain: Bookmark = {
    id: 'plain-1',
    bookId: 'book-1',
    chapterId: 'chapter-1',
    position: 0,
    createdAt: 1,
  };

  it('adds an excerpt without replacing the plain bookmark', () => {
    const result = upsertExcerpt(
      [plain],
      'book-1',
      'chapter-1',
      20,
      '  新摘抄  ',
      '  新笔记  ',
      100,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(plain);
    expect(result[1]).toMatchObject({
      id: 'book-1-chapter-1-excerpt-100',
      excerpt: '新摘抄',
      note: '新笔记',
      createdAt: 100,
    });
  });

  it('updates the same position without creating a duplicate', () => {
    const initial = upsertExcerpt(
      [],
      'book-1',
      'chapter-1',
      20,
      '旧摘抄',
      undefined,
      100,
    );
    const updated = upsertExcerpt(
      initial,
      'book-1',
      'chapter-1',
      20,
      '新摘抄',
      '补充笔记',
      200,
    );

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: 'book-1-chapter-1-excerpt-100',
      excerpt: '新摘抄',
      note: '补充笔记',
      createdAt: 100,
    });
  });
});
