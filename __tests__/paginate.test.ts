import { charWidthEm } from '../src/utils/charWidthTable';
import {
  breakLines,
  breakLinesCooperatively,
  buildPages,
  calculatePageHeightCorrection,
  getNativePageEndOffset,
  findPageByOffset,
  linesFromTextLayout,
  MeasureChar,
  ReaderLine,
} from '../src/utils/paginate';

const INDENT = '　　';

describe('native page boundaries', () => {
  it('does not spend a separate estimated row on trailing Chinese punctuation', async () => {
    const paragraphs = ['甲乙丙丁。', '戊己庚辛。”', '壬癸子丑'];
    const lines = breakLines(paragraphs, 60, () => 10);
    expect(lines.map(line => line.text)).toEqual([
      '　　甲乙丙丁。',
      '　　戊己庚辛。”',
      '　　壬癸子丑',
    ]);
    expect(lines.map(line => line.charOffset)).toEqual([0, 5, 11]);
    expect(
      await breakLinesCooperatively({
        paragraphs,
        maxWidth: 60,
        measure: () => 10,
        shouldCancel: () => false,
        yieldControl: async () => {},
      }),
    ).toEqual(lines);
  });
  it('keeps every native line that fits instead of removing an estimated two-line fragment', () => {
    const text = '甲乙丙丁戊己庚辛壬癸子丑';
    const end = getNativePageEndOffset({
      blocks: [
        {
          block: { startOffset: 0, text },
          lines: Array.from(text).map((char, index) => ({
            text: char,
            y: index * 10,
            height: 10,
          })),
        },
      ],
      availableHeight: 111,
      paraGap: 0,
    });
    expect(end).toBe(11);
    const pages = buildPages({
      chapterId: 'native',
      lines: breakLines([text], 40, () => 10),
      lineHeight: 10,
      paraGap: 0,
      bodyHeight: 111,
      firstBodyHeight: 111,
      pageEndOffsets: { 0: end! },
    });
    expect(pages[1].startOffset).toBe(11);
    expect(pages[0].blocks[0].text.replace(/[\n　]/g, '')).toBe(
      text.slice(0, 11),
    );
    expect(
      pages
        .flatMap(p => p.blocks.map(b => b.text.replace(/[\n　]/g, '')))
        .join(''),
    ).toBe(text);
  });

  it('counts native paragraph gaps and inserted indent without shifting the logical offset', () => {
    expect(
      getNativePageEndOffset({
        blocks: [
          {
            block: { startOffset: 100, text: '　　甲乙' },
            lines: [{ text: '　　甲乙', y: 0, height: 57.6 }],
          },
          {
            block: { startOffset: 102, text: '　　丙丁戊己' },
            lines: [
              { text: '　　丙丁', y: 0, height: 57.6 },
              { text: '戊己', y: 57.6, height: 57.6 },
            ],
          },
        ],
        availableHeight: 130,
        paraGap: 14,
      }),
    ).toBe(104);
  });

  it('rejects stale or incomplete native text', () => {
    expect(
      getNativePageEndOffset({
        blocks: [
          {
            block: { startOffset: 0, text: '甲乙丙' },
            lines: [{ text: '甲乙', y: 0, height: 10 }],
          },
        ],
        availableHeight: 10,
        paraGap: 0,
      }),
    ).toBeNull();
  });
});

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

describe('breakLinesCooperatively', () => {
  const fixed10: MeasureChar = () => 10;

  it('分片断行与一次性断行结果及跨片偏移完全一致', async () => {
    const paragraphs = ['一二三四五', '六七八九', '十百千万'];
    const yielded = jest.fn(async () => {});
    const lines = await breakLinesCooperatively({
      paragraphs,
      maxWidth: 50,
      measure: fixed10,
      shouldCancel: () => false,
      chunkSize: 1,
      yieldControl: yielded,
    });

    expect(lines).toEqual(breakLines(paragraphs, 50, fixed10));
    expect(yielded).toHaveBeenCalledTimes(paragraphs.length);
  });

  it('让出事件循环后发现用户交互会停止后续章节计算', async () => {
    let cancelled = false;
    const lines = await breakLinesCooperatively({
      paragraphs: ['第一段', '第二段', '第三段'],
      maxWidth: 100,
      measure: fixed10,
      shouldCancel: () => cancelled,
      chunkSize: 1,
      yieldControl: async () => {
        cancelled = true;
      },
    });

    expect(lines).toBeNull();
  });

  it('超长单段也在字符预算内让出，并可在第一片后取消', async () => {
    let cancelled = false;
    const measure = jest.fn(fixed10);
    const lines = await breakLinesCooperatively({
      paragraphs: ['长'.repeat(100000)],
      maxWidth: 50,
      measure,
      shouldCancel: () => cancelled,
      characterChunkSize: 512,
      yieldControl: async () => {
        cancelled = true;
      },
    });
    expect(lines).toBeNull();
    // 包含一次缩进测量，不能先同步测完十万字符后才响应取消。
    expect(measure).toHaveBeenCalledTimes(513);
  });

  it('在段落中间多次分片仍保留 Unicode 偏移、缩进和断行', async () => {
    const paragraphs = ['甲😀乙𠮷丙丁戊己庚辛'.repeat(20), '下一段'];
    expect(
      await breakLinesCooperatively({
        paragraphs,
        maxWidth: 50,
        measure: fixed10,
        shouldCancel: () => false,
        characterChunkSize: 7,
        yieldControl: async () => {},
      }),
    ).toEqual(breakLines(paragraphs, 50, fixed10));
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

  it('只校正发生溢出的页，后续普通页仍使用完整预算', () => {
    const sample = Array.from({ length: 12 }, (_, index) =>
      makeLine(String(index), index),
    );
    const pages = buildPages({
      chapterId: 'local-correction',
      lines: sample,
      lineHeight: 10,
      paraGap: 0,
      bodyHeight: 30,
      firstBodyHeight: 30,
      heightCorrections: { 3: 5 },
    });
    expect(pages.map(page => page.startOffset)).toEqual([0, 3, 5, 8, 11]);
    expect(pages.map(page => page.blocks[0].text.split('\n').length)).toEqual([
      3, 2, 3, 3, 1,
    ]);
    expect(pages.flatMap(page => page.blocks[0].text.split('\n'))).toEqual(
      sample.map(line => line.text),
    );
  });

  it('真机 0.6pt 行高舍入误差不能额外挤掉第二行', () => {
    // 当前章第 48 页实测 849pt，估算 790.8pt；少一行后 791.x pt 可在 1pt 容差内显示。
    const correction = calculatePageHeightCorrection({
      actualHeight: 849,
      estimatedHeight: 790.8,
      availableHeight: 791,
    });
    const sample = Array.from({ length: 26 }, (_, index) =>
      makeLine(String(index), index, [0, 3, 7, 10].includes(index % 13)),
    );
    const pages = buildPages({
      chapterId: 'native-rounding',
      lines: sample,
      lineHeight: 57.6,
      paraGap: 14,
      bodyHeight: 791,
      firstBodyHeight: 791,
      heightCorrections: { 0: correction },
    });
    expect(
      pages[0].blocks.reduce(
        (sum, block) => sum + block.text.split('\n').length,
        0,
      ),
    ).toBe(12);
    expect(
      calculatePageHeightCorrection({
        actualHeight: 791.4,
        estimatedHeight: 733.2,
        availableHeight: 791,
        previousCorrection: correction,
      }),
    ).toBe(correction);
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
