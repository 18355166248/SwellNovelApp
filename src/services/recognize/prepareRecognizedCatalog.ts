import { StandardURL as URL } from '../../utils/standardUrl';
import { abortable, throwIfAborted } from '../../utils/abort';
import { resolveSource } from '../source/registry';
import {
  expandRecognizedCatalog,
  getRecognitionTargetUrl,
  recognizeBookHtml,
  type RecognizedBook,
} from './recognizer';

const titleKey = (title = '') =>
  title
    .replace(/[《》\s]/g, '')
    .replace(/(?:txt下载|全文阅读|最新章节|章节列表|目录)$/, '');

/** 先从详情页进入完整目录，再聚合分页；预览的最新几章只用于展示。 */
export async function prepareRecognizedCatalog(
  original: RecognizedBook,
  fetchHtml: (url: string) => Promise<string>,
  onProgress?: (done: number, total: number, attempt?: number) => void,
  signal?: AbortSignal,
): Promise<RecognizedBook> {
  throwIfAborted(signal);
  const knownTarget = getRecognitionTargetUrl(original.url);
  const target =
    knownTarget !== original.url ? knownTarget : original.catalogUrl;
  let book = original;
  if (target && target !== original.url) {
    const current = new URL(original.url);
    const next = new URL(target, current);
    const source = resolveSource(original.url);
    const sameBook = source
      ? source.matchUrl(next.href) &&
        source.extractId(next.href) === source.extractId(original.url)
      : next.origin === current.origin;
    if (!sameBook)
      throw new Error('完整目录链接不属于当前书籍，请打开正确目录重试');
    const parsed = recognizeBookHtml(
      await abortable(fetchHtml(next.href), signal),
      next.href,
    );
    if (
      !parsed.chapters.length ||
      (original.title &&
        parsed.title &&
        titleKey(original.title) !== titleKey(parsed.title))
    )
      throw new Error('未取得同一本书的完整目录，请打开章节列表后重试');
    // 目录保留自己的地址与分页，详情页已取得的封面等资料继续沿用，避免补全后又丢失。
    book = {
      ...original,
      ...parsed,
      title: original.title || parsed.title,
      author: original.author || parsed.author,
      cover: original.cover || parsed.cover,
      description: original.description || parsed.description,
      metadataChecked: original.metadataChecked,
    };
  }
  return expandRecognizedCatalog(book, fetchHtml, onProgress, signal);
}
