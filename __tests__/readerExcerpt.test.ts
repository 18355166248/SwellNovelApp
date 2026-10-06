import {
  paragraphsFromContent,
  resolveExcerptDraft,
  resolveExcerptRange,
} from '../src/utils/readerExcerpt';

describe('reader excerpt positioning', () => {
  const content = '第一段文字\n\n  第二段需要摘抄的文字\n第三段结尾';

  it('uses pagination logical offsets instead of raw newline offsets', () => {
    const paragraphs = paragraphsFromContent(content);
    const secondStart = Array.from(paragraphs[0]).length;
    const draft = resolveExcerptDraft(
      content,
      '　　第二段需要摘抄的文字',
      secondStart,
    );

    expect(draft).toEqual({
      // 第二段开头的两个半角空格属于分页逻辑内容，但不属于摘抄正文。
      position: secondStart + 2,
      excerpt: '第二段需要摘抄的文字',
    });
    expect(draft?.position).not.toBe(content.indexOf('第二段'));
  });

  it('resolves legacy raw positions back to the current logical range', () => {
    const legacyRawPosition = content.indexOf('第二段');
    const range = resolveExcerptRange(
      content,
      '第二段需要摘抄的文字',
      legacyRawPosition,
    );
    const logicalStart = Array.from('第一段文字  ').length;

    expect(range.start).toBe(logicalStart);
    expect(range.end - range.start).toBe(
      Array.from('第二段需要摘抄的文字').length,
    );
  });

  it('chooses the repeated paragraph closest to the pressed block', () => {
    const repeated = '重复段落\n中间内容\n重复段落';
    const lastStart = Array.from('重复段落中间内容').length;
    const draft = resolveExcerptDraft(repeated, '重复段落', lastStart);

    expect(draft?.position).toBe(lastStart);
  });

  it('keeps long excerpts bounded and returns the sliced logical position', () => {
    const long = `${'甲'.repeat(500)}目标文字${'乙'.repeat(500)}`;
    const draft = resolveExcerptDraft(long, '目标文字', 500);

    expect(Array.from(draft?.excerpt.replace(/^…|…$/g, '') ?? '')).toHaveLength(
      600,
    );
    expect(draft?.position).toBe(320);
    expect(draft?.excerpt.startsWith('…')).toBe(true);
    expect(draft?.excerpt.endsWith('…')).toBe(true);
  });
});

it('同一长段重复锚点时，摘抄实际长按处而非第一次出现处', () => {
  const before = `${'甲'.repeat(500)}重复锚点${'乙'.repeat(1000)}`;
  const content = `${before}重复锚点这里是后一个位置${'丙'.repeat(500)}`;
  const draft = resolveExcerptDraft(
    content,
    '重复锚点',
    Array.from(before).length,
  );
  expect(draft?.position).toBe(Array.from(before).length - 180);
  expect(draft?.excerpt).toContain('这里是后一个位置');
});

it('含表情的同段重复摘抄回跳使用最近码点偏移', () => {
  const before = `${'😀'.repeat(250)}重复文字${'𠮷'.repeat(250)}`;
  const content = `${before}重复文字结尾`;
  const position = Array.from(before).length;
  const range = resolveExcerptRange(content, '重复文字', position);
  expect(range).toEqual({ start: position, end: position + 4 });
});
