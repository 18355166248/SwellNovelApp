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
