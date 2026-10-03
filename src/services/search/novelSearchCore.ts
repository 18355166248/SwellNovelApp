import { fetchHtml } from '../http/fetchHtml';
import { SOURCES, resolveSource } from '../source/registry';
import { decodeEntities, stripTags } from '../source/html';
import { base64ToBytes } from '../../utils/decodeText';
import { searchSourceCatalogs } from '../discover/sourceRecommendations';
import { normalizeSearchText } from './searchMatching';

export const isNovelSearchSupported = true;

export interface NovelSearchResult {
  url: string;
  title: string;
  author?: string;
  sourceName: string;
}

export interface NovelSearchOptions {
  onResults?: (results: NovelSearchResult[]) => void;
  isCancelled?: () => boolean;
}

interface RawHit {
  url: string;
  title: string;
  author?: string;
}

const MAX_RESULTS = 15;
const ENGINE_TIMEOUT_MS = 4000;
const CATALOG_TIMEOUT_MS = 5000;
const VERIFIED_TITLE_ENTRIES = [
  { title: '凡人修仙传', author: '忘语', sourceId: 'mingzw', id: '17482' },
  { title: '道诡异仙', author: '狐尾的笔', sourceId: 'mingzw', id: '39572' },
  {
    title: '道诡异仙',
    author: '狐尾的笔',
    sourceId: 'bookshuku',
    id: '117811',
  },
];

function sourceDomain(host: string): string {
  // site:www / site:wap 会漏掉同书源的 tw、www 等镜像；限定根域仍只搜索登记站点。
  return host.replace(/^(?:www|wap|tw)\./i, '');
}

function getVerifiedResults(keyword: string): NovelSearchResult[] {
  return VERIFIED_TITLE_ENTRIES.flatMap(entry => {
    if (
      keyword.length < 2 ||
      (!normalizeSearchText(entry.title).includes(keyword) &&
        !normalizeSearchText(entry.author).includes(keyword))
    )
      return [];
    const source = SOURCES.find(item => item.id === entry.sourceId);
    return source
      ? [
          {
            url: source.detailUrl(entry.id),
            title: entry.title,
            author: entry.author,
            sourceName: source.name,
          },
        ]
      : [];
  });
}

function attribute(tag: string, name: string): string {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    'i',
  ).exec(tag);
  return match ? decodeEntities(match[2]) : '';
}

function plainText(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

function extractAuthor(text: string): string | undefined {
  // 只采信明确标注的作者；推荐列表/摘要偶然提及关键词不能冒充作者命中。
  return /(?:作者|著者)\s*[：:]\s*([^\s，。；;|/<>]{1,20})/.exec(text)?.[1];
}

function decodeResultHref(href: string, engine: 'ddg' | 'bing'): string | null {
  try {
    const ddg = /[?&]uddg=([^&]+)/.exec(href);
    if (engine === 'ddg' && ddg) return decodeURIComponent(ddg[1]);
    const bing = /[?&]u=a1([^&]+)/.exec(href);
    if (engine === 'bing' && bing) {
      let b64 = bing[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return Array.from(base64ToBytes(b64), byte =>
        String.fromCharCode(byte),
      ).join('');
    }
    return /^https?:\/\//i.test(href) ? href : null;
  } catch {
    return null;
  }
}

function parseDdg(html: string): RawHit[] {
  const links = Array.from(html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)).filter(
    match =>
      attribute(match[0].split('>')[0], 'class')
        .split(/\s+/)
        .includes('result__a'),
  );
  return links.flatMap((match, index) => {
    const url = decodeResultHref(
      attribute(match[0].split('>')[0], 'href'),
      'ddg',
    );
    if (!url) return [];
    const end = links[index + 1]?.index ?? html.length;
    const block = html.slice(match.index, end);
    const snippet =
      /<[^>]*class\s*=\s*["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i.exec(
        block,
      )?.[1] ?? '';
    const title = plainText(match[0]);
    return [
      { url, title, author: extractAuthor(`${title} ${plainText(snippet)}`) },
    ];
  });
}

function parseBing(html: string): RawHit[] {
  const blocks = Array.from(
    html.matchAll(
      /<li\b[^>]*class\s*=\s*["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
    ),
  );
  const sections = blocks.length ? blocks.map(match => match[1]) : [html];
  return sections.flatMap(section =>
    Array.from(
      section.matchAll(/<h2\b[^>]*>\s*(<a\b[^>]*>)([\s\S]*?)<\/a>/gi),
    ).flatMap(match => {
      const url = decodeResultHref(attribute(match[1], 'href'), 'bing');
      if (!url) return [];
      const title = plainText(match[2]);
      return [
        {
          url,
          title,
          author: extractAuthor(blocks.length ? plainText(section) : title),
        },
      ];
    }),
  );
}

function toResults(
  hits: RawHit[],
  keyword: string,
  sourceId: string,
): NovelSearchResult[] {
  return hits.flatMap(hit => {
    const source = resolveSource(hit.url);
    if (!source || source.id !== sourceId) return [];
    try {
      const parsed = new URL(hit.url);
      const domain = sourceDomain(source.host);
      // 旧适配器的 matchUrl 较宽松；搜索链接必须验证真实主机，不能接受伪造后缀/路径。
      if (
        !/^https?:$/.test(parsed.protocol) ||
        (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`))
      )
        return [];
    } catch {
      return [];
    }
    if (
      !normalizeSearchText(hit.title).includes(keyword) &&
      !normalizeSearchText(hit.author ?? '').includes(keyword)
    )
      return [];
    const id = source.extractId(hit.url);
    if (!id) return [];
    return [
      {
        url: source.detailUrl(id),
        title: hit.title,
        author: hit.author,
        sourceName: source.name,
      },
    ];
  });
}

function mergeResults(
  results: NovelSearchResult[],
  keyword: string,
): NovelSearchResult[] {
  const seen = new Set<string>();
  const rank = (item: NovelSearchResult) => {
    const title = normalizeSearchText(item.title);
    return title === keyword
      ? 0
      : title.startsWith(keyword)
      ? 1
      : title.includes(keyword)
      ? 2
      : 3;
  };
  return results
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.sourceName === '明智屋中文网') -
          Number(a.sourceName === '明智屋中文网'),
    )
    .slice(0, MAX_RESULTS);
}

async function withinDeadline<T>(
  request: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // fetchHtml 原生代理回退可能重复耗时；搜索单次尝试有独立上限，迟到响应不得阻塞 UI。
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('搜索请求超时')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchNovels(
  keyword: string,
  options: NovelSearchOptions = {},
): Promise<NovelSearchResult[]> {
  const kw = keyword.trim();
  const normalized = normalizeSearchText(kw);
  if (!normalized || options.isCancelled?.()) return [];
  let collected = getVerifiedResults(normalized);
  const publish = () => {
    collected = mergeResults(collected, normalized);
    if (!options.isCancelled?.()) options.onResults?.([...collected]);
  };
  if (collected.length) publish();
  // 已知书目先展示，但精确书名也继续查其他书源；固定入口失效时仍能选择其他结果。

  await Promise.all(
    SOURCES.map(async source => {
      const query = `${kw} site:${sourceDomain(source.host)}`;
      const engines = [
        {
          url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
            query,
          )}&kl=cn-zh`,
          parse: parseDdg,
        },
        {
          url: `https://www.bing.com/search?q=${encodeURIComponent(
            query,
          )}&setlang=zh-CN&mkt=zh-CN`,
          parse: parseBing,
        },
      ];
      for (const engine of engines) {
        if (options.isCancelled?.()) return;
        try {
          const html = await withinDeadline(
            fetchHtml(engine.url, ENGINE_TIMEOUT_MS, {
              preferLocalProxy: true,
            }),
            ENGINE_TIMEOUT_MS,
          );
          const results = toResults(engine.parse(html), normalized, source.id);
          if (options.isCancelled?.()) return;
          if (results.length) {
            collected.push(...results);
            publish();
            return;
          }
        } catch {
          // 当前书源的引擎失败后试另一个；其他书源并发回传，不受此站阻塞。
        }
      }
    }),
  );
  if (options.isCancelled?.()) return [];
  if (collected.length) return mergeResults(collected, normalized);
  try {
    const catalog = await withinDeadline(
      searchSourceCatalogs(kw, { timeoutMs: CATALOG_TIMEOUT_MS }),
      CATALOG_TIMEOUT_MS,
    );
    if (options.isCancelled?.()) return [];
    collected = catalog.map(item => ({
      url: item.url,
      title: item.title,
      author: item.author,
      sourceName: item.sourceName,
    }));
    if (collected.length) publish();
    return mergeResults(collected, normalized);
  } catch {
    if (options.isCancelled?.()) return [];
    throw new Error('搜索服务暂时不可用，请检查网络后重试');
  }
}
