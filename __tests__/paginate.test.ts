import { charWidthEm } from '../src/utils/charWidthTable';
import {
  breakLines,
  buildPages,
  findPageByOffset,
  linesFromTextLayout,
  MeasureChar,
  ReaderLine,
} from '../src/utils/paginate';

const INDENT = '　　';

describe('charWidthEm', () => {
  it('汉字与全角标点占 1em', () => {
    expect(charWidthEm('中')).toBe(1);
    expect(charWidthEm('，')).toBe(1);
    expect(charWidthEm('“')).toBe(1);
    expect(charWidthEm('　')).toBe(1);
  });

  it('ASCII 可见字符约半宽，空格更窄', () => {
    expect(charWidthEm('a')).toBeLessThan(0.7);
    expect(charWidthEm('a')).toBeGreaterThan(0.3);
    expect(charWidthEm(' ')).toBeLessThan(charWidthEm('a'));
  });

  it('空字符串不抛错', () => {
    expect(charWidthEm('')).toBeGreaterThan(0);
  });
});

describe('breakLines', () => {
  const fixed10: MeasureChar = () => 10;

  it('等宽字符按可用宽度断行，段首行带缩进', () => {
    // maxWidth 50，缩进占 20，首行只能放 3 个字
    const lines = breakLines(['一二三四五六七'], 50, fixed10);
    expect(lines.map(l => l.text)).toEqual([`${INDENT}一二三`, '四五六七']);
    expect(lines[0].charOffset).toBe(0);
    expect(lines[1].charOffset).toBe(3);
    expect(lines[0].isParagraphStart).toBe(true);
    expect(lines[1].isParagraphStart).toBe(false);
  });

  it('多段落偏移量连续、每段首行标记正确', () => {
    const lines = breakLines(['一二三', '四五六'], 100, fixed10);
    expect(lines.map(l => l.text)).toEqual([
      `${INDENT}一二三`,
      `${INDENT}四五六`,
    ]);
    expect(lines[1].charOffset).toBe(3);
    expect(lines[1].isParagraphStart).toBe(true);
  });

  it('中英混排每行累计宽度不超过 maxWidth', () => {
    const measure: MeasureChar = c => (c.charCodeAt(0) < 0x7f ? 5 : 10);
    const lines = breakLines(['abc一二def三四五ghi六七八九十'], 42, measure);
    lines.forEach(line => {
      const width = Array.from(line.text).reduce((w, c) => w + measure(c), 0);
      expect(width).toBeLessThanOrEqual(42);
    });
    // 内容无丢失
    expect(
      lines
        .map(l => l.text)
        .join('')
        .replace(/　/g, ''),
    ).toBe('abc一二def三四五ghi六七八九十');
  });

  it('单字符宽于 maxWidth 时每行至少一个字符，不死循环', () => {
    const lines = breakLines(['一二三'], 5, fixed10);
    expect(lines.length).toBe(3);
    expect(lines[2].charOffset).toBe(2);
  });

  it('空段落数组返回空行数组', () => {
    expect(breakLines([], 100, fixed10)).toEqual([]);
  });
});

function makeLine(
  text: string,
  charOffset: number,
  isParagraphStart = false,
): ReaderLine {
  return { text, charOffset, isParagraphStart };
}

describe('buildPages', () => {
  const lines: ReaderLine[] = [
    makeLine('　　甲甲甲', 0, true),
    makeLine('甲甲', 3),
    makeLine('　　乙乙乙', 5, true),
    makeLine('乙乙', 8),
    makeLine('　　丙丙', 10, true),
  ];

  it('首页用 firstPageLines 限制，后续页用 linesPerPage，段落间插空行', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines,
      linesPerPage: 4,
      firstPageLines: 2,
    });
    expect(pages[0].text).toBe('　　甲甲甲\n甲甲');
    expect(pages[0].startOffset).toBe(0);
    expect(pages[0].showHeader).toBe(true);
    expect(pages[1].text).toBe('　　乙乙乙\n乙乙\n\n　　丙丙');
    expect(pages[1].startOffset).toBe(5);
    expect(pages[1].showHeader).toBe(false);
    expect(pages.map(p => p.key)).toEqual(['ch1-0', 'ch1-1']);
  });

  it('空章节至少产出 1 页', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines: [],
      linesPerPage: 4,
      firstPageLines: 2,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toBe('');
    expect(pages[0].showHeader).toBe(true);
  });

  it('limit 非法时兜底为 1，不死循环', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines,
      linesPerPage: 0,
      firstPageLines: -1,
    });
    expect(pages.length).toBeGreaterThan(0);
  });
});

describe('findPageByOffset', () => {
  const pages = buildPages({
    chapterId: 'ch1',
    lines: [
      makeLine('　　甲甲甲', 0, true),
      makeLine('甲甲', 3),
      makeLine('　　乙乙乙', 5, true),
      makeLine('乙乙', 8),
    ],
    linesPerPage: 2,
    firstPageLines: 2,
  });

  it('每页 startOffset 往返映射回自身页码', () => {
    pages.forEach((page, idx) => {
      expect(findPageByOffset(pages, page.startOffset)).toBe(idx);
    });
  });

  it('页中间的偏移映射到所在页，越界偏移映射到末页', () => {
    expect(findPageByOffset(pages, 4)).toBe(0);
    expect(findPageByOffset(pages, 9999)).toBe(pages.length - 1);
    expect(findPageByOffset(pages, 0)).toBe(0);
    expect(findPageByOffset([], 10)).toBe(0);
  });
});

describe('linesFromTextLayout', () => {
  it('还原逻辑偏移量与段首标记', () => {
    // 展示文本为 '　　abcde\n　　fgh'，onTextLayout 把第一段折成两行
    const lines = linesFromTextLayout(
      ['abcde', 'fgh'],
      ['　　abc', 'de', '　　fgh'],
    );
    expect(lines).toEqual([
      { text: '　　abc', charOffset: 0, isParagraphStart: true },
      { text: 'de', charOffset: 3, isParagraphStart: false },
      { text: '　　fgh', charOffset: 5, isParagraphStart: true },
    ]);
  });

  it('容忍行尾换行符', () => {
    const lines = linesFromTextLayout(['abc'], ['　　abc\n']);
    expect(lines[0].text).toBe('　　abc');
    expect(lines[0].charOffset).toBe(0);
  });

  it('空输入返回空数组', () => {
    expect(linesFromTextLayout([], [])).toEqual([]);
    expect(linesFromTextLayout(['abc'], [])).toEqual([]);
  });
});
