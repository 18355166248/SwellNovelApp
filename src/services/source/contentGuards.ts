/**
 * 书源脏数据判定的单一来源。
 *
 * 书源站点在 Cloudflare 降级或移动页会塞成人广告卡片、拦截提示页,目录降级时还会
 * 给出“分节阅读 N”“恭喜”之类占位标题。这些特征词/正则原先散落在书源解析器、
 * WebView 桥和阅读器里各写一份,站点一改文案就得多处同步。统一到这里,改一处即可。
 */

/** 章节名回显正则:正文或标题以“第X章/节/回/卷”开头时视为章节名。 */
export const HEADING_RE = /^第[零一二三四五六七八九十百千两万0-9]+[章节回卷]/;

/** 成人广告/拦截页特征词,按压缩去空白后的文本匹配。 */
const BLOCKED_KEYWORDS =
  /外围名媛|福利姬|自慰|口交|成人视频|性感女性|访问权限|立即下载|约爱社区/;

/** 拦截提示页 / 广告卡片正文的整体特征,命中说明不是真正的章节正文。 */
export function isBlockedText(text?: string): boolean {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, '');
  return (
    /请在浏览器中打开/.test(text) ||
    /当前环境无法直接下载/.test(text) ||
    /点击右上角.*按钮/.test(text) ||
    /复制链接到浏览器/.test(text) ||
    /Just a moment/i.test(text) ||
    /Enable JavaScript and cookies/i.test(text) ||
    BLOCKED_KEYWORDS.test(normalized) ||
    /👁️/.test(text)
  );
}

/** 站点降级时冒充章节名的坏标题(恭喜/广告卡片名等),不能作为真实章节名入库。 */
export const BAD_TITLE_CANDIDATES = new Set([
  '恭喜',
  '恭喜!',
  '恭喜！',
  '心动时刻',
  '温馨提醒',
  '漫画主页',
  '外围名媛',
  '约爱社区',
  '👏💦约爱社区',
]);

const BAD_TITLE_RE =
  /^(恭喜!?|恭喜！|心动时刻|温馨提醒|漫画主页|外围名媛|约爱社区|👏💦约爱社区)$/;

/** 判断标题整体是否为坏标题(用于展示层剔除)。 */
export function isBadChapterTitle(title: string): boolean {
  return BAD_TITLE_RE.test(title);
}
