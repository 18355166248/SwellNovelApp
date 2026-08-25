/**
 * 正文噪声清理的单一来源。
 *
 * 免费小说站会把站点水印、翻页引导直接排进正文段落里，例如
 * “(本章未完, 请点击下一页继续阅读)”“最新网址:wap.xuanhuange.info”。
 * 各站措辞相近，但括号、逗号、全半角常有出入——bookshuku 原先写死了全角逗号
 * 的两条正则，遇到半角写法就漏网，浏览器识别源更是一条都没有。规则统一放在
 * 这里：加一条即对所有书源与浏览器识别源同时生效，不必在各解析器里各写一份。
 *
 * 清理对读者不可见、也不做成开关：这些是站点垃圾而非作品内容，没有保留价值，
 * 开关只会把「要不要看广告」这种无意义的选择推给用户。误删风险靠两点控制——
 * 规则必须带站点水印特征词，且整行规则限制行长。
 *
 * ## 维护指南
 *
 * 新增一条规则：
 * 1. 选类型：整行都是垃圾放 LINE_RULES；混在正文行里、删掉后本行还剩正文的
 *    放 FRAGMENT_RULES。
 * 2. 追加一条，写清 id 与 note（哪个站点、原文长什么样），便于日后判断这条
 *    还需不需要、能不能合并。
 * 3. 到 __tests__/contentNoise.test.ts 补用例。除了正例，**必须**再补一条形近
 *    的真实正文，确认它不会被误删——这是这类规则最容易出事的地方。
 * 4. 提升 contentQuality 里的 ONLINE_CONTENT_VERSION 与 BROWSER_CONTENT_VERSION，
 *    否则已经落盘的正文不会按新规则重抓，用户重读旧章节仍会看到噪声。
 *
 * 排查“某段正文被谁删掉了”：开发期每次命中都会打一条 [contentNoise] 日志，
 * 带规则 id 与被删片段，按 id 回到本文件即可定位。
 */

import { devInfo } from '../../utils/devLog';

/** 噪声行允许的最大长度：站点水印都很短，正文长段落不该被整行规则命中。 */
const MAX_NOISE_LINE_LENGTH = 80;

interface NoiseRule {
  /** 规则标识，出现误删时按它定位回本文件。 */
  id: string;
  /** 针对哪个站点的什么文案。 */
  note: string;
  pattern: RegExp;
}

/** 整行命中即删除。 */
const LINE_RULES: readonly NoiseRule[] = [
  {
    id: 'latest-url',
    note: '玄幻阁等站排在章节尾部的“最新网址:wap.xuanhuange.info”',
    pattern: /^(?:本书|本站)?最新(?:网址|地址|域名)\s*[:：]/,
  },
  {
    id: 'remember-site',
    note: '“记住本站网址：xxx”“请记住本站地址：xxx”',
    pattern: /^(?:请)?记住本站(?:网址|地址|域名)?\s*[:：]?\S/,
  },
  {
    id: 'one-second-remember',
    note: '“天才一秒记住本站地址”类推广行',
    pattern: /^(?:天才)?一秒记住/,
  },
  {
    id: 'mobile-read-url',
    note: '“手机版阅读网址：m.xxx.com”',
    pattern: /^(?:手机|电脑)版?阅读(?:网址|地址)\s*[:：]/,
  },
  {
    id: 'site-url',
    note: '“本站网址：xxx”',
    pattern: /^本站(?:网址|地址|域名)\s*[:：]/,
  },
  {
    id: 'bare-url',
    note: '整行只剩域名或链接的水印，如“wap.xuanhuange.info”',
    pattern:
      /^(?:https?:\/\/)?(?:[\w-]+\.)+(?:com|net|org|info|cc|xyz|top|vip|club|me|la|tv)(?:\/\S*)?$/i,
  },
  {
    id: 'chapter-unfinished-line',
    note: '片段规则未覆盖的翻页提示变体，整行兜底',
    pattern: /^本章未完/,
  },
];

/** 从正文行里剔除的片段：删掉后这一行剩下的仍是正文。 */
const FRAGMENT_RULES: readonly NoiseRule[] = [
  {
    id: 'chapter-unfinished',
    note: '“(本章未完, 请点击下一页继续阅读)”，括号/逗号/空格各站写法不一',
    pattern:
      /[（(【[]?\s*本章未完[,，]?\s*(?:请)?\s*点击下一页(?:继续阅读)?\s*[)）】\]]?/g,
  },
  {
    id: 'page-indicator',
    note: '分页页码标记“(第1/3页)”“第 2 / 3 页”',
    pattern: /[（(【[]?\s*第\s*\d+\s*\/\s*\d+\s*页\s*[)）】\]]?/g,
  },
];

function reportHit(rule: NoiseRule, sample: string): void {
  devInfo('[contentNoise] 命中规则', {
    id: rule.id,
    note: rule.note,
    sample: sample.slice(0, 40),
  });
}

/** 整行是否为站点水印/提示，命中则应从正文中删除。 */
export function isNoiseLine(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > MAX_NOISE_LINE_LENGTH) return false;
  const hit = LINE_RULES.find(rule => rule.pattern.test(value));
  if (!hit) return false;
  reportHit(hit, value);
  return true;
}

/** 剔除行内噪声片段，返回清理后的该行（可能变成空串）。 */
export function stripNoiseFragments(line: string): string {
  let value = line;
  for (const rule of FRAGMENT_RULES) {
    // 用替换前后是否变化判断命中：pattern 带 g 标志，test 会受 lastIndex 影响。
    const next = value.replace(rule.pattern, '');
    if (next !== value) reportHit(rule, value);
    value = next;
  }
  return value;
}

/** 按行清理整段正文：先剔除行内片段，再丢弃整行噪声与清空后的空行。 */
export function stripContentNoise(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => stripNoiseFragments(line).trim())
    .filter(line => line.length > 0 && !isNoiseLine(line))
    .join('\n');
}
