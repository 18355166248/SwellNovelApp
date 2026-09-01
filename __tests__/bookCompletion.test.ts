import {
  bookFinishedInYear,
  isBookFinished,
} from '../src/utils/bookCompletion';

const timestamp = (value: string) => new Date(value).getTime();

describe('bookCompletion', () => {
  it('keeps a finishedAt completion after a serialized book receives new chapters', () => {
    const book = {
      progress: 82,
      finishedAt: timestamp('2026-03-10T12:00:00Z'),
      lastReadAt: timestamp('2026-08-20T12:00:00Z'),
      updatedAt: timestamp('2026-08-20T12:00:00Z'),
    };

    expect(isBookFinished(book)).toBe(true);
    expect(bookFinishedInYear(book, 2026)).toBe(true);
  });

  it('uses finishedAt instead of a newer reading timestamp for the completion year', () => {
    const book = {
      progress: 100,
      finishedAt: timestamp('2025-12-20T12:00:00Z'),
      lastReadAt: timestamp('2026-08-20T12:00:00Z'),
      updatedAt: timestamp('2026-08-20T12:00:00Z'),
    };

    expect(bookFinishedInYear(book, 2025)).toBe(true);
    expect(bookFinishedInYear(book, 2026)).toBe(false);
  });

  it('supports legacy completed books without finishedAt', () => {
    const legacy = {
      progress: 100,
      lastReadAt: timestamp('2026-04-12T12:00:00Z'),
      updatedAt: timestamp('2025-11-02T12:00:00Z'),
    };
    const legacyWithoutLastRead = {
      progress: 100,
      updatedAt: timestamp('2026-05-08T12:00:00Z'),
    };

    expect(isBookFinished(legacy)).toBe(true);
    expect(bookFinishedInYear(legacy, 2026)).toBe(true);
    expect(bookFinishedInYear(legacyWithoutLastRead, 2026)).toBe(true);
  });

  it('does not infer completion from timestamps when an unfinished legacy book has no finishedAt', () => {
    const book = {
      progress: 99,
      lastReadAt: timestamp('2026-08-20T12:00:00Z'),
      updatedAt: timestamp('2026-08-20T12:00:00Z'),
    };

    expect(isBookFinished(book)).toBe(false);
    expect(bookFinishedInYear(book, 2026)).toBe(false);
  });
});
