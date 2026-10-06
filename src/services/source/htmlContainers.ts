/** 静态解析先移除脚本，避免广告 JS 字符串里的 div 标签干扰容器配对；不执行任何脚本。 */
export function removeNonContentElements(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
}

/** 按嵌套深度取 div，不能用遇到第一个 </div> 就停止的正则，否则嵌入广告会截掉后半段正文。 */
export function findDivBlock(
  html: string,
  attribute: 'id' | 'class',
  token: string,
) {
  const openings = /<div\b[^>]*>/gi;
  let opening: RegExpExecArray | null;
  while ((opening = openings.exec(html))) {
    const value = new RegExp(
      `\\b${attribute}\\s*=\\s*["']([^"']*)["']`,
      'i',
    ).exec(opening[0])?.[1];
    if (
      !value ||
      !(attribute === 'class'
        ? value.split(/\s+/).includes(token)
        : value === token)
    )
      continue;
    const innerStart = opening.index + opening[0].length;
    const tags = /<\/?div\b[^>]*>/gi;
    tags.lastIndex = innerStart;
    let depth = 1,
      tag: RegExpExecArray | null;
    while ((tag = tags.exec(html))) {
      depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
      if (depth === 0)
        return {
          start: opening.index,
          end: tags.lastIndex,
          inner: html.slice(innerStart, tag.index),
        };
    }
    return undefined;
  }
  return undefined;
}

/** 仅移除明确标记的广告块；普通正文段落和容器保留，不根据题材关键词删小说内容。 */
export function removeMarkedAdBlocks(html: string): string {
  let result = removeNonContentElements(html);
  for (const token of ['ad', 'ads', 'adbox', 'ad-container', 'advertisement']) {
    for (const attribute of ['id', 'class'] as const) {
      let block;
      while ((block = findDivBlock(result, attribute, token)))
        result = result.slice(0, block.start) + result.slice(block.end);
    }
  }
  return result;
}
