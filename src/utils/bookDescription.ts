import { decodeEntities, stripTags } from '../services/source/html';

const PROMOTION_MARKERS = [
  /bookdown\s*小说下载网/i,
  /TXT图书下载网[^，。！？]{0,36}(?:最新|最快|最全|免费)/i,
  /(?:本站|本网站)[^，。！？]{0,36}(?:最新|最快|最全|免费)(?:小说|电子书)/i,
  /免费提供\s*txt(?:图书|电子书|小说)/i,
] as const;

/**
 * 书源简介偶尔会把站点宣传拼在作品文案后。展示前再做一次保守清理，既兼容
 * 已经落盘的旧数据，也避免把抓取站的广告误当成作品简介。
 */
export function sanitizeBookDescription(value?: string): string | undefined {
  if (!value) return undefined;

  // 旧书架数据可能保存了原始或实体转义的 HTML；先还原段落，再清理横向空白，
  // 不能用 \s+ 把有意义的换行压平，也无需为简介挂载 WebView。
  let description = stripTags(
    decodeEntities(value)
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:p|div|section|li)\s*>/gi, '\n\n'),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^(?:内容)?简介\s*[：:]\s*/i, '');

  let promotionStart = description.length;
  for (const marker of PROMOTION_MARKERS) {
    const match = marker.exec(description);
    if (match && match.index >= 0) {
      promotionStart = Math.min(promotionStart, match.index);
    }
  }

  description = description
    .slice(0, promotionStart)
    .replace(/[\s，、；;—-]+$/g, '')
    .trim();

  return description.length >= 8 ? description : undefined;
}
