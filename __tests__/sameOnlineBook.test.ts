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

const ORIGIN = 'http://wap.xuanhuange.info';

describe('isSameOnlineBook', () => {
  it('浏览器识别加的书与书源搜索结果识别为同一本，不会重复入库', () => {
    // 浏览器识别存的是目录页，书源搜索给的是详情页，两者书号相同。
    const recognized = book(
      'wap.xuanhuange.info',
      `${ORIGIN}/wapbook-170446/`,
    );
    expect(isSameOnlineBook(recognized, `${ORIGIN}/info-170446/`)).toBe(true);
  });

  it('同书源的不同书不会互相误判', () => {
    const recognized = book(
      'wap.xuanhuange.info',
      `${ORIGIN}/wapbook-170446/`,
    );
    expect(isSameOnlineBook(recognized, `${ORIGIN}/info-999999/`)).toBe(false);
  });

  it('URL 完全一致时直接命中', () => {
    const added = book('xuanhuange', `${ORIGIN}/wapbook-170446/`);
    expect(isSameOnlineBook(added, `${ORIGIN}/wapbook-170446/`)).toBe(true);
  });

  it('跨站点、无来源或链接不属于任何书源时都不算同一本', () => {
    const added = book('xuanhuange', `${ORIGIN}/wapbook-170446/`);
    expect(isSameOnlineBook(added, 'https://example.com/info-170446/')).toBe(
      false,
    );
    expect(
      isSameOnlineBook(book('mingzw', 'https://tw.mingzw.net/mzwbook/17482.html'), `${ORIGIN}/info-17482/`),
    ).toBe(false);
    const local: Book = { ...added, source: undefined };
    expect(isSameOnlineBook(local, `${ORIGIN}/info-170446/`)).toBe(false);
  });
});
