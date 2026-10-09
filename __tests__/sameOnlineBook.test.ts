import { isSameOnlineBook } from '../src/utils/addOnlineBook';
import type { Book } from '../src/store/types/book';

const book = (sourceName: string, bookUrl: string): Book => ({
  id: 'book-1',
  title: '道诡异仙',
  author: '狐尾的笔',
  addedAt: 0,
  updatedAt: 0,
  progress: 0,
  totalChapters: 1,
  source: { name: sourceName, bookUrl },
});

const ORIGIN = 'https://tw.mingzw.net';

describe('isSameOnlineBook', () => {
  it('浏览器识别加的书与书源搜索结果识别为同一本，不会重复入库', () => {
    // 浏览器识别存的是目录页，书源搜索给的是详情页，两者书号相同。
    const recognized = book(
      'tw.mingzw.net',
      `${ORIGIN}/mzwchapter/170446.html`,
    );
    expect(isSameOnlineBook(recognized, `${ORIGIN}/mzwbook/170446.html`)).toBe(
      true,
    );
  });

  it('同书源的不同书不会互相误判', () => {
    const recognized = book(
      'tw.mingzw.net',
      `${ORIGIN}/mzwchapter/170446.html`,
    );
    expect(isSameOnlineBook(recognized, `${ORIGIN}/mzwbook/999999.html`)).toBe(
      false,
    );
  });

  it('URL 完全一致时直接命中', () => {
    const added = book('mingzw', `${ORIGIN}/mzwchapter/170446.html`);
    expect(isSameOnlineBook(added, `${ORIGIN}/mzwchapter/170446.html`)).toBe(
      true,
    );
  });

  it('跨站点、无来源或链接不属于任何书源时都不算同一本', () => {
    const added = book('mingzw', `${ORIGIN}/mzwchapter/170446.html`);
    expect(
      isSameOnlineBook(added, 'https://example.com/mzwbook/170446.html'),
    ).toBe(false);
    expect(
      isSameOnlineBook(
        book('bookshuku', 'https://www.bookshuku.org/bookinfo/17482.html'),
        `${ORIGIN}/mzwbook/17482.html`,
      ),
    ).toBe(false);
    const local: Book = { ...added, source: undefined };
    expect(isSameOnlineBook(local, `${ORIGIN}/mzwbook/170446.html`)).toBe(
      false,
    );
  });
});
