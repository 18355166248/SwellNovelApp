interface ReaderScrollMeasurementInput {
  chapterId?: string;
  contentVersion?: string | number;
  content: string;
  contentFingerprint?: string;
  textLength: number;
  fontSize: number;
  lineHeight: number;
  paraGap: number;
  fontFamily?: string;
  viewportWidth: number;
  viewportHeight: number;
}

interface ReaderLineCacheKeyInput {
  chapterId: string;
  textLength: number;
  contentFingerprint: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
}

export function fingerprintReaderContent(content: string): string {
  // 滚动哈希只在正文引用变化时计算，既能识别“同长度但内容已替换”，又不把整章
  // 正文放进测量状态；滚动恢复据此拒绝消费上一版正文留下的高度。
  let hash = 7;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) % 2147483647;
  }
  return hash.toString(36);
}

export function buildReaderScrollMeasurementKey({
  chapterId,
  contentVersion,
  content,
  contentFingerprint,
  textLength,
  fontSize,
  lineHeight,
  paraGap,
  fontFamily,
  viewportWidth,
  viewportHeight,
}: ReaderScrollMeasurementInput): string {
  return [
    chapterId ?? '',
    contentVersion ?? '',
    content.length,
    contentFingerprint ?? fingerprintReaderContent(content),
    textLength,
    fontSize,
    lineHeight,
    paraGap,
    fontFamily ?? '',
    viewportWidth,
    viewportHeight,
  ].join('|');
}

export function buildReaderLineCacheKey({
  chapterId,
  textLength,
  contentFingerprint,
  maxWidth,
  fontSize,
  lineHeight,
  fontFamily,
}: ReaderLineCacheKeyInput): string {
  // 等长正文替换也必须失效；pages cache 以该 key 为前缀，因此断行与分页会一起更新。
  return `${chapterId}|${textLength}|${contentFingerprint}|${maxWidth}|${fontSize}|${lineHeight}|${
    fontFamily || 'system'
  }`;
}
