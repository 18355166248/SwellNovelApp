import {
  isBadBookshukuCatalog,
  isSafeBookshukuCatalogReplacement,
} from '../src/utils/bookCatalogQuality';

describe('isBadBookshukuCatalog', () => {
  it('detects legacy split and sparse catalogs', () => {
    expect(
      isBadBookshukuCatalog('bookshuku', [
        { title: '序章' },
        { title: '分节阅读 1' },
        { title: '终章' },
      ]),
    ).toBe(true);
    expect(
      isBadBookshukuCatalog(
        'bookshuku',
        Array.from({ length: 11 }, (_, index) => ({
          title: `第 ${index + 690} 章`,
          sourceUrl: `http://wap.bookshuku.org/read/1_${index + 690}.html`,
        })),
      ),
    ).toBe(true);
  });

  it('does not reject a legitimate short catalog just because it is short', () => {
    expect(
      isBadBookshukuCatalog('bookshuku', [
        { title: '雨夜来信' },
        { title: '旧站台' },
        { title: '归途' },
      ]),
    ).toBe(false);
  });

  it('accepts a dense catalog whose valid titles are all numeric', () => {
    expect(
      isBadBookshukuCatalog(
        'bookshuku',
        Array.from({ length: 701 }, (_, index) => ({
          title: `第${index + 1}章`,
          sourceUrl: `http://wap.bookshuku.org/read/1_${index + 1}.html`,
        })),
      ),
    ).toBe(false);
  });

  it('only applies the heuristic to bookshuku', () => {
    expect(
      isBadBookshukuCatalog(
        'mingzw',
        Array.from({ length: 10 }, (_, index) => ({
          title: `分节阅读 ${index + 1}`,
        })),
      ),
    ).toBe(false);
  });

  it('rejects empty, still-sparse, or truncated replacement catalogs', () => {
    const existing = Array.from({ length: 11 }, (_, index) => ({
      title: `第${index + 690}章`,
      sourceUrl: `http://wap.bookshuku.org/read/1_${index + 690}.html`,
    }));
    expect(isSafeBookshukuCatalogReplacement('bookshuku', existing, [])).toBe(
      false,
    );
    expect(
      isSafeBookshukuCatalogReplacement(
        'bookshuku',
        existing,
        Array.from({ length: 11 }, (_, index) => ({
          title: `第${index + 1}章`,
          sourceUrl: `http://wap.bookshuku.org/read/1_${index + 1}.html`,
        })),
      ),
    ).toBe(false);
    expect(
      isSafeBookshukuCatalogReplacement(
        'bookshuku',
        existing,
        Array.from({ length: 701 }, (_, index) => ({
          title: `第${index + 1}章`,
          sourceUrl: `http://wap.bookshuku.org/read/1_${index + 1}.html`,
        })),
      ),
    ).toBe(true);
  });
});
