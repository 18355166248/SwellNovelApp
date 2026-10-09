import { StandardURL as URL } from '../../utils/standardUrl';
import {
  abortable,
  forwardAbort,
  isAbortError,
  throwIfAborted,
} from '../../utils/abort';
import { fetchRenderedHtml } from '../browserFetch/bridge';
import { resolveSource } from '../source/registry';
import {
  extractBookMetadata,
  type BookMetadata,
  type MetadataExtraction,
  type MetadataLink,
} from './bookMetadata';
import type { RecognizedBook } from './recognizer';
import { saveBookMetadataReports } from './bookMetadataDiagnostics';

type Field = keyof BookMetadata;
export interface MetadataAttempt {
  url: string;
  via: string;
  status: 'merged' | 'empty' | 'rejected' | 'failed' | 'cancelled';
  fields: Field[];
  reason?: string;
  rules?: MetadataExtraction['metadataRules'];
  issues?: string[];
}
export interface MetadataReport {
  url: string;
  missing: Field[];
  remaining: Field[];
  attempts: MetadataAttempt[];
  resolved: BookMetadata;
  elapsedMs: number;
  outcome?: 'complete' | 'partial' | 'cancelled' | 'timeout';
}
/** 特殊站点只扩展候选地址或提取规则，抓取预算、同书校验、合并与诊断仍复用主流程。 */
export interface MetadataExtension {
  id: string;
  matches(url: string): boolean;
  candidates?(book: RecognizedBook): MetadataLink[];
  extract?(html: string, url: string): Partial<MetadataExtraction>;
}
export interface MetadataOptions {
  signal?: AbortSignal;
  fetchHtml?: (url: string, signal: AbortSignal) => Promise<string>;
  extensions?: MetadataExtension[];
  maxRequests?: number;
  timeoutMs?: number;
  onDiagnostic?: (report: MetadataReport) => void;
}

const reports = new Map<string, MetadataReport>();
/** 集中登记特殊站点扩展；常规站点无需登记，优先使用页面线索和已有 BookSource。 */
export const BOOK_METADATA_EXTENSIONS: MetadataExtension[] = [];
export function getBookMetadataReport(url: string): MetadataReport | undefined {
  return reports.get(url);
}
const fields: Field[] = ['title', 'author', 'cover', 'description'];
const usable = (field: Field, value?: string) =>
  !!value?.trim() &&
  !(
    field === 'cover' &&
    /(?:no[_-]?(?:photo|cover)|placeholder|loading|logo)\./i.test(value)
  ) &&
  !(field === 'author' && /^(?:佚名|未知|未知作者|作者)$/.test(value.trim()));
export const needsBookMetadata = (book: BookMetadata) =>
  (['title', 'author', 'cover'] as Field[]).some(
    field => !usable(field, book[field]),
  );
const titleKey = (title = '') =>
  title
    .replace(/[《》〈〉「」\s]/g, '')
    .replace(
      /(?:全文阅读|全文閱讀|章节列表|章節列表|最新章节|最新章節|txt下载|TXT下载|目录|目錄)$/,
      '',
    );

/** 合并只补缺失字段；同书详情可把“书名全文阅读”规范成书名，绝不改目录和阅读进度。 */
export function mergeBookMetadata<T extends BookMetadata>(
  current: T,
  incoming: BookMetadata,
): T {
  const result = { ...current };
  for (const field of fields) {
    if (!usable(field, incoming[field])) continue;
    if (
      !usable(field, current[field]) ||
      (field === 'title' &&
        titleKey(current.title) === titleKey(incoming.title))
    )
      result[field] = incoming[field];
  }
  return result;
}

export async function enrichBookMetadata(
  original: RecognizedBook,
  options: MetadataOptions = {},
): Promise<{ book: RecognizedBook; report: MetadataReport }> {
  const started = Date.now();
  const controller = new AbortController();
  const unlink = forwardAbort(options.signal, controller);
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 18000,
  );
  const signal = controller.signal;
  const source = resolveSource(original.url);
  const sourceId = source?.extractId(original.url);
  const extensions = (options.extensions || BOOK_METADATA_EXTENSIONS).filter(
    extension => extension.matches(original.url),
  );
  const report: MetadataReport = {
    url: original.url,
    missing: fields.filter(field => !usable(field, original[field])),
    remaining: [],
    attempts: [],
    resolved: {},
    elapsedMs: 0,
  };
  let book = { ...original };
  const queue: Array<MetadataLink & { depth: number }> = [];
  const seen = new Set<string>();
  const add = (links: MetadataLink[], depth: number) => {
    for (const link of links) {
      try {
        const target = new URL(link.url, original.url);
        target.hash = '';
        if (!/^https?:$/.test(target.protocol) || seen.has(target.href))
          continue;
        seen.add(target.href);
        const sameBook =
          source && sourceId
            ? source.matchUrl(target.href) &&
              source.extractId(target.href) === sourceId
            : target.host === new URL(original.url).host;
        // 备用地址必须仍属于本书；未知站点只跟随同站显式详情链接，不能遍历推荐书或广告。
        if (!sameBook) {
          report.attempts.push({
            url: target.href,
            via: link.reason,
            status: 'rejected',
            fields: [],
            reason: 'different-book-or-site',
          });
          continue;
        }
        queue.push({ url: target.href, reason: link.reason, depth });
      } catch {
        /* 非法候选不进入网络队列。 */
      }
    }
  };
  const fetchHtml =
    options.fetchHtml ||
    ((url: string, requestSignal: AbortSignal) =>
      fetchRenderedHtml(url, {
        signal: requestSignal,
        timeout: 7000,
        waitMs: 1000,
        priority: 'low',
      }));
  try {
    throwIfAborted(options.signal);
    add(
      source && sourceId
        ? [{ url: source.detailUrl(sourceId), reason: 'source-detail' }]
        : [],
      0,
    );
    add(
      (source?.metadataUrls?.(original.url) || []).map(url => ({
        url,
        reason: 'source-fallback',
      })),
      0,
    );
    add(original.metadataLinks || [], 0);
    for (const extension of extensions) {
      try {
        add(
          (extension.candidates?.(original) || []).map(candidate => ({
            ...candidate,
            reason: `extension:${extension.id}:${candidate.reason}`,
          })),
          0,
        );
      } catch (error) {
        report.attempts.push({
          url: original.url,
          via: `extension:${extension.id}`,
          status: 'failed',
          fields: [],
          reason:
            error instanceof Error
              ? error.message
              : 'candidate-extension-failed',
        });
      }
    }
    // 未知站点的旧书没有保存详情链接时，先回读原页发现候选。每个地址最多请求一次。
    add([{ url: original.url, reason: 'current-page' }], 0);
    let requests = 0;
    while (
      needsBookMetadata(book) &&
      queue.length &&
      requests < Math.min(5, options.maxRequests ?? 3)
    ) {
      if (signal.aborted) break;
      const candidate = queue.shift()!;
      requests += 1;
      try {
        const html = await abortable(fetchHtml(candidate.url, signal), signal);
        throwIfAborted(signal);
        let extracted = extractBookMetadata(html, candidate.url, URL);
        for (const extension of extensions) {
          if (extension.matches(candidate.url) && extension.extract) {
            const extra = extension.extract(html, candidate.url);
            extracted = {
              ...extracted,
              ...extra,
              metadataRules: {
                ...extracted.metadataRules,
                ...Object.fromEntries(
                  fields
                    .filter(field => extra[field])
                    .map(field => [field, `extension:${extension.id}`]),
                ),
                ...extra.metadataRules,
              },
              metadataLinks: [
                ...extracted.metadataLinks,
                ...(extra.metadataLinks || []),
              ],
            };
          }
        }
        const validTitle =
          !!extracted.title &&
          (!book.title || titleKey(book.title) === titleKey(extracted.title));
        if (!validTitle) {
          report.attempts.push({
            url: candidate.url,
            via: candidate.reason,
            status: 'rejected',
            fields: [],
            reason: 'title-mismatch-or-blocked-page',
          });
          continue;
        }
        const merged = mergeBookMetadata(book, extracted);
        const changed = fields.filter(field => merged[field] !== book[field]);
        report.attempts.push({
          url: candidate.url,
          via: candidate.reason,
          status: changed.length ? 'merged' : 'empty',
          fields: changed,
          rules: extracted.metadataRules,
          issues: extracted.metadataIssues,
          reason:
            !merged.cover &&
            extracted.metadataIssues.includes('placeholder-cover')
              ? 'site-placeholder-cover'
              : undefined,
        });
        book = {
          ...book,
          ...Object.fromEntries(fields.map(field => [field, merged[field]])),
          ...(extracted.metadataIssues.length
            ? {
                metadataIssues: Array.from(
                  new Set([
                    ...(book.metadataIssues || []),
                    ...extracted.metadataIssues,
                  ]),
                ),
              }
            : {}),
        };
        if (candidate.depth < 2)
          add(extracted.metadataLinks, candidate.depth + 1);
      } catch (error) {
        if (options.signal?.aborted) {
          report.attempts.push({
            url: candidate.url,
            via: candidate.reason,
            status: 'cancelled',
            fields: [],
            reason: 'caller-aborted',
          });
          throw error;
        }
        report.attempts.push({
          url: candidate.url,
          via: candidate.reason,
          status: 'failed',
          fields: [],
          reason: signal.aborted
            ? 'budget-timeout'
            : error instanceof Error
            ? error.message
            : 'fetch-failed',
        });
        if (isAbortError(error)) break;
      }
    }
    throwIfAborted(options.signal);
    return { book, report };
  } finally {
    clearTimeout(timer);
    unlink();
    report.resolved = Object.fromEntries(
      fields.map(field => [field, book[field]]),
    );
    report.remaining = fields.filter(field => !usable(field, book[field]));
    report.elapsedMs = Date.now() - started;
    report.outcome = options.signal?.aborted
      ? 'cancelled'
      : signal.aborted
      ? 'timeout'
      : needsBookMetadata(book)
      ? 'partial'
      : 'complete';
    reports.delete(original.url);
    reports.set(original.url, report);
    if (reports.size > 20) reports.delete(reports.keys().next().value!);
    saveBookMetadataReports(Array.from(reports.values()));
    options.onDiagnostic?.(report);
    // 只记录地址、规则和字段结果，避免把整页广告脚本或正文塞入排障日志。
    console.info('[BookMetadata]', JSON.stringify(report));
  }
}
