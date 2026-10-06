/** 笔趣阁 bqquge.org：限定同书目录和同章递增子页，正文只取 con 容器。 */
import { fetchHtml } from '../http/fetchHtml';
import { decodeEntities, stripTags, toAbsolute } from './html';
import { cleanRenderedText } from '../browserFetch/bridge';
import { collectChapterPages } from './chapterPages';
import { isInvalidOnlineChapterContent } from './contentQuality';
import type { BookSource } from './types';
import { catalogNumberSummary } from '../../utils/catalogNumberSummary';

const ORIGIN = 'https://www.bqquge.org';
// 使用固定地址规则，避免 RN 内置 URL 给数字地址加斜杠或错误拼接相对链接。
function route(url: string) {
  const match =
    /^https?:\/\/(?:www\.)?bqquge\.org\/(\d+)(?:\/(\d+)(?:-(\d+))?)?\/?(?:[?#].*)?$/i.exec(
      url,
    );
  return match
    ? { bookId: match[1], chapterId: match[2], page: Number(match[3] || 1) }
    : null;
}
function links(html: string) {
  return Array.from(
    html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ).map(match => ({
    url: toAbsolute(ORIGIN, decodeEntities(match[1])),
    title: decodeEntities(stripTags(match[2])).trim(),
  }));
}
function plain(html: string) {
  // 脚本、嵌入广告和样式不参与正文；仅转成纯文本，绝不运行站点脚本。
  return decodeEntities(
    stripTags(
      html
        .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/?p\b[^>]*>|<br\s*\/?>/gi, '\n'),
    ),
  ).trim();
}
async function page(url: string) {
  const current = route(url);
  if (!current?.chapterId) throw new Error('章节地址无效');
  const html = await fetchHtml(url, 12000);
  const body = /<div\b[^>]*class=["']con["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    html,
  )?.[1];
  const title =
    body && plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] || '');
  if (!body || !title) throw new Error('未解析到正文和章节标题');
  const content = cleanRenderedText(
    plain(body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, '')),
    title,
  );
  const nav = /<div\b[^>]*class=["']prenext["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    html,
  )?.[1];
  if (!nav) throw new Error('章节导航缺失');
  const next = links(nav).find(link => /^下一[页頁]$/.test(link.title));
  let nextPageUrl: string | undefined;
  if (next) {
    const target = route(next.url);
    // 不同章节以及倒退/跳页都算异常，不能缓存为已读完，也不能串进其他章节。
    if (
      !target ||
      target.bookId !== current.bookId ||
      target.chapterId !== current.chapterId ||
      target.page !== current.page + 1
    )
      throw new Error('章节续页归属或页序异常');
    nextPageUrl = next.url;
  }
  if (!content) throw new Error('正文为空');
  return { content, title, nextPageUrl };
}
export const bqqugeSource: BookSource = {
  id: 'bqquge',
  name: '笔趣阁（bqquge）',
  host: 'www.bqquge.org',
  homeUrl: `${ORIGIN}/`,
  preferDirectImport: true,
  matchUrl: url => !!route(url),
  extractId: url => route(url)?.bookId,
  detailUrl: id => `${ORIGIN}/${id}`,
  async parseBookInfo(url) {
    const id = route(url)?.bookId;
    if (!id) throw new Error('无法识别书号');
    const catalogUrl = this.detailUrl(id);
    const html = await fetchHtml(catalogUrl, 12000);
    const title = plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '');
    const author = /作者[：:]\s*([^<]+)/.exec(html)?.[1];
    if (!title || !author) throw new Error('书名或作者缺失');
    const cover =
      /<div\b[^>]*class=["']bookdetail["'][^>]*>\s*<img\b[^>]*src=["']([^"']+)/i.exec(
        html,
      )?.[1];
    return {
      sourceBookId: id,
      title,
      author: decodeEntities(author).trim(),
      catalogUrl,
      cover: cover ? toAbsolute(ORIGIN, cover) : undefined,
      description: plain(
        /<div\b[^>]*class=["']des["'][^>]*>([\s\S]*?)<\/div>/i.exec(
          html,
        )?.[1] || '',
      ),
    };
  },
  async parseCatalog(info) {
    const html = await fetchHtml(this.detailUrl(info.sourceBookId), 12000);
    // 最新章节和推荐区都含阅读链接，只接受明确的全文目录容器，保留上/下篇真实标题。
    const body = /<div\b[^>]*id=["']list["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1];
    if (!body) throw new Error('全文目录缺失');
    const seen = new Set<string>();
    const chapters = links(body).filter(link => {
      const target = route(link.url);
      if (
        !target?.chapterId ||
        target.bookId !== info.sourceBookId ||
        target.page !== 1 ||
        !link.title ||
        seen.has(link.url)
      )
        return false;
      seen.add(link.url);
      return true;
    });
    if (!chapters.length) throw new Error('目录为空');
    // 只拦截明显残目录；上下篇、合章和少量原站跳号仍可导入，不凭数组条数推算原文章数。
    const numbers = catalogNumberSummary(chapters);
    if (
      numbers.maxNumber >= 20 &&
      numbers.coveredNumbers < numbers.maxNumber * 0.5
    )
      throw new Error('目录章号覆盖不足，请核对完整目录');
    // 最新章区域已给出确定的章地址时，完整目录必须包含它；避免截短/降级目录被正常入库。
    const newest =
      /<div\b[^>]*class=["']newest["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
    const latestLink =
      newest &&
      links(newest).find(
        link =>
          route(link.url)?.bookId === info.sourceBookId &&
          !!route(link.url)?.chapterId,
      );
    if (
      latestLink &&
      !chapters.some(
        chapter =>
          route(chapter.url)?.chapterId === route(latestLink.url)?.chapterId,
      )
    )
      throw new Error('完整目录缺少网站最新章');
    return chapters;
  },
  async parseChapterContent(url) {
    const first = await page(url);
    if (isInvalidOnlineChapterContent(first.content))
      throw new Error('正文无效');
    const merged = await collectChapterPages({
      firstPageUrl: url,
      firstContent: first.content,
      firstNextPageUrl: first.nextPageUrl,
      fetchPage: page,
      cleanPage: text => text,
    });
    return { ...merged, title: first.title, complete: !merged.nextPageUrl };
  },
};
