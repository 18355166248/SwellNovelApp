# 阅读器左右翻页体验优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让阅读器左右翻页在 iOS 与 Web 上排版精准、翻页顺滑（Web 整页吸附 + 键盘、点击三分热区、章节边界顺翻、重新分页保位）。

**Architecture:** 排版引擎 `src/utils/paginate.ts`（纯函数，已单测）+ 平台测宽 `src/utils/charWidth*.ts` 已就绪。本计划把它们接进 `ReaderScreen.tsx`（当前处于半迁移、编译不过的状态），先修复编译并跑通新分页，再逐项加入热区 / 吸附 / 键盘 / 边界顺翻 / 保位 / iOS onTextLayout 真实测量。

**Tech Stack:** React Native + react-native-web、jotai、jest（`npm test`）、TypeScript（`npx tsc --noEmit`）。

**参考 spec：** `docs/superpowers/specs/2026-07-02-reader-paging-design.md`

---

## 背景约束（实现者必读）

- `ReaderScreen.tsx` 已 `import` 新引擎符号（`breakLines` / `buildPages` / `findPageByOffset` / `INDENT` / `linesFromTextLayout` / `ReaderLine` / `ReaderPageData` / `getCharWidthMeasurer`）并定义了常量 `CHAPTER_TURN_THRESHOLD`、`WEB_SNAP_CONTAINER`、`WEB_SNAP_ITEM`、`measuredLinesCache` + `cacheMeasuredLines`，但**尚未使用**。当前第 188 行 `pages` 仍调用**已不存在**的 `paginateChapterText`，`renderPage`/`getPageLayout` 仍引用**已不存在**的 `ReaderPage` 类型 → 编译失败。
- 纯函数签名（来自 `src/utils/paginate.ts`，勿改逻辑）：
  - `breakLines(paragraphs: string[], maxWidth: number, measure: MeasureChar): ReaderLine[]`
  - `buildPages({ chapterId: string, lines: ReaderLine[], linesPerPage: number, firstPageLines: number }): ReaderPageData[]`
  - `findPageByOffset(pages: ReaderPageData[], offset: number): number`
  - `linesFromTextLayout(paragraphs: string[], layoutLineTexts: string[]): ReaderLine[]`
  - `ReaderPageData = { key: string; text: string; startOffset: number; showHeader: boolean }`
  - `ReaderLine = { text: string; charOffset: number; isParagraphStart: boolean }`
  - `getCharWidthMeasurer(fontFamily: string | undefined, fontSize: number): MeasureChar`
- 现有常量：`PAGE_HORIZONTAL_PADDING = 24`、`PAGE_TOP_PADDING = 56`、`PAGE_BOTTOM_PADDING = 90`、`SERIF_FONT`（`../theme/fonts`）。
- 每个 Task 结束前，翻页相关改动应保证 `npm test` 通过、`npx tsc --noEmit` 无新增错误。

---

## Task 1: 接线新分页引擎，修复编译

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（`pageMetrics` + `pages` + `renderPage` + `getPageLayout`，约 161-303 行区域）

- [ ] **Step 1: 用真实度量替换 `pageMetrics`**

把现有 `pageMetrics` useMemo（约 162-187 行）整体替换为：

```tsx
// 标题区（章节名 + meta + 间距）在首页占用的高度，换算成行数从首页额度里扣除。
const HEADER_BLOCK_HEIGHT =
  PAGE_TOP_PADDING + display.titleSize * 1.4 + 12 + 24;

const pageMetrics = React.useMemo(() => {
  const maxWidth = Math.max(1, viewportWidth - PAGE_HORIZONTAL_PADDING * 2);
  const readableHeight = Math.max(
    1,
    viewportHeight - PAGE_TOP_PADDING - PAGE_BOTTOM_PADDING,
  );
  const lineHeight = display.fontSize * display.lineHeight;
  const linesPerPage = Math.max(1, Math.floor(readableHeight / lineHeight));
  const headerLines = Math.ceil(
    (display.titleSize * 1.4 + 12 + 24) / lineHeight,
  );
  const firstPageLines = Math.max(1, linesPerPage - headerLines);
  return { maxWidth, linesPerPage, firstPageLines };
}, [
  display.fontSize,
  display.lineHeight,
  display.titleSize,
  viewportHeight,
  viewportWidth,
]);
```

（`HEADER_BLOCK_HEIGHT` 这一行可删除，不再需要；上面 useMemo 内部已内联计算。）

- [ ] **Step 2: 用 `breakLines` + `buildPages` 替换 `pages`**

把现有 `pages` useMemo（约 188-203 行）替换为：

```tsx
const pages = React.useMemo<ReaderPageData[]>(() => {
  const chapterId = chapter?.id || bookId;
  const measure = getCharWidthMeasurer(SERIF_FONT, display.fontSize);
  const cacheKey = `${chapterId}|${pageMetrics.maxWidth}|${display.fontSize}|${display.lineHeight}`;
  const lines =
    measuredLinesCache.get(cacheKey) ??
    breakLines(paragraphs, pageMetrics.maxWidth, measure);
  return buildPages({
    chapterId,
    lines,
    linesPerPage: pageMetrics.linesPerPage,
    firstPageLines: pageMetrics.firstPageLines,
  });
}, [
  bookId,
  chapter?.id,
  display.fontSize,
  display.lineHeight,
  pageMetrics.firstPageLines,
  pageMetrics.linesPerPage,
  pageMetrics.maxWidth,
  paragraphs,
]);
```

- [ ] **Step 3: `renderPage` / `getPageLayout` 类型改为 `ReaderPageData`**

将 `renderPage` 的参数类型 `{ item: ReaderPage; index: number }` 改为 `{ item: ReaderPageData; index: number }`；将 `getPageLayout` 的 `ArrayLike<ReaderPage>` 改为 `ArrayLike<ReaderPageData>`。renderPage 内部渲染 `item.text` / `item.showHeader` 的逻辑保持不变。

- [ ] **Step 4: 验证类型与测试**

Run: `npx tsc --noEmit`
Expected: 无 `Cannot find name 'paginateChapterText'` / `Cannot find name 'ReaderPage'` 等错误（编译通过）。

Run: `npm test -- paginate`
Expected: PASS（纯函数单测不受影响，全绿）。

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "fix(reader): 接入贪心断行分页引擎修复翻页编译

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 翻页中枢 goToPage + 点击三分热区

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（新增 `flatListRef`、`goToPage`；改 `renderPage` 的 `Pressable.onPress`）

- [ ] **Step 1: 新增 flatListRef 与 goToPage**

在组件内（`pageIndex` state 附近，约 119 行后）新增 ref，并在 `handlePageMomentumEnd` 之后新增 `goToPage`（章节边界分支留待 Task 5 填充，先只处理章内）：

```tsx
const flatListRef = React.useRef<FlatList<ReaderPageData>>(null);

const goToPage = React.useCallback(
  (delta: number) => {
    const target = pageIndex + delta;
    if (target < 0 || target >= pages.length) {
      // 章节边界顺翻在 Task 5 接入；此处暂不处理越界。
      return;
    }
    flatListRef.current?.scrollToIndex({ index: target, animated: true });
    setPageIndex(target);
  },
  [pageIndex, pages.length],
);
```

给 `FlatList` 加 `ref={flatListRef}`（在 `testID="reader-page-list"` 的 FlatList 上）。

- [ ] **Step 2: renderPage 点击按 X 三分**

把 `renderPage` 里 `Pressable` 的 `onPress={toggleToolbar}` 替换为：

```tsx
          onPress={(e: any) => {
            const x = e?.nativeEvent?.locationX ?? viewportWidth / 2;
            if (x < viewportWidth / 3) {
              goToPage(-1);
            } else if (x > (viewportWidth * 2) / 3) {
              goToPage(1);
            } else {
              toggleToolbar();
            }
          }}
```

并把 `goToPage` 加入 `renderPage` 的 `useCallback` 依赖数组。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): 左右翻页点击三分热区与翻页中枢

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Web 整页吸附 + 键盘翻页

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（FlatList 与 `renderPage` 容器套用 snap 样式；新增 keydown effect）

- [ ] **Step 1: 应用 scroll-snap 样式**

在 `FlatList` 上追加容器吸附样式（`style` 由 `StyleSheet.absoluteFill` 改为数组）：

```tsx
            style={[StyleSheet.absoluteFill, WEB_SNAP_CONTAINER]}
```

在 `renderPage` 的最外层 `Pressable` 的 `style` 数组里追加 `WEB_SNAP_ITEM`：

```tsx
          style={[
            styles.pagePanel,
            {
              width: viewportWidth,
              paddingTop: PAGE_TOP_PADDING,
              paddingBottom: PAGE_BOTTOM_PADDING,
            },
            WEB_SNAP_ITEM,
          ]}
```

- [ ] **Step 2: 用 ref 保持 goToPage 最新引用（供键盘监听闭包使用）**

在 `goToPage` 定义之后新增：

```tsx
const goToPageRef = React.useRef(goToPage);
React.useEffect(() => {
  goToPageRef.current = goToPage;
}, [goToPage]);
```

- [ ] **Step 3: Web 键盘监听**

在组件内新增 effect（放在其他 effect 附近）：

```tsx
React.useEffect(() => {
  if (Platform.OS !== 'web' || settings.pageMode !== 'page') return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      goToPageRef.current(-1);
    } else if (
      e.key === 'ArrowRight' ||
      e.key === 'PageDown' ||
      e.key === ' '
    ) {
      e.preventDefault();
      goToPageRef.current(1);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [settings.pageMode]);
```

- [ ] **Step 4: 验证（Web preview）**

用 preview 工具启动 Web，进入某本书阅读页、切「左右翻页」：

- 按 `→` / `←` 翻页，页码（progressLabel「本章 x / y 页」）随之变化。
- 鼠标拖拽横向滚动松手后整页吸附，不停留在半页。
- 左 1/3 点击上一页、右 1/3 下一页、中间开关工具栏。

Run: `npx tsc --noEmit`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): Web 端整页吸附与键盘翻页

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 重新分页保位（不跳回第 1 页）

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（`currentOffsetRef`、`pendingLandRef`、替换 205 行 reset effect、翻页时更新 offset）

- [ ] **Step 1: 新增 ref**

在 `flatListRef` 附近新增：

```tsx
const currentOffsetRef = React.useRef(0);
const pendingLandRef = React.useRef<'last' | null>(null);
const prevChapterIdRef = React.useRef<string | undefined>(undefined);
```

- [ ] **Step 2: 翻页 / momentum 结束时记录当前页 startOffset**

在 `goToPage` 内 `setPageIndex(target)` 之前追加：

```tsx
currentOffsetRef.current = pages[target]?.startOffset ?? 0;
```

在 `handlePageMomentumEnd` 内 `setPageIndex(...)` 处，改为先算出 clamped 页码再记录：

```tsx
const handlePageMomentumEnd = React.useCallback(
  (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const raw = Math.round(event.nativeEvent.contentOffset.x / viewportWidth);
    const next = Math.max(0, Math.min(pages.length - 1, raw));
    currentOffsetRef.current = pages[next]?.startOffset ?? 0;
    setPageIndex(next);
  },
  [pages, viewportWidth],
);
```

- [ ] **Step 3: 替换 reset effect 为保位逻辑**

把现有 effect（约 205-207 行 `setPageIndex(0)`）替换为：

```tsx
React.useEffect(() => {
  const chapterChanged = prevChapterIdRef.current !== chapter?.id;
  prevChapterIdRef.current = chapter?.id;

  if (chapterChanged) {
    if (pendingLandRef.current === 'last') {
      pendingLandRef.current = null;
      const last = Math.max(0, pages.length - 1);
      currentOffsetRef.current = pages[last]?.startOffset ?? 0;
      setPageIndex(last);
    } else {
      currentOffsetRef.current = 0;
      setPageIndex(0);
    }
    return;
  }
  // 同章内因字号/行距/主题/视口变化重排：映射回同一段文字所在页
  setPageIndex(findPageByOffset(pages, currentOffsetRef.current));
}, [chapter?.id, pages, settings.pageMode]);
```

- [ ] **Step 4: 验证（Web preview）**

阅读中翻到第 3 页左右，打开设置改字号 / 行距 / 主题 → 停在同一段文字（页码不归零、正文起始不跳变）。

Run: `npx tsc --noEmit`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): 重新分页后按字符偏移保位

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 章节边界顺翻

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（`goToPage` 越界分支；iOS `onScroll` 越界回弹）

- [ ] **Step 1: goToPage 越界翻章**

把 Task 2 中 `goToPage` 的越界 `return` 分支替换为：

```tsx
if (target < 0) {
  if (chapterIndex > 0) {
    pendingLandRef.current = 'last';
    goToChapter(chapterIndex - 1);
  }
  return;
}
if (target >= pages.length) {
  if (chapterIndex < total - 1) {
    pendingLandRef.current = null;
    goToChapter(chapterIndex + 1);
  }
  return;
}
```

并把 `goToPage` 的 `useCallback` 依赖补上 `chapterIndex`、`total`、`goToChapter`。

> 注意：`goToChapter` 是普通函数（非 useCallBack），把它包进 `React.useCallback` 依赖会每次变。为稳定依赖，可将 `goToChapter` 也用 `React.useCallback` 包裹（依赖 `total`、`bookId`、`openChapter`、`chapters`、各 setter）。若改动过大，可改为在 `goToPage` 里内联调用 `goToChapter` 而不入依赖（用 eslint-disable 注释单行说明），二选一，保持行为正确即可。

- [ ] **Step 2: iOS 越界回弹翻章**

给 `FlatList` 加 `onScroll`（iOS 生效，Web 上 snap 已处理，可无害共存）：

```tsx
            scrollEventThrottle={16}
            onScroll={
              Platform.OS === 'web'
                ? undefined
                : (e) => {
                    const x = e.nativeEvent.contentOffset.x;
                    if (x < -CHAPTER_TURN_THRESHOLD && pageIndex === 0) {
                      if (chapterIndex > 0) {
                        pendingLandRef.current = 'last';
                        goToChapter(chapterIndex - 1);
                      }
                    } else if (
                      x >
                        (pages.length - 1) * viewportWidth +
                          CHAPTER_TURN_THRESHOLD &&
                      pageIndex === pages.length - 1
                    ) {
                      if (chapterIndex < total - 1) {
                        goToChapter(chapterIndex + 1);
                      }
                    }
                  }
            }
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 编译通过。

Web preview：翻到本章最后一页再按 `→` → 进入下一章第 1 页；在下一章第 1 页按 `←` → 回到上一章最后一页。

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): 章节边界顺翻到相邻章

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: iOS onTextLayout 真实测量

**Files:**

- Modify: `src/screens/ReaderScreen.tsx`（新增离屏隐藏 Text + onTextLayout 处理；触发重排）

- [ ] **Step 1: 新增测量触发计数 state**

在组件 state 区新增，用于测量完成后强制 `pages` 重算：

```tsx
const [measureTick, setMeasureTick] = React.useState(0);
```

在 Task 1 的 `pages` useMemo 依赖数组末尾追加 `measureTick`（其余不变）。

- [ ] **Step 2: 渲染离屏隐藏测量 Text（仅 iOS/Android）**

在 `status === 'ready'` 分支的 page 模式下，`FlatList` 同级插入（放在 FlatList 之后、`</>` 之前的位置由实现者就近选择，保持在 `settings.pageMode === 'page'` 条件内）：

```tsx
{
  Platform.OS !== 'web' && paragraphs.length > 0 && (
    <Text
      style={{
        position: 'absolute',
        opacity: 0,
        width: pageMetrics.maxWidth,
        fontFamily: SERIF_FONT,
        fontSize: display.fontSize,
        lineHeight: display.fontSize * display.lineHeight,
      }}
      onTextLayout={e => {
        const chapterId = chapter?.id || bookId;
        const cacheKey = `${chapterId}|${pageMetrics.maxWidth}|${display.fontSize}|${display.lineHeight}`;
        if (measuredLinesCache.has(cacheKey)) return;
        const lineTexts = e.nativeEvent.lines.map(l => l.text);
        const lines = linesFromTextLayout(paragraphs, lineTexts);
        cacheMeasuredLines(cacheKey, lines);
        setMeasureTick(t => t + 1);
      }}
    >
      {paragraphs.map(p => INDENT + p).join('\n')}
    </Text>
  );
}
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 编译通过。

Run: `npm test`
Expected: 全绿。

（iOS 真机 / 模拟器手动走查：中英混排不切错行、页尾无大片留白；此步无自动化断言，属手动验证。）

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): iOS 用 onTextLayout 真实排版重排分页

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 全量校验与收尾

**Files:**

- 无新增改动，仅校验

- [ ] **Step 1: 类型 + Lint + 测试**

Run: `npx tsc --noEmit`
Expected: 无错误。

Run: `npm run lint`
Expected: 无新增错误（既有告警不在本次范围）。

Run: `npm test`
Expected: 全绿。

- [ ] **Step 2: Web 端回归走查（preview）**

逐项确认：键盘 ←/→ 翻页；拖拽整页吸附；点击三分热区；改字号/行距/主题保位；章节首末页顺翻；滚动模式行为未变。

- [ ] **Step 3: 若有修复则提交**

```bash
git add -A
git commit -m "chore(reader): 翻页优化收尾校验与修复

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检结论（对照 spec）

- 一、分页接线 → Task 1；二、手势热区 → Task 2；三、Web 吸附+键盘 → Task 3；四、章节边界顺翻 → Task 5；五、重新分页保位 → Task 4；六、iOS onTextLayout → Task 6。全部 spec 小节均有对应 Task。
- 类型一致：全程使用 `ReaderPageData` / `ReaderLine`，`goToPage(delta)` / `pendingLandRef('last'|null)` / `currentOffsetRef` / `measuredLinesCache` 命名前后一致。
- 非目标（翻页动画、跨重启章内持久化）未纳入任何 Task。
