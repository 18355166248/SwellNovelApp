import { throwIfAborted } from '../../utils/abort';
/**
 * 书源：明智屋中文网（www.mingzw.net，手机版）。
 *
 * 页面结构（已实测，UTF-8）：
 * - 详情页 /mibook/{id}.html（旧版）或 /mzwbook/{id}.html（当前版）：书名、作者、封面、
 *   简介 <div class="desc">、状态；当前完整目录直接位于 /mzwchapter/{id}.html，
 *   兼容旧版按每 100 章分段的 /mclist/{id}_{start}_{end}.html。
 * - 目录分段页 /mclist/{id}_{start}_{end}.html：<a href="/miread 或 /mzwread/{id}_{cid}.html">第N章 标题</a>。
 * - 正文页 /miread 或 /mzwread/{id}_{cid}.html：正文在 #content 或 .contents 内，段落用 <p> 分隔，
 *   单页无分页；开头有 SEO 面包屑 / 章节名回显 / ←→ 导航等噪声行需剔除。
 */

import { fetchHtml } from '../http/fetchHtml';
import { fetchRenderedHtml } from '../browserFetch/bridge';
import {
  BookSource,
  ParsedBookInfo,
  ParseChapterOptions,
  ParsedChapter,
  ParsedChapterContent,
} from './types';
import { decodeEntities, matchOne, stripTags, toAbsolute } from './html';
import { isInvalidOnlineChapterContent } from './contentQuality';
import { stripContentNoise } from './contentNoise';
import { sanitizeBookDescription } from '../../utils/bookDescription';

const HOST = 'www.mingzw.net';
// www 节点在部分国内云服务器上会被解析到不可达地址；繁体站保留同一书库与目录结构，
// 优先走它以保障真机可添加，失败时再回退主站。
const ORIGINS = ['https://tw.mingzw.net', 'https://www.mingzw.net'] as const;
const ORIGIN = ORIGINS[0];
const PAGE_TIMEOUT_MS = 15000;

const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;

function extractBookId(url: string): string | undefined {
  return (
    matchOne(/\/(?:mibook|mzwbook|mclist|mzwchapter)\/(\d+)/, url) ||
    matchOne(/\/(?:miread|mzwread)\/(?:[^/]*_)?(\d+)_\d+/, url)
  );
}

/**
 * 真机蜂窝网与代理服务器的 DNS/线路可能不同：设备可达时应直接读取，不能强制等待代理。
 * fetchHtml 会在直连失败后尝试白名单代理；两条链路均失败才交给 WebView，TLS 正常校验。
 */
async function fetchMingzwHtml(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  throwIfAborted(options.signal);
  try {
    return await fetchHtml(url, PAGE_TIMEOUT_MS, {
      signal: options.signal,
    });
  } catch (fetchError) {
    throwIfAborted(options.signal);
    // 公网 curl 代理故障时，真机仍可用隐藏 WebView 完成站点挑战并取最终 DOM。
    // 不把代理作为唯一可用链路，否则一次服务端 502 会让整个书源全部不可读。
    try {
      return await fetchRenderedHtml(url, {
        signal: options.signal,
        timeout: 35000,
        waitMs: 6000,
        priority: 'high',
      });
    } catch (webViewError) {
      throwIfAborted(options.signal);
      throw new Error(
        `明智屋页面加载失败：${
          webViewError instanceof Error
            ? webViewError.message
            : fetchError instanceof Error
            ? fetchError.message
            : String(webViewError)
        }`,
      );
    }
  }
}

async function fetchBookInfoHtml(id: string): Promise<{
  html: string;
  origin: string;
}> {
  let lastError: unknown;
  for (const origin of ORIGINS) {
    try {
      return {
        html: await fetchMingzwHtml(`${origin}/mzwbook/${id}.html`),
        origin,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('明智屋书籍页暂不可达');
}

/**
 * 从指定 div 开始按标签深度寻找真正的闭合位置。正文里会插入广告 div，非贪婪
 * 正则会在第一个广告闭合处截断，表现为每章永远只有一页。
 */
function extractNestedDiv(html: string, openingPattern: RegExp): string {
  const opening = openingPattern.exec(html);
  if (!opening || opening.index == null) return '';
  const contentStart = opening.index + opening[0].length;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html)) !== null) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(contentStart, tag.index);
  }
  return '';
}

/** 抽取正文页纯文本：取正文容器，保留段落换行，剔除开头 SEO/标题噪声。 */
function cleanArticle(html: string): string {
  const block =
    extractNestedDiv(html, /<div[^>]*\bid=["']content["'][^>]*>/i) ||
    extractNestedDiv(
      html,
      /<div[^>]*\bclass=["'][^"']*\bcontents?\b[^"']*["'][^>]*>/i,
    );
  if (!block) return '';
  // 当前 PC/繁体正文把推荐书单和翻章工具放进 contents；只在本站完整水印处截断，
  // 不能按「新書推薦」几个字截断，以免小说叙述中提到推荐就丢失后半章。
  const footer =
    /(?:^|\n)\s*新[书書]推[荐薦][：:][^\r\n<]{0,200}明智屋[^\r\n<]{0,100}mingzw\.net/i.exec(
      block,
    );
  const article = footer ? block.slice(0, footer.index) : block;
  const text = decodeEntities(
    article
      .replace(/&(?:larr|rarr);/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<ins[\s\S]*?<\/ins>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<\/div\s*>/gi, '\n'),
  );
  const lines = stripTags(text)
    .split('\n')
    .map(l => l.replace(/ /g, ' ').replace(/[←→]/g, '').trim())
    .filter(l => l.length > 0);

  // 剔除开头噪声：SEO 面包屑（含“频道/文学”下划线串）、章节名回显。只在开头连续剔除，
  // 避免误删正文中偶发的“第N章”。
  let start = 0;
  while (
    start < lines.length &&
    start < 4 &&
    (/频道|_.*文学|文学$/.test(lines[start]) ||
      /^_.{1,150}_$/.test(lines[start]) ||
      /^[:：,，、|\s]+$/.test(lines[start]) ||
      HEADING_RE.test(lines[start]))
  ) {
    start++;
  }
  return stripContentNoise(lines.slice(start).join('\n'));
}

function alternateMingzwUrls(url: string): string[] {
  const urls = [url];
  try {
    const parsed = new URL(url);
    for (const origin of ORIGINS) {
      const candidate = `${origin}${parsed.pathname}${parsed.search}`;
      if (!urls.includes(candidate)) urls.push(candidate);
    }
  } catch {
    // 非标准 URL 交给原请求报错，不能在这里拼出不可控地址。
  }
  return urls;
}

export const mingzwSource: BookSource = {
  id: 'mingzw',
  name: '明智屋中文网',
  host: HOST,
  // www 节点在部分网络不可达，浏览入口沿用解析时优先的繁体站。
  homeUrl: `${ORIGIN}/`,
  // 当前静态详情/完整目录已验证；网页目录不带封面，导入时补取详情并保留专用正文解析。
  preferDirectImport: true,

  matchUrl(url: string) {
    return /(^|\.)mingzw\.net/i.test(url);
  },

  extractId(url: string) {
    return extractBookId(url);
  },

  detailUrl(id: string) {
    return `${ORIGIN}/mzwbook/${id}.html`;
  },

  async parseBookInfo(url: string): Promise<ParsedBookInfo> {
    const id = extractBookId(url);
    if (!id) throw new Error('无法从链接中识别书籍编号');
    const { html, origin } = await fetchBookInfoHtml(id);

    // 当前繁体站的 h1 是 Logo，书名在 novel-name；不能把站名当书名，也要兼容「最新章節」。
    const title = [
      matchOne(
        /<(?:i|h1|h2|strong)[^>]*class=["'][^"']*\bnovel-name\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:i|h1|h2|strong)>/i,
        html,
      ),
      matchOne(
        /<h1(?![^>]*class=["'][^"']*\blogo\b)[^>]*>([\s\S]*?)<\/h1>/i,
        html,
      ),
      matchOne(/<title>\s*(.*?)最新章[节節]/i, html),
      matchOne(/《([^《》]+)》最新章[节節]/i, html),
    ]
      .map(
        candidate =>
          candidate &&
          decodeEntities(stripTags(candidate))
            .trim()
            .replace(/^《(.+)》$/, '$1'),
      )
      .find(Boolean);
    if (!title) throw new Error('未能解析到书名，可能不是书籍详情页');

    const author =
      matchOne(
        /作者\s*[：:]\s*(?:<[^>]+>\s*)*<a[^>]*>([^<]+)<\/a>/,
        html,
      )?.trim() || '佚名';
    const rawCover =
      matchOne(/<div class="cover">[\s\S]*?<img[^>]+src="([^"]+)"/, html) ||
      matchOne(
        new RegExp(
          String.raw`<img[^>]+src=["']([^"']*/images/mzwid/${id}\.[^"']+)["']`,
          'i',
        ),
        html,
      );
    const cover = rawCover ? toAbsolute(origin, rawCover) : undefined;
    // 新版简介内部还有标题 div；按嵌套深度读取正文，避免只得到「作品介紹」。
    const descBlock = extractNestedDiv(
      html,
      /<div[^>]*class=["'][^"']*\bdesc\b[^"']*["'][^>]*>/i,
    );
    const description =
      extractNestedDiv(
        descBlock,
        /<div[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>/i,
      ) || descBlock;
    const status =
      matchOne(/状态[：:]\s*(?:<[^>]+>\s*)?([^<\n]{1,8})/, html)?.trim() ||
      matchOne(
        /<(?:i|span)[^>]*class=["'][^"']*\bstatus\b[^"']*["'][^>]*>([^<]+)<\/(?:i|span)>/i,
        html,
      )?.trim();

    return {
      sourceBookId: id,
      title: decodeEntities(title),
      author: decodeEntities(author),
      cover,
      description: description
        ? sanitizeBookDescription(decodeEntities(stripTags(description)).trim())
        : undefined,
      status,
      // 当前站点的完整目录入口是 mzwchapter；详情页只展示最新章节。
      catalogUrl: `${origin}/mzwchapter/${id}.html`,
    };
  },

  async parseCatalog(
    info: ParsedBookInfo,
    options: ParseChapterOptions = {},
  ): Promise<ParsedChapter[]> {
    const catalogUrl = /\/mzwchapter\/\d+\.html/i.test(info.catalogUrl)
      ? info.catalogUrl
      : `${ORIGIN}/mzwchapter/${info.sourceBookId}.html`;
    const origin = new URL(catalogUrl).origin;
    const detail = await fetchMingzwHtml(catalogUrl, options);
    // 目录按每 100 章分段：取完整目录页里的各分段链接，按起始序号排序后逐段抓取。
    const segments = Array.from(
      detail.matchAll(/\/mclist\/(\d+)_(\d+)_(\d+)\.html/g),
      m => ({ id: m[1], url: m[0], start: Number(m[2]), end: Number(m[3]) }),
    )
      .filter(segment => segment.id === info.sourceBookId)
      .sort((a, b) => a.start - b.start);
    // 分段索引若缺了中间范围，即使其余页面非空也不是完整目录，不能发布入库。
    if (
      segments.some(
        (segment, index) =>
          segment.end <= segment.start ||
          (index === 0
            ? segment.start > 1
            : segment.start > segments[index - 1].end),
      )
    )
      throw new Error('目录分段不连续，请刷新后重试');
    const segUrls = Array.from(new Set(segments.map(s => s.url)));
    // 兜底：若详情页没有分段链接（章节很少），直接用 /mclist/{id}.html。
    const pages =
      segUrls.length > 0 ? segUrls : [`/mclist/${info.sourceBookId}.html`];

    // 分段响应可能是广告页或其他书籍目录；HTTP 成功不等于目录解析成功。
    // 每段都验证本书章节，失败时换镜像重试，不能把空段拼成“成功”的残目录。
    const parsePage = (html: string): ParsedChapter[] => {
      const chapters: ParsedChapter[] = [];
      const seen = new Set<string>();
      const re =
        /<a[^>]+href=["']([^"']*\/(?:miread|mzwread)\/(?:[^"'/]*_)?\d+_\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
      for (const match of html.matchAll(re)) {
        const url = toAbsolute(origin, match[1]);
        const title = decodeEntities(stripTags(match[2])).trim();
        let validHost = false;
        try {
          validHost = /(^|\.)mingzw\.net$/i.test(new URL(url).hostname);
        } catch {
          /* 非法链接不能入库。 */
        }
        if (
          !validHost ||
          extractBookId(url) !== info.sourceBookId ||
          !title ||
          /^(?:目录|目錄|首页|首頁|上一[章页頁]|下一[章页頁]|返回书页|返回書頁)$/.test(
            title,
          )
        )
          continue;
        const identity = /_(\d+)\.html$/.exec(new URL(url).pathname)![1];
        if (seen.has(identity)) continue;
        seen.add(identity);
        chapters.push({ url, title });
      }
      return chapters;
    };
    // 当前目录直接列出全部章节，不必再请求旧版 mclist；有分段索引时仍逐段校验。
    if (!segUrls.length) {
      const direct = parsePage(detail);
      if (direct.length) return direct;
    }
    const pageChapters = new Array<ParsedChapter[]>(pages.length);
    let nextPageIndex = 0;
    let failed = false;
    // 最多三路并发，输出仍按分段顺序；任何分段最终失败都阻止入库。
    await Promise.all(
      Array.from({ length: Math.min(3, pages.length) }, async () => {
        while (!failed && nextPageIndex < pages.length) {
          const index = nextPageIndex++;
          try {
            let parsed: ParsedChapter[] = [];
            let lastError: unknown;
            for (const candidate of alternateMingzwUrls(
              toAbsolute(origin, pages[index]),
            )) {
              try {
                parsed = parsePage(await fetchMingzwHtml(candidate, options));
                if (parsed.length) break;
                lastError = new Error('未识别到本书章节');
              } catch (error) {
                throwIfAborted(options.signal);
                lastError = error;
              }
            }
            if (!parsed.length)
              throw new Error(
                `目录第 ${index + 1} 段加载失败：${
                  lastError instanceof Error ? lastError.message : '解析失败'
                }`,
              );
            pageChapters[index] = parsed;
          } catch (error) {
            failed = true;
            throw error;
          }
        }
      }),
    );
    const chapters: ParsedChapter[] = [];
    const seen = new Set<string>();
    for (const page of pageChapters) {
      const countBeforePage = chapters.length;
      for (const chapter of page) {
        // 同一章可同时出现 miread/mzwread 地址；用站内章节号去重，并保留感言、序章等无章号条目。
        const identity = /_(\d+)\.html$/.exec(
          new URL(chapter.url).pathname,
        )![1];
        if (seen.has(identity)) continue;
        seen.add(identity);
        chapters.push(chapter);
      }
      // 站点忽略分段参数、重复返回首页时也会有章节，但不能把它当成成功的后续分段。
      if (chapters.length === countBeforePage)
        throw new Error('目录分段重复，请刷新后重试');
    }
    if (chapters.length === 0) throw new Error('未能解析到章节目录');
    return chapters;
  },

  async parseChapterContent(
    url: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<ParsedChapterContent> {
    let lastError: unknown;
    for (const candidate of alternateMingzwUrls(url)) {
      try {
        const content = cleanArticle(await fetchMingzwHtml(candidate, options));
        if (isInvalidOnlineChapterContent(content)) {
          throw new Error(`正文不完整（${content.length} 字）`);
        }
        return { content, complete: true };
      } catch (error) {
        throwIfAborted(options.signal);
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('明智屋章节正文暂不可用');
  },
};
