import { throwIfAborted } from '../../utils/abort';
/** 未注册候选（中后段正文异常，禁止直接登记为可读书源）。23xs.la 笔趣阁：完整目录分页 + 章内子页；只解码公开 HTML 中固定的 base64 段落，不执行站点脚本。 */
import { fetchHtml } from '../http/fetchHtml';
import { base64ToBytes, decodeBytes } from '../../utils/decodeText';
import { decodeEntities, stripTags } from './html';
import { cleanRenderedText } from '../browserFetch/bridge';
import { collectChapterPages } from './chapterPages';
import { isInvalidOnlineChapterContent } from './contentQuality';
import type { BookSource, ParsedChapter } from './types';

const ORIGIN = 'https://www.23xs.la';
function route(url: string) {
  // RN 内置 URL 会给 .html 地址追加斜杠，相对地址也与浏览器不同；这里只识别本站固定路由。
  const parsed = /^https?:\/\/(?:www\.)?23xs\.la(\/[^?#]*)(?:[?#].*)?$/i.exec(
    url,
  );
  if (!parsed) return null;
  const match =
    /^\/book\/(\d+)\/(?:(\d+)(?:_(\d+))?\.html|index_(\d+)\.html)?$/.exec(
      parsed[1],
    );
  return match
    ? {
        bookId: match[1],
        chapterId: match[2],
        page: Number(match[3] || 0),
        catalogPage: Number(match[4] || 1),
      }
    : null;
}
function absolute(href: string, base: string) {
  const value = decodeEntities(href).trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${ORIGIN}${value}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return '';
  const directory = base.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const path = `${directory.replace(/^https?:\/\/[^/]+/, '')}${value}`;
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `${ORIGIN}/${parts.join('/')}`;
}
function anchors(html: string, base: string) {
  return Array.from(
    html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ).flatMap(match => {
    try {
      return [
        {
          url: absolute(match[1], base),
          title: decodeEntities(stripTags(match[2])).trim(),
        },
      ];
    } catch {
      return [];
    }
  });
}
function meta(html: string, key: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(match[0])?.[1];
    if (attr('property') === key || attr('name') === key)
      return decodeEntities(attr('content') || '').trim();
  }
  return '';
}
async function page(url: string, signal?: AbortSignal) {
  const current = route(url);
  if (!current?.chapterId) throw new Error('章节地址无效');
  const html = await fetchHtml(url, 12000, { signal });
  const block =
    /<div\b[^>]*class=["'][^"']*\bword_read\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1];
  if (!block) throw new Error('未解析到正文容器');
  // 编码段落来自正文容器；只接受固定函数的字符串参数，绝不 eval 广告或其他 JS。
  const decoded = block.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    script => {
      const value =
        /document\.writeln\(qsbs\.bb\(['"]([A-Za-z0-9+/=\s]+)['"]\)\);/.exec(
          script,
        )?.[1];
      return value ? decodeBytes(base64ToBytes(value.replace(/\s+/g, ''))) : '';
    },
  );
  const content = cleanRenderedText(
    decodeEntities(
      stripTags(decoded.replace(/<\/?p\b[^>]*>|<br\s*\/?>/gi, '\n')),
    ),
  );
  const title = decodeEntities(
    stripTags(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || ''),
  ).trim();
  const next = anchors(html, url).find(link => /^下一[页頁]$/.test(link.title));
  const target = next && route(next.url);
  // 本站下一章有时也写“下一页”：同书、同章且页序递增才允许合并。
  const nextPageUrl =
    target &&
    target.bookId === current.bookId &&
    target.chapterId === current.chapterId &&
    target.page === current.page + 1
      ? next!.url
      : undefined;
  // 部分后段页面明确未完却把“下一页”指向目录；正文长度达标也不能作为完整章节缓存。
  if (
    /本章未完[，,、\s]*点击下一[页頁]继续阅读/.test(stripTags(decoded)) &&
    !nextPageUrl
  )
    throw new Error('正文未完但续页缺失');
  if (!content) throw new Error('正文为空');
  return { content, title, nextPageUrl };
}
export const xs23Source: BookSource = {
  id: 'xs23',
  name: '笔趣阁（23xs）',
  host: 'www.23xs.la',
  homeUrl: `${ORIGIN}/`,
  preferDirectImport: true,
  matchUrl: url => !!route(url),
  extractId: url => route(url)?.bookId,
  detailUrl: id => `${ORIGIN}/book/${id}/`,
  async parseBookInfo(url) {
    const id = route(url)?.bookId;
    if (!id) throw new Error('无法识别书号');
    const catalogUrl = this.detailUrl(id);
    const html = await fetchHtml(catalogUrl, 12000);
    const title = meta(html, 'og:novel:book_name');
    if (!title) throw new Error('未解析到书名');
    const cover = meta(html, 'og:image');
    return {
      sourceBookId: id,
      title,
      author: meta(html, 'og:novel:author') || '佚名',
      description: meta(html, 'og:description'),
      cover: cover ? absolute(cover, catalogUrl) : undefined,
      catalogUrl,
    };
  },
  async parseCatalog(info, options = {}) {
    const firstUrl = this.detailUrl(info.sourceBookId);
    const first = await fetchHtml(firstUrl, 12000, { signal: options.signal });
    if (!first.includes('全部章节目录'))
      throw new Error('未解析到完整目录区域');
    const urls = new Set([firstUrl]);
    for (const match of first.matchAll(
      /<option\b[^>]*value=["']([^"']+)["']/gi,
    )) {
      const url = absolute(match[1], firstUrl);
      const target = route(url);
      if (
        target?.bookId === info.sourceBookId &&
        !target.chapterId &&
        target.catalogPage !== 1
      )
        urls.add(url);
    }
    if (urls.size > 100) throw new Error('目录页数异常');
    const pages = [...urls].sort(
      (a, b) => route(a)!.catalogPage - route(b)!.catalogPage,
    );
    // 选择器缺页或失效时显式失败，不能静默把第一页当成整本目录。
    if (pages.some((url, index) => route(url)!.catalogPage !== index + 1))
      throw new Error('目录分页不连续');
    const nextCatalog = anchors(first, firstUrl).some(link => {
      const target = route(link.url);
      return (
        /^下一[页頁]$/.test(link.title) &&
        target?.bookId === info.sourceBookId &&
        !target.chapterId &&
        target.catalogPage > 1
      );
    });
    if (nextCatalog && pages.length === 1)
      throw new Error('未解析到目录分页列表');
    const groups = new Array<ParsedChapter[]>(pages.length);
    let cursor = 0;
    // 三路并发、按目录页顺序合并；每页均需成功，不能仅入库首页或最新章节列表。
    await Promise.all(
      Array.from({ length: Math.min(3, pages.length) }, async () => {
        while (cursor < pages.length) {
          const index = cursor++;
          let chapters: ParsedChapter[] = [];
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const html =
                index === 0 && attempt === 0
                  ? first
                  : await fetchHtml(pages[index], 12000, {
                      signal: options.signal,
                    });
              // 同页顶部的最新章节不能排到第一章前，优先限定“全部章节目录”所在区域。
              const marker = html.indexOf('全部章节目录');
              const catalog = marker >= 0 ? html.slice(marker) : html;
              chapters = anchors(catalog, pages[index]).filter(link => {
                const target = route(link.url);
                return (
                  target?.bookId === info.sourceBookId &&
                  !!target.chapterId &&
                  target.page === 0
                );
              });
              if (chapters.length) break;
            } catch (error) {
              throwIfAborted(options.signal);
              if (attempt === 1) throw error;
            }
          }
          if (!chapters.length)
            throw new Error(`目录第 ${index + 1} 页解析失败`);
          groups[index] = chapters;
        }
      }),
    );
    const seen = new Set<string>();
    return groups.flat().filter(chapter => {
      if (seen.has(chapter.url)) return false;
      seen.add(chapter.url);
      return true;
    });
  },
  async parseChapterContent(url, options = {}) {
    const first = await page(url, options.signal);
    if (isInvalidOnlineChapterContent(first.content))
      throw new Error('正文不完整');
    const merged = await collectChapterPages({
      firstPageUrl: url,
      firstContent: first.content,
      firstNextPageUrl: first.nextPageUrl,
      signal: options.signal,
      fetchPage: pageUrl => page(pageUrl, options.signal),
      cleanPage: text => text,
    });
    return { ...merged, title: first.title, complete: !merged.nextPageUrl };
  },
};
