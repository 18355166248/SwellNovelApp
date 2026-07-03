# 阅读器左右翻页优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计文档 `docs/superpowers/specs/2026-07-02-reader-page-turn-design.md`，重做阅读器左右翻页：精确分页（贪心断行 + 平台化测宽）、Web 翻页吸附与键盘翻页、三分点击热区、章节边界顺势翻页、字号/行距变化后阅读位置不丢失。

**Architecture:** 纯函数分页器 `src/utils/paginate.ts` 两端共享；测宽层按平台分叉（`charWidth.ts` 宽度表 / `charWidth.web.ts` canvas measureText）；iOS 额外用隐藏 `Text` + `onTextLayout` 做两阶段真实测量；`ReaderScreen.tsx` 只负责状态编排（偏移量、pendingPage、热区、键盘、吸附样式）。

**Tech Stack:** React Native 0.83 + react-native-web 0.21、jotai、Jest（preset: react-native）。

**约定：**

- 「逻辑偏移量」= 章节 `paragraphs.join('')` 中的字符下标（不含展示用的全角缩进和换行），用于重分页后恢复位置。
- 所有提交信息遵循 `~/.claude/rules/git.md`：英文 type + 中文主题。
- 测试命令：`npx jest __tests__/paginate.test.ts -v`（全量：`npx jest`）。

---

### Task 0: 提交现有基线

工作区里有左右翻页初版的未提交改动（`ReaderScreen.tsx`、`readerAtoms.ts`、`BookshelfScreen.tsx`、`LibraryPersistence.tsx`、`libraryStorage.ts`、`libraryStorage.web.ts`、`index.web.js`），以及已写好但未提交的设计文档。先各自成提交，保持基线干净。

- [ ] **Step 1: 提交设计文档**

```bash
git add docs/superpowers/specs/2026-07-02-reader-page-turn-design.md docs/superpowers/plans/2026-07-02-reader-page-turn.md
git commit -m "docs(reader): 新增左右翻页优化设计文档与实现计划"
```

- [ ] **Step 2: 提交左右翻页初版基线**

先 `git diff` 快速过一遍这些文件确认没有无关内容，然后：

```bash
git add index.web.js src/screens/BookshelfScreen.tsx src/screens/ReaderScreen.tsx src/store/LibraryPersistence.tsx src/store/atoms/readerAtoms.ts src/utils/libraryStorage.ts src/utils/libraryStorage.web.ts
git commit -m "feat(reader): 左右翻页初版（估算分页 + FlatList 横向翻页）"
```

注意：`claude-design/` 目录不要提交（保持 untracked）。

---

### Task 1: 字符宽度表 `charWidthTable.ts`

**Files:**

- Create: `src/utils/charWidthTable.ts`
- Test: `__tests__/paginate.test.ts`（新建，本任务先只放宽度表用例）

- [ ] **Step 1: 写失败测试**

新建 `__tests__/paginate.test.ts`：

```ts
import { charWidthEm } from '../src/utils/charWidthTable';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: FAIL，`Cannot find module '../src/utils/charWidthTable'`

- [ ] **Step 3: 实现**

新建 `src/utils/charWidthTable.ts`：

```ts
/**
 * 无法真实测量时的字符宽度近似表（单位 em）。
 * 中文小说场景：CJK 与全角标点为主，通用标点区（“”—…）在中文衬线字体里
 * 也按全宽渲染，因此 0x2000 以上统一按 1em 处理；半角假名等罕见字符可接受误差。
 */
export function charWidthEm(char: string): number {
  const code = char.codePointAt(0) ?? 0x4e00;
  if (code === 0x20) return 0.3;
  if (code < 0x7f) return 0.54;
  if (code >= 0x2000) return 1;
  return 0.6;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/utils/charWidthTable.ts __tests__/paginate.test.ts
git commit -m "feat(reader): 新增字符宽度近似表"
```

---

### Task 2: 贪心断行 `breakLines`

**Files:**

- Create: `src/utils/paginate.ts`
- Test: `__tests__/paginate.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/paginate.test.ts` 追加：

```ts
import { breakLines, MeasureChar } from '../src/utils/paginate';

const INDENT = '　　';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: FAIL，`Cannot find module '../src/utils/paginate'`

- [ ] **Step 3: 实现**

新建 `src/utils/paginate.ts`：

```ts
/**
 * 左右翻页分页器（纯函数，iOS / Web 共享）。
 * 「逻辑偏移量」指章节 paragraphs.join('') 中的字符下标（不含缩进与换行），
 * 字号/行距/视口变化重新分页后，用它恢复阅读位置。
 */

export type MeasureChar = (char: string) => number;

export interface ReaderLine {
  /** 展示文本（段首行含全角缩进） */
  text: string;
  /** 行首字符的逻辑偏移量 */
  charOffset: number;
  /** 是否段落首行（组页时段落之间插入空行） */
  isParagraphStart: boolean;
}

export const INDENT = '　　';

export function breakLines(
  paragraphs: string[],
  maxWidth: number,
  measure: MeasureChar,
): ReaderLine[] {
  const lines: ReaderLine[] = [];
  const safeMax = Math.max(1, maxWidth);
  let offset = 0;

  paragraphs.forEach(paragraph => {
    let isFirst = true;
    let lineText = INDENT;
    let lineWidth = measure('　') * 2;
    let lineStart = offset;

    const pushLine = () => {
      lines.push({
        text: lineText,
        charOffset: lineStart,
        isParagraphStart: isFirst,
      });
      isFirst = false;
      lineText = '';
      lineWidth = 0;
      lineStart = offset;
    };

    for (const char of Array.from(paragraph)) {
      const charWidth = measure(char);
      const hasContent = isFirst
        ? lineText.length > INDENT.length
        : lineText.length > 0;
      if (hasContent && lineWidth + charWidth > safeMax) {
        pushLine();
      }
      lineText += char;
      lineWidth += charWidth;
      offset += 1;
    }
    if (lineText.length > 0) {
      pushLine();
    }
  });

  return lines;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/paginate.ts __tests__/paginate.test.ts
git commit -m "feat(reader): 新增按字符宽度累加的贪心断行器"
```

---

### Task 3: 组页 `buildPages` 与偏移映射 `findPageByOffset`

**Files:**

- Modify: `src/utils/paginate.ts`
- Test: `__tests__/paginate.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/paginate.test.ts` 追加：

```ts
import {
  buildPages,
  findPageByOffset,
  ReaderLine,
} from '../src/utils/paginate';

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
    // 首页 2 行：甲段两行；第二页：乙段（含段首，页首不加空行）4 行会放 乙两行+空行+丙 → 超限拆分
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: FAIL，`buildPages is not a function`（或 import 报错）

- [ ] **Step 3: 实现**

在 `src/utils/paginate.ts` 追加：

```ts
export interface ReaderPageData {
  key: string;
  /** 页内文本，行以 \n 连接，段落间已插入空行 */
  text: string;
  /** 本页首行的逻辑偏移量 */
  startOffset: number;
  /** 仅章节首页展示标题区 */
  showHeader: boolean;
}

export function buildPages({
  chapterId,
  lines,
  linesPerPage,
  firstPageLines,
}: {
  chapterId: string;
  lines: ReaderLine[];
  linesPerPage: number;
  firstPageLines: number;
}): ReaderPageData[] {
  const pages: ReaderPageData[] = [];
  const limitFor = (pageNo: number) =>
    Math.max(1, pageNo === 0 ? firstPageLines : linesPerPage);

  let current: string[] = [];
  let currentStart = 0;

  const pushPage = () => {
    pages.push({
      key: `${chapterId}-${pages.length}`,
      text: current.join('\n'),
      startOffset: currentStart,
      showHeader: pages.length === 0,
    });
    current = [];
  };

  lines.forEach(line => {
    const needsGap = line.isParagraphStart && current.length > 0;
    const needed = 1 + (needsGap ? 1 : 0);
    if (
      current.length > 0 &&
      current.length + needed > limitFor(pages.length)
    ) {
      pushPage();
    }
    if (current.length === 0) {
      currentStart = line.charOffset;
    } else if (needsGap) {
      current.push('');
    }
    current.push(line.text);
  });

  if (current.length > 0 || pages.length === 0) {
    pushPage();
  }

  return pages;
}

/** 逻辑偏移量 → 页码（返回 startOffset <= offset 的最后一页） */
export function findPageByOffset(
  pages: ReaderPageData[],
  offset: number,
): number {
  let idx = 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].startOffset <= offset) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/paginate.ts __tests__/paginate.test.ts
git commit -m "feat(reader): 新增组页与偏移量页码映射"
```

---

### Task 4: `linesFromTextLayout`（onTextLayout 行 → ReaderLine）

**Files:**

- Modify: `src/utils/paginate.ts`
- Test: `__tests__/paginate.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/paginate.test.ts` 追加：

```ts
import { linesFromTextLayout } from '../src/utils/paginate';

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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: FAIL，`linesFromTextLayout is not a function`

- [ ] **Step 3: 实现**

在 `src/utils/paginate.ts` 追加：

```ts
/**
 * 把 onTextLayout 返回的真实排版行文本，对齐到展示文本
 * （paragraphs.map(p => INDENT + p).join('\n')），换算出逻辑偏移量与段首标记。
 * 行文本与展示文本不完全一致时按顺序尽力对齐，偏差只影响恢复位置的精度。
 */
export function linesFromTextLayout(
  paragraphs: string[],
  layoutLineTexts: string[],
): ReaderLine[] {
  const displayChars: string[] = [];
  const logicalOffsets: number[] = [];
  const paragraphStarts = new Set<number>();
  let logical = 0;

  paragraphs.forEach((paragraph, pi) => {
    if (pi > 0) {
      displayChars.push('\n');
      logicalOffsets.push(logical);
    }
    paragraphStarts.add(displayChars.length);
    for (const ch of INDENT) {
      displayChars.push(ch);
      logicalOffsets.push(logical);
    }
    for (const ch of Array.from(paragraph)) {
      displayChars.push(ch);
      logicalOffsets.push(logical);
      logical += 1;
    }
  });

  const lines: ReaderLine[] = [];
  let pos = 0;
  layoutLineTexts.forEach(raw => {
    const text = raw.replace(/\n+$/g, '');
    while (pos < displayChars.length && displayChars[pos] === '\n') {
      pos += 1;
    }
    const start = pos;
    lines.push({
      text,
      charOffset:
        logicalOffsets[
          Math.min(start, Math.max(0, logicalOffsets.length - 1))
        ] ?? 0,
      isParagraphStart: paragraphStarts.has(start),
    });
    pos += Array.from(text).length;
  });

  return lines;
}
```

注意空输入分支：`paragraphs` 为空时 `logicalOffsets` 为空数组，`layoutLineTexts` 也应为空；若不为空则 `charOffset` 兜底为 0（`?? 0`）。

- [ ] **Step 4: 运行确认通过**

Run: `npx jest __tests__/paginate.test.ts -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/paginate.ts __tests__/paginate.test.ts
git commit -m "feat(reader): 支持 onTextLayout 真实排版行换算逻辑偏移"
```

---

### Task 5: 测宽层 `charWidth.ts` / `charWidth.web.ts`

**Files:**

- Create: `src/utils/charWidth.ts`
- Create: `src/utils/charWidth.web.ts`

canvas 在 jest（react-native preset，无 DOM）里不可用，web 实现不写单测，靠 Task 11 的 preview 实测；native 实现是宽度表的薄封装，由 Task 1 的用例覆盖。

- [ ] **Step 1: 实现 native 版**

新建 `src/utils/charWidth.ts`：

```ts
import { charWidthEm } from './charWidthTable';
import type { MeasureChar } from './paginate';

/**
 * iOS/Android：宽度表估算，仅作为 onTextLayout 真实测量完成前的过渡。
 */
export function getCharWidthMeasurer(
  _fontFamily: string | undefined,
  fontSize: number,
): MeasureChar {
  return char => charWidthEm(char) * fontSize;
}
```

- [ ] **Step 2: 实现 web 版**

新建 `src/utils/charWidth.web.ts`：

```ts
import { charWidthEm } from './charWidthTable';
import type { MeasureChar } from './paginate';

type FontCacheEntry = {
  ctx: CanvasRenderingContext2D;
  widths: Map<string, number>;
};

// 按 font 字符串缓存 canvas context 与字符宽度；阅读器字号档位有限，不会膨胀。
const fontCache = new Map<string, FontCacheEntry>();

/**
 * Web：canvas measureText 精确测宽，结果按字符缓存；
 * canvas 不可用时回退宽度表。
 */
export function getCharWidthMeasurer(
  fontFamily: string | undefined,
  fontSize: number,
): MeasureChar {
  const font = `${fontSize}px ${fontFamily || 'serif'}`;
  let entry = fontCache.get(font);
  if (!entry) {
    const ctx =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null;
    if (ctx) {
      ctx.font = font;
      entry = { ctx, widths: new Map() };
      fontCache.set(font, entry);
    }
  }
  if (!entry) {
    return char => charWidthEm(char) * fontSize;
  }
  const { ctx, widths } = entry;
  return char => {
    let width = widths.get(char);
    if (width == null) {
      width = ctx.measureText(char).width;
      widths.set(char, width);
    }
    return width;
  };
}
```

- [ ] **Step 3: 类型与 lint 检查**

Run: `npx tsc --noEmit && npx eslint src/utils/charWidth.ts src/utils/charWidth.web.ts`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/utils/charWidth.ts src/utils/charWidth.web.ts
git commit -m "feat(reader): 新增平台化字符测宽层"
```

---

### Task 6: ReaderScreen 接入新分页器（替换估算硬切）

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

本任务只做「等价替换」：删除 `splitByChars` / `paginateChapterText` / `ReaderPage` 类型，用 `breakLines` + `buildPages` 生成页面。翻页交互仍是旧行为（后续任务改）。

- [ ] **Step 1: 替换 import 与删除旧函数**

删除 `ReaderScreen.tsx` 中的 `ReaderPage` 类型、`splitByChars`、`paginateChapterText`（约 48–115 行），新增 import：

```ts
import {
  breakLines,
  buildPages,
  findPageByOffset,
  linesFromTextLayout,
  ReaderPageData,
} from '../utils/paginate';
import { getCharWidthMeasurer } from '../utils/charWidth';
```

（`findPageByOffset`、`linesFromTextLayout` 供后续任务使用，本任务先引入避免反复改 import；若 lint 报 unused，本任务只引入 `breakLines`、`buildPages`、`ReaderPageData`、`getCharWidthMeasurer`，其余到用到的任务再加。）

- [ ] **Step 2: 重写 pageMetrics 与 pages**

替换现有 `pageMetrics` / `pages` 两个 useMemo：

```ts
// 分页三步：贪心断行（平台化测宽）→ 按行组页 → 交给 FlatList 虚拟渲染。
const pageMetrics = React.useMemo(() => {
  const readableWidth = Math.max(
    1,
    viewportWidth - PAGE_HORIZONTAL_PADDING * 2,
  );
  const readableHeight = Math.max(
    1,
    viewportHeight - PAGE_TOP_PADDING - PAGE_BOTTOM_PADDING,
  );
  const lineHeight = display.fontSize * display.lineHeight;
  const linesPerPage = Math.max(1, Math.floor(readableHeight / lineHeight));
  // 首页标题区实际占位：标题行高 30 + 下边距 8 + 作者行 17 + 下边距 24
  const headerHeight = 30 + 8 + 17 + 24;
  const firstPageLines = Math.max(
    1,
    linesPerPage - Math.ceil(headerHeight / lineHeight),
  );
  return { readableWidth, lineHeight, linesPerPage, firstPageLines };
}, [display.fontSize, display.lineHeight, viewportHeight, viewportWidth]);

const estimatedLines = React.useMemo(() => {
  const measure = getCharWidthMeasurer(SERIF_FONT, display.fontSize);
  return breakLines(paragraphs, pageMetrics.readableWidth, measure);
}, [display.fontSize, pageMetrics.readableWidth, paragraphs]);

const pages = React.useMemo(
  () =>
    buildPages({
      chapterId: chapter?.id || bookId,
      lines: estimatedLines,
      linesPerPage: pageMetrics.linesPerPage,
      firstPageLines: pageMetrics.firstPageLines,
    }),
  [
    bookId,
    chapter?.id,
    estimatedLines,
    pageMetrics.firstPageLines,
    pageMetrics.linesPerPage,
  ],
);
```

- [ ] **Step 3: 更新 renderPage 的 item 类型**

`renderPage` 签名中 `item: ReaderPage` 改为 `item: ReaderPageData`；`getPageLayout` 的 `ArrayLike<ReaderPage>` 同步改为 `ArrayLike<ReaderPageData>`。其余渲染逻辑不变。

- [ ] **Step 4: 验证**

Run: `npx tsc --noEmit && npx jest && npx eslint src/screens/ReaderScreen.tsx`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "refactor(reader): 分页改用贪心断行器与平台化测宽"
```

---### Task 7: 偏移量位置保持 + pendingPage 跨章定位 + goToPage

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: 引入 refs 与 setPageAt**

在 `const [pageIndex, setPageIndex] = React.useState(0);` 附近改为：

```ts
const [pageIndex, setPageIndex] = React.useState(0);
const pageIndexRef = React.useRef(0);
const listRef = React.useRef<FlatList<ReaderPageData>>(null);
// 阅读位置的权威表示是章内逻辑偏移量；pageIndex 只是它在当前分页下的投影。
const readOffsetRef = React.useRef(0);
// 跨章翻页后落在目标章的哪一端（上一章 → 最后一页）。
const pendingPageRef = React.useRef<'first' | 'last' | null>(null);
const prevChapterKeyRef = React.useRef<string | null>(null);

const setPageAt = React.useCallback(
  (index: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    pageIndexRef.current = clamped;
    setPageIndex(clamped);
    readOffsetRef.current = pages[clamped]?.startOffset ?? 0;
  },
  [pages],
);
```

- [ ] **Step 2: 用「重分页恢复」effect 替换 reset effect**

删除现有的：

```ts
React.useEffect(() => {
  setPageIndex(0);
}, [chapter?.id, pages.length, settings.pageMode]);
```

替换为：

```ts
// 重分页（换章/字号/行距/视口变化）后恢复阅读位置：
// 换章按 pendingPage 落页，否则用偏移量映射回对应页。
React.useEffect(() => {
  if (settings.pageMode !== 'page' || pages.length === 0) return;
  const chapterKey = pages[0].key.replace(/-\d+$/, '');
  let target: number;
  if (prevChapterKeyRef.current !== chapterKey) {
    target = pendingPageRef.current === 'last' ? pages.length - 1 : 0;
    pendingPageRef.current = null;
    prevChapterKeyRef.current = chapterKey;
    readOffsetRef.current = pages[target]?.startOffset ?? 0;
  } else {
    target = findPageByOffset(pages, readOffsetRef.current);
  }
  pageIndexRef.current = target;
  setPageIndex(target);
  requestAnimationFrame(() => {
    listRef.current?.scrollToIndex({ index: target, animated: false });
  });
}, [pages, settings.pageMode]);
```

- [ ] **Step 3: goToPage 与 momentum 更新偏移**

在 `goToChapter` 之后新增：

```ts
const goToPage = (target: number) => {
  if (target < 0) {
    if (chapterIndex > 0) {
      pendingPageRef.current = 'last';
      goToChapter(chapterIndex - 1);
    }
    return;
  }
  if (target >= pages.length) {
    if (chapterIndex < total - 1) {
      pendingPageRef.current = 'first';
      goToChapter(chapterIndex + 1);
    }
    return;
  }
  setPageAt(target);
  listRef.current?.scrollToIndex({ index: target, animated: true });
};
const goToPageRef = React.useRef(goToPage);
goToPageRef.current = goToPage;
```

`handlePageMomentumEnd` 改为：

```ts
const handlePageMomentumEnd = React.useCallback(
  (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const nextPage = Math.round(
      event.nativeEvent.contentOffset.x / viewportWidth,
    );
    setPageAt(nextPage);
  },
  [setPageAt, viewportWidth],
);
```

- [ ] **Step 4: FlatList 挂 ref**

`<FlatList` 增加 `ref={listRef}`。

- [ ] **Step 5: 进度提示改用偏移量**

`pageProgressPct` 计算替换为：

```ts
const chapterChars = React.useMemo(
  () => paragraphs.reduce((n, p) => n + Array.from(p).length, 0),
  [paragraphs],
);
const pageOffset =
  pages[Math.min(pageIndex, pages.length - 1)]?.startOffset ?? 0;
const pageProgressPct =
  total > 0 && chapterChars > 0
    ? Math.round(
        ((chapterIndex + Math.min(1, pageOffset / chapterChars)) / total) * 100,
      )
    : progressPct;
```

- [ ] **Step 6: 验证并提交**

Run: `npx tsc --noEmit && npx jest && npx eslint src/screens/ReaderScreen.tsx`
Expected: 通过

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): 翻页位置改由章内偏移量驱动，跨章支持定位到末页"
```

---

### Task 8: 三分点击热区

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: renderPage 改为内容 + 热区覆盖层**

`renderPage` 中外层 `Pressable`（`onPress={toggleToolbar}`）改为普通 `View`，并在内容之后追加热区（放在 item 内部、FlatList 之下，保证滑动手势仍由 ScrollView 接管，Pressable 只消费点击）：

```tsx
return (
  <View
    style={[
      styles.pagePanel,
      {
        width: viewportWidth,
        paddingTop: PAGE_TOP_PADDING,
        paddingBottom: PAGE_BOTTOM_PADDING,
      },
    ]}
  >
    {/* …原有标题区与正文 Text 保持不变… */}
    {/* 三分热区：左 1/3 上一页、中 1/3 开关工具栏、右 1/3 下一页 */}
    <View style={styles.tapZones}>
      <Pressable
        style={styles.tapZone}
        onPress={() => goToPageRef.current(pageIndexRef.current - 1)}
      />
      <Pressable style={styles.tapZone} onPress={toggleToolbar} />
      <Pressable
        style={styles.tapZone}
        onPress={() => goToPageRef.current(pageIndexRef.current + 1)}
      />
    </View>
  </View>
);
```

`renderPage` 的 useCallback 依赖不变（热区通过 ref 调用，无需新增依赖）。

- [ ] **Step 2: 新增样式**

`styles` 中追加：

```ts
tapZones: {
  ...StyleSheet.absoluteFillObject,
  flexDirection: 'row',
},
tapZone: { flex: 1 },
```

- [ ] **Step 3: 验证并提交**

Run: `npx tsc --noEmit && npx eslint src/screens/ReaderScreen.tsx`
Expected: 通过。滚动模式的点击开关工具栏行为不受影响（那条路径是独立的 ScrollView 分支）。

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): 翻页模式新增三分点击热区"
```

---

### Task 9: Web 吸附 + 键盘翻页 + 滚动落定跟踪

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: scroll-snap 样式**

FlatList 与页面容器加 web-only 样式（react-native-web 会透传这两个 CSS 属性；RN 类型不认识，需 `as any`）：

```ts
// 组件外（模块顶层）：
const WEB_SNAP_CONTAINER =
  Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as any) : null;
const WEB_SNAP_ITEM =
  Platform.OS === 'web' ? ({ scrollSnapAlign: 'start' } as any) : null;
```

- `<FlatList style={StyleSheet.absoluteFill}` → `style={[StyleSheet.absoluteFill, WEB_SNAP_CONTAINER]}`
- `renderPage` 外层 View 的 style 数组末尾加 `WEB_SNAP_ITEM`

- [ ] **Step 2: 键盘翻页**

新增 effect（注意 drawer 搜索框输入时不劫持方向键）：

```ts
// Web 键盘翻页：←/→；抽屉或设置面板打开时不响应。
React.useEffect(() => {
  if (Platform.OS !== 'web' || settings.pageMode !== 'page') return;
  const onKeyDown = (e: KeyboardEvent) => {
    if (drawerOpen || settingsOpen) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToPageRef.current(pageIndexRef.current + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPageRef.current(pageIndexRef.current - 1);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [drawerOpen, settingsOpen, settings.pageMode]);
```

- [ ] **Step 3: 滚动落定跟踪（wheel/触摸板不触发 momentum 事件）**

```ts
const scrollSettleRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
  undefined,
);
const handleWebScroll = React.useCallback(
  (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = event.nativeEvent.contentOffset.x;
    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = setTimeout(() => {
      setPageAt(Math.round(x / viewportWidth));
    }, 150);
  },
  [setPageAt, viewportWidth],
);

React.useEffect(
  () => () => {
    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
  },
  [],
);
```

FlatList 增加：

```tsx
onScroll={Platform.OS === 'web' ? handleWebScroll : undefined}
scrollEventThrottle={32}
```

- [ ] **Step 4: 验证并提交**

Run: `npx tsc --noEmit && npx jest && npx eslint src/screens/ReaderScreen.tsx`
Expected: 通过（浏览器行为在 Task 12 preview 实测）

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader/web): 翻页吸附、键盘翻页与滚动落定跟踪"
```

---

### Task 10: iOS 越界回弹跨章

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: onScrollEndDrag 检测越界**

模块顶层加常量：

```ts
const CHAPTER_TURN_THRESHOLD = 40;
```

组件内新增：

```ts
// iOS 弹性越界：末页继续向后拖超过阈值 → 下一章；首页向前拖 → 上一章末页。
const handleScrollEndDrag = React.useCallback(
  (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (Platform.OS === 'web') return;
    const x = event.nativeEvent.contentOffset.x;
    const maxX = viewportWidth * (pages.length - 1);
    if (x > maxX + CHAPTER_TURN_THRESHOLD && chapterIndex < total - 1) {
      pendingPageRef.current = 'first';
      goToChapterRef.current(chapterIndex + 1);
    } else if (x < -CHAPTER_TURN_THRESHOLD && chapterIndex > 0) {
      pendingPageRef.current = 'last';
      goToChapterRef.current(chapterIndex - 1);
    }
  },
  [chapterIndex, pages.length, total, viewportWidth],
);
```

`goToChapter` 是每次渲染新建的普通函数，为进 useCallback 依赖加一个 ref（与 `goToPageRef` 同法）：

```ts
const goToChapterRef = React.useRef(goToChapter);
goToChapterRef.current = goToChapter;
```

FlatList 现有 `onScrollBeginDrag={() => setToolbarVisible(false)}` 保留，另加：

```tsx
onScrollEndDrag = { handleScrollEndDrag };
```

- [ ] **Step 2: 验证并提交**

Run: `npx tsc --noEmit && npx eslint src/screens/ReaderScreen.tsx`
Expected: 通过（真机手感由用户在 Task 13 验收）

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader/ios): 章节边界越界回弹顺势翻章"
```

---

### Task 11: iOS onTextLayout 两阶段真实测量

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: 测量缓存与状态**

模块顶层：

```ts
// onTextLayout 真实排版结果缓存：同章同排版参数只测一次。
const measuredLinesCache = new Map<string, ReaderLine[]>();
const MEASURED_CACHE_LIMIT = 16;
function cacheMeasuredLines(key: string, lines: ReaderLine[]) {
  if (measuredLinesCache.size >= MEASURED_CACHE_LIMIT) {
    const oldest = measuredLinesCache.keys().next().value;
    if (oldest != null) measuredLinesCache.delete(oldest);
  }
  measuredLinesCache.set(key, lines);
}
```

import 增加 `ReaderLine`、`linesFromTextLayout`、`INDENT`（来自 `../utils/paginate`）。

组件内：

```ts
const measureSignature = `${chapter?.id || bookId}|${display.fontSize}|${
  display.lineHeight
}|${pageMetrics.readableWidth}`;
const measuredLines =
  Platform.OS === 'web'
    ? null
    : measuredLinesCache.get(measureSignature) ?? null;
const [, setMeasureTick] = React.useState(0);

const measureSource = React.useMemo(
  () => paragraphs.map(p => INDENT + p).join('\n'),
  [paragraphs],
);
```

- [ ] **Step 2: pages 优先使用真实测量行**

`pages` 的 useMemo 中 `lines: estimatedLines` 改为：

```ts
const lines = measuredLines ?? estimatedLines;
```

（把 `measuredLines` 加入依赖数组。）

- [ ] **Step 3: 隐藏测量 Text**

在翻页模式 FlatList 的 JSX 之前（`status === 'ready' &&` 分支内、与 FlatList 同级）插入：

```tsx
{
  Platform.OS !== 'web' &&
    settings.pageMode === 'page' &&
    !measuredLines &&
    paragraphs.length > 0 && (
      <Text
        style={{
          position: 'absolute',
          left: PAGE_HORIZONTAL_PADDING,
          top: 0,
          width: pageMetrics.readableWidth,
          opacity: 0,
          fontFamily: SERIF_FONT,
          fontSize: display.fontSize,
          lineHeight: pageMetrics.lineHeight,
        }}
        pointerEvents="none"
        onTextLayout={e => {
          const lineTexts = e.nativeEvent.lines.map(l => l.text);
          if (lineTexts.length === 0) return; // 字体未就绪等异常：保留估算分页
          cacheMeasuredLines(
            measureSignature,
            linesFromTextLayout(paragraphs, lineTexts),
          );
          setMeasureTick(t => t + 1);
        }}
      >
        {measureSource}
      </Text>
    );
}
```

测量完成后 `pages` 用真实行重建，Task 7 的恢复 effect 会用 `readOffsetRef` 把当前页映射过去，读者无感。

- [ ] **Step 4: 验证并提交**

Run: `npx tsc --noEmit && npx jest && npx eslint src/screens/ReaderScreen.tsx`
Expected: 通过

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader/ios): onTextLayout 两阶段真实测量分页"
```

---

### Task 12: Web 端 preview 实测与修复

**Files:**

- 视发现的问题修改 `src/screens/ReaderScreen.tsx` / `src/utils/charWidth.web.ts`

- [ ] **Step 1: 启动 web dev server**（`npm run web`，通过 preview 工具）
- [ ] **Step 2: 逐项验证**
  1. 打开任意书籍进入阅读页，切到「左右翻页」；
  2. 鼠标/触摸板横向滚动 → 停下时吸附到整页（不停在半页）；
  3. ←/→ 键盘翻页正常，目录抽屉打开时方向键不翻页；
  4. 左/右 1/3 点击翻页，中间 1/3 开关工具栏；
  5. 末页右侧点击 → 进入下一章第 1 页；第 1 页左侧点击 → 上一章最后一页；
  6. 调字号 → 仍停留在原文位置附近（不跳回第 1 页）；
  7. 页面文本无越界、页尾无异常大片留白（抽查长章节多页）；
  8. console 无报错。
- [ ] **Step 3: 已知风险处置** — 若 `scrollToIndex({ animated: true })` 与 `scroll-snap-type: x mandatory` 冲突（动画被 snap 打断/抖动），把 `goToPage` 中 web 分支改为 `animated: false`：

```ts
listRef.current?.scrollToIndex({
  index: target,
  animated: Platform.OS !== 'web',
});
```

- [ ] **Step 4: 修复后回归上述清单，提交**

```bash
git add -A src/
git commit -m "fix(reader/web): 修复翻页实测问题"
```

（按实际修复内容调整提交信息；若无问题则跳过本提交。）

---

### Task 13: 全量回归与 iOS 验收

- [ ] **Step 1: 全量检查**

Run: `npx tsc --noEmit && npx jest && npx eslint src/`
Expected: 全部通过

- [ ] **Step 2: iOS 手动验收（交给用户）**

请用户在模拟器/真机验证：滑动翻页手感、三分热区、末页继续滑进下一章、首页回滑到上一章末页、调字号后位置保持、真实测量生效后排版无跳变。

- [ ] **Step 3: 收尾**

如有遗留问题记录到 issue/备忘，更新设计文档状态为「已实现」。
