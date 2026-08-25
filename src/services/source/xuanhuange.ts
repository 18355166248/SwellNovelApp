/**
 * 书源：玄幻阁（wap.xuanhuange.info，手机版）。
 *
 * 与 bookshuku / 明智屋不同，这里不为本站另写一套 HTML 选择器，而是复用内置浏览器
 * 识别器与正文桥：它们已经在本站点跑通（此前用户正是靠“网页 / 链接导入”读这个站），
 * 站点改版时只需维护那一份通用启发式，不必两处同步。注册成书源后，本站可以直接参与
 * 全网搜索、粘贴链接添加，不再需要用户手动打开网页点“识别本页目录”。
 *
 * 站点路由（其余结构交给通用提取器判断）：
 * - 详情页 /info-{id}/：只有书籍资料，没有章节锚点，取目录须换算到目录页。
 * - 目录页 /wapbook-{id}/，分页 /wapbook-{id}-{page}/，页内标注“第 N/M 页”。
 * - 正文页 /read/{id}/{cid}.html，章内分页 /read/{id}/{cid}_{page}.html，页尾给出“下一页”。
 */

import {
  cleanRenderedText,
  fetchRenderedChapterPage,
  fetchRenderedHtml,
} from '../browserFetch/bridge';
import {
  expandRecognizedCatalog,
  recognizeBookHtml,
} from '../recognize/recognizer';
import { collectChapterPages } from './chapterPages';
import { isInvalidOnlineChapterContent } from './contentQuality';
import {
  BookSource,
  ParseChapterOptions,
  ParsedBookInfo,
  ParsedChapter,
  ParsedChapterContent,
} from './types';

const HOST = 'wap.xuanhuange.info';
const ORIGIN = `http://${HOST}`;

/**
 * 目录为静态 HTML，1.2 秒足够首屏渲染完成；长目录要逐页抓 20 多页，
 * 更长的等待会让整本导入慢到不可接受。与内置浏览器导入用的参数保持一致。
 */
const CATALOG_FETCH = {
  waitMs: 1200,
  timeout: 20000,
  priority: 'high',
} as const;

function catalogUrl(id: string): string {
  return `${ORIGIN}/wapbook-${id}/`;
}

const xuanhuangeSource: BookSource = {
  id: 'xuanhuange',
  name: '玄幻阁',
  host: HOST,

  matchUrl(url: string): boolean {
    try {
      return /(^|\.)xuanhuange\.info$/i.test(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  extractId(url: string): string | undefined {
    return (
      /\/info-(\d+)/i.exec(url)?.[1] ||
      /\/wapbook-(\d+)/i.exec(url)?.[1] ||
      /\/read\/(\d+)\//i.exec(url)?.[1]
    );
  },

  detailUrl(id: string): string {
    return `${ORIGIN}/info-${id}/`;
  },

  async parseBookInfo(url: string): Promise<ParsedBookInfo> {
    const id = this.extractId(url);
    if (!id) throw new Error('无法从该链接识别玄幻阁书号');
    const detail = this.detailUrl(id);
    const html = await fetchRenderedHtml(detail, CATALOG_FETCH);
    // 详情页没有章节锚点，这里只取书名/作者/封面；isDetail 由目录页判定。
    const recognized = recognizeBookHtml(html, detail);
    if (!recognized.title) {
      throw new Error('玄幻阁详情页解析失败：未取到书名');
    }
    return {
      sourceBookId: id,
      title: recognized.title,
      author: recognized.author || '佚名',
      cover: recognized.cover,
      catalogUrl: catalogUrl(id),
    };
  },

  async parseCatalog(info: ParsedBookInfo): Promise<ParsedChapter[]> {
    const url = info.catalogUrl || catalogUrl(info.sourceBookId);
    const html = await fetchRenderedHtml(url, CATALOG_FETCH);
    const first = recognizeBookHtml(html, url);
    if (first.chapters.length === 0) {
      throw new Error('玄幻阁目录解析失败：未识别到章节，请稍后重试');
    }
    // 目录按每页若干章分页；expandRecognizedCatalog 逐页抓取并要求每页都成功，
    // 避免只导入第一页就让用户以为整本已加入。
    const expanded = await expandRecognizedCatalog(first, pageUrl =>
      fetchRenderedHtml(pageUrl, CATALOG_FETCH),
    );
    return expanded.chapters.map(chapter => ({
      title: chapter.title,
      url: chapter.url,
    }));
  },

  async parseChapterContent(
    url: string,
    options: ParseChapterOptions = {},
  ): Promise<ParsedChapterContent> {
    const priority = options.priority ?? 'normal';
    const firstPage = await fetchRenderedChapterPage(url, { priority });
    const firstContent = cleanRenderedText(firstPage.content);
    if (isInvalidOnlineChapterContent(firstContent)) {
      throw new Error('玄幻阁正文解析失败：内容不完整');
    }
    // 一章被拆成多个网页子页时一次读完，阅读器拿到的就是完整章节。
    const merged = await collectChapterPages({
      firstContent,
      firstNextPageUrl: firstPage.nextPageUrl,
      fetchPage: pageUrl => fetchRenderedChapterPage(pageUrl, { priority }),
      cleanPage: raw => cleanRenderedText(raw),
    });
    return {
      content: merged.content,
      nextPageUrl: merged.nextPageUrl,
      complete: !merged.nextPageUrl,
    };
  },
};

export { xuanhuangeSource };
