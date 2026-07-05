/**
 * 书源：TXT图书下载网（wap.bookshuku.org）。
 *
 * 页面结构（已实测）：
 * - 详情页 /bookinfo/{id}.html：书名 <div class="detail"><b>、作者 作者：<a>、
 *   封面 <div class="cover"><img src>、简介 <p class="intro">、状态 状态：xxx。
 * - 目录页 /read/{id}.html：<li><a href="…/read/{id}_{n}.html">标题</a></li>，单页全量。
 * - 正文页 /read/{id}_{n}.html（首子页）、/read/{id}_{n}_{p}.html（第 2+ 子页），
 *   正文在 <div class="articlecon …">，段落 <br /> 分隔、&nbsp; 缩进，含 第X/Y页 标记。
 */

import { fetchHtml } from '../http/fetchHtml';
import { BookSource, ParsedBookInfo, ParsedChapter } from './types';
import { decodeEntities, matchOne, stripTags, toAbsolute } from './html';

const HOST = 'wap.bookshuku.org';
const ORIGIN = `http://${HOST}`;

/** 章节/正文页标题回显，例如“第一章”，正文里出现时属重复，剔除。 */
const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;

function extractBookId(url: string): string | undefined {
  return matchOne(/\/(?:bookinfo|read|down|txt)\/(\d+)/, url);
}

/** 抽取并清洗单个正文子页的纯文本。 */
function cleanArticle(html: string): string {
  const block = matchOne(/<div class="articlecon[^"]*">([\s\S]*?)<\/div>/, html);
  if (!block) return '';
  const text = decodeEntities(
    block
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<div class="ad"[\s\S]*?<\/div>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n'),
  );
  // 去掉分页标记（含包裹它的中英文括号），例如 “(第1/3页)”“（第2/3页）”。
  return stripTags(text).replace(/[（(]?\s*第\d+\/\d+页\s*[)）]?/g, '');
}

/** 把多子页文本合并、逐行清洗、去掉开头的章节名回显。 */
function normalizeChapter(parts: string[]): string {
  const lines = parts
    .join('\n')
    .split('\n')
    .map(l => l.replace(/ /g, ' ').trim())
    .filter(l => l.length > 0);
  if (lines.length > 0 && lines[0].length < 40 && HEADING_RE.test(lines[0])) {
    lines.shift();
  }
  return lines.join('\n');
}

export const bookshukuSource: BookSource = {
  id: 'bookshuku',
  name: 'TXT图书下载网',
  host: HOST,

  matchUrl(url: string) {
    return /(^|\.)bookshuku\.org/i.test(url);
  },

  extractId(url: string) {
    return extractBookId(url);
  },

  detailUrl(id: string) {
    return `${ORIGIN}/bookinfo/${id}.html`;
  },

  async parseBookInfo(url: string): Promise<ParsedBookInfo> {
    const id = extractBookId(url);
    if (!id) throw new Error('无法从链接中识别书籍编号');
    const html = await fetchHtml(`${ORIGIN}/bookinfo/${id}.html`);

    const title =
      matchOne(/<div class="detail">[\s\S]*?<b>([\s\S]*?)<\/b>/, html)?.trim() ||
      matchOne(/<meta name="keywords" content="([^",]+)/, html)?.trim();
    if (!title) throw new Error('未能解析到书名，可能不是书籍详情页');

    const author = matchOne(/作者：<a[^>]*>([\s\S]*?)<\/a>/, html)?.trim() || '佚名';
    const rawCover = matchOne(/<div class="cover">\s*<img[^>]*src="([^"]+)"/, html);
    const cover = rawCover ? toAbsolute(ORIGIN, rawCover) : undefined;
    const description = matchOne(
      /<p class="intro">([\s\S]*?)<\/p>/,
      html,
    )?.trim();
    const status = matchOne(/状态：([^<]*)</, html)?.trim();

    return {
      sourceBookId: id,
      title,
      author,
      cover,
      description: description ? decodeEntities(description) : undefined,
      status,
      catalogUrl: `${ORIGIN}/read/${id}.html`,
    };
  },

  async parseCatalog(info: ParsedBookInfo): Promise<ParsedChapter[]> {
    const html = await fetchHtml(info.catalogUrl);
    const re = /<li><a href="([^"]*\/read\/\d+_\d+\.html)">([\s\S]*?)<\/a><\/li>/g;
    const chapters: ParsedChapter[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      chapters.push({
        url: toAbsolute(ORIGIN, m[1]),
        title: decodeEntities(stripTags(m[2])).trim(),
      });
    }
    if (chapters.length === 0) throw new Error('未能解析到章节目录');
    return chapters;
  },

  async parseChapterContent(url: string): Promise<string> {
    const firstHtml = await fetchHtml(url);
    const firstText = cleanArticle(firstHtml);
    const pageInfo = /第(\d+)\/(\d+)页/.exec(firstHtml);
    const totalPages = pageInfo ? parseInt(pageInfo[2], 10) : 1;

    const parts = [firstText];
    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetchHtml(url.replace(/\.html$/, `_${i + 2}.html`)).then(cleanArticle),
        ),
      );
      parts.push(...rest);
    }
    return normalizeChapter(parts);
  },
};
