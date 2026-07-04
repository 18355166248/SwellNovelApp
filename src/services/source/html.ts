/**
 * 轻量 HTML 解析工具（纯正则，无 DOM）。
 *
 * RN 没有 DOMParser / cheerio，小说站点的 HTML 结构简单且稳定，用正则抽取
 * 关键片段足够可靠，同时保持零依赖、Web/原生通用。
 */

/** 取第一个捕获组；未命中返回 undefined。 */
export function matchOne(re: RegExp, html: string): string | undefined {
  const m = re.exec(html);
  return m ? m[1] : undefined;
}

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&hellip;': '…',
  '&mdash;': '—',
};

/** 解码常见 HTML 实体，含数字实体（&#123; / &#x1F;）。 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(
      /&[a-zA-Z]+;|&#39;/g,
      entity => ENTITY_MAP[entity] ?? entity,
    );
}

/** 去除所有 HTML 标签（不做实体解码）。 */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** 相对/协议相对/绝对 href 归一化为绝对 URL。 */
export function toAbsolute(base: string, href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const m = /^(https?:)\/\/([^/]+)/i.exec(base);
  if (!m) return trimmed;
  const origin = `${m[1]}//${m[2]}`;
  if (trimmed.startsWith('//')) return `${m[1]}${trimmed}`;
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}
