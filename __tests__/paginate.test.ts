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

  // 行高 10、段间距 5：首页可用 25（放 2 行 + 段间距余量），普通页可用 40。
  it('按像素高度组页，段落各自成块并计入段间距', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines,
      lineHeight: 10,
      paraGap: 5,
      bodyHeight: 40,
      firstBodyHeight: 25,
    });
    // 首页：甲段(2行=20)，再放乙段需 +5(段间距)+10 > 25，翻页。
    expect(pages[0].blocks.map(b => b.text)).toEqual(['　　甲甲甲\n甲甲']);
    expect(pages[0].startOffset).toBe(0);
    expect(pages[0].showHeader).toBe(true);
    // 次页：乙段(20)+丙段(段间距5+10=15)=35 ≤ 40，同页两块。
    expect(pages[1].blocks.map(b => b.text)).toEqual([
      '　　乙乙乙\n乙乙',
      '　　丙丙',
    ]);
    expect(pages[1].blocks.map(b => b.startOffset)).toEqual([5, 10]);
    expect(pages[1].startOffset).toBe(5);
    expect(pages[1].showHeader).toBe(false);
    expect(pages.map(p => p.key)).toEqual(['ch1-0', 'ch1-1']);
  });

  it('段落跨页时续段块单独成页且不再留段间距', () => {
    const long: ReaderLine[] = [
      makeLine('　　甲甲甲', 0, true),
      makeLine('甲甲', 3),
      makeLine('甲甲甲', 5),
    ];
    // 每页只放 2 行（bodyHeight 20 / 行高 10），段落被拆到第二页。
    const pages = buildPages({
      chapterId: 'ch1',
      lines: long,
      lineHeight: 10,
      paraGap: 5,
      bodyHeight: 20,
      firstBodyHeight: 20,
    });
    expect(pages[0].blocks.map(b => b.text)).toEqual(['　　甲甲甲\n甲甲']);
    expect(pages[1].blocks.map(b => b.text)).toEqual(['甲甲甲']);
    expect(pages[1].startOffset).toBe(5);
  });

  it('空章节至少产出 1 页', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines: [],
      lineHeight: 10,
      paraGap: 5,
      bodyHeight: 40,
      firstBodyHeight: 25,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toEqual([]);
    expect(pages[0].showHeader).toBe(true);
  });

  it('高度非法时兜底为至少一行，不死循环', () => {
    const pages = buildPages({
      chapterId: 'ch1',
      lines,
      lineHeight: 10,
      paraGap: 5,
      bodyHeight: 0,
      firstBodyHeight: -1,
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
    lineHeight: 10,
    paraGap: 5,
    bodyHeight: 20,
    firstBodyHeight: 20,
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
