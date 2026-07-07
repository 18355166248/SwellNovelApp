import {
  formatReaderChapterLabel,
  formatReaderClock,
} from '../src/utils/readerChrome';

describe('readerChrome', () => {
  it('formatReaderClock 显示当前时间 HH:mm', () => {
    expect(formatReaderClock(new Date(2026, 6, 7, 8, 5))).toBe('08:05');
    expect(formatReaderClock(new Date(2026, 6, 7, 23, 59))).toBe('23:59');
  });

  it('formatReaderChapterLabel 优先显示当前章节标题', () => {
    expect(formatReaderChapterLabel({ title: '  第六百八十三章  ' }, 754)).toBe(
      '第六百八十三章',
    );
  });

  it('formatReaderChapterLabel 没有标题时回退章节序号', () => {
    expect(formatReaderChapterLabel(undefined, 0)).toBe('第 1 章');
    expect(formatReaderChapterLabel({ title: '   ' }, 2)).toBe('第 3 章');
  });
});
