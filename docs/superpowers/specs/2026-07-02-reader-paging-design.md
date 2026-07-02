# 阅读器左右翻页体验优化设计（iOS + Web）

- 日期：2026-07-02
- 范围：`ReaderScreen` 左右翻页（`pageMode === 'page'`）体验，两端（iOS / react-native-web）
- 目标问题（用户确认）：**Web 端翻页吸附**、**分页排版精度**、**翻页手势与热区**

## 背景与现状盘点

翻页排版引擎已实现且有完整单测，但 `src/screens/ReaderScreen.tsx` 处于**改到一半、当前编译不过**的状态。

已完成（`src/utils/`）：

- `paginate.ts`：
  - `breakLines(paragraphs, maxWidth, measure)` — 按字符实际宽度累加的贪心断行，段首行含全角缩进 `INDENT`，输出 `ReaderLine[]`（含 `charOffset` 逻辑偏移量、`isParagraphStart`）。
  - `buildPages({ chapterId, lines, linesPerPage, firstPageLines })` — 组页，首页用 `firstPageLines` 限行、段落间插空行，输出 `ReaderPageData[]`（含 `startOffset`、`showHeader`、`key`）。
  - `findPageByOffset(pages, offset)` — 逻辑偏移量映射回页码。
  - `linesFromTextLayout(paragraphs, layoutLineTexts)` — 把 iOS `onTextLayout` 的真实排版行对齐回 `ReaderLine[]`。
- `charWidth.ts` / `charWidth.web.ts`：平台化测宽器 `getCharWidthMeasurer(fontFamily, fontSize)`。Web 用 canvas `measureText`（按字符缓存），iOS/Android 用宽度表估算。
- `charWidthTable.ts`：无法真实测量时的字符宽度近似表（em）。
- `__tests__/paginate.test.ts`：覆盖断行 / 组页 / 偏移往返 / 中英混排 / 边界。

未完成（`ReaderScreen.tsx`）：

1. **编译坏**：`pages` 仍调用已删除的 `paginateChapterText`；`renderPage` / `getPageLayout` 仍引用已不存在的 `ReaderPage` 类型。新引擎全部 `import` 但未使用。
2. `WEB_SNAP_CONTAINER` / `WEB_SNAP_ITEM` / `CHAPTER_TURN_THRESHOLD` / `measuredLinesCache` + `cacheMeasuredLines` 已定义但未接线。
3. 未实现：iOS `onTextLayout` 隐藏测量、点击三分热区、Web 键盘翻页、章节边界顺翻、重新分页保位。

进度存储现状：`useUpdateReadingProgress(bookId, progress, chapterId, position)` 只做**章级**进度（`position` 目前恒传 0），无章内偏移持久化。

## 设计

### 一、分页接线（收尾 + 精度）

替换 `ReaderScreen` 中 `pageMetrics` + `pages` 的旧估算逻辑：

- 度量：
  - `maxWidth = viewportWidth - PAGE_HORIZONTAL_PADDING * 2`
  - `lineHeight = display.fontSize * display.lineHeight`
  - `readableHeight = viewportHeight - PAGE_TOP_PADDING - PAGE_BOTTOM_PADDING`
  - `linesPerPage = max(1, floor(readableHeight / lineHeight))`
  - `firstPageLines = max(1, linesPerPage - 标题区真实占用行数)`（标题 + meta + 间距按其真实高度换算成行数扣除，消除首页尾部留白）
- 分页流水线：
  1. `measure = getCharWidthMeasurer(SERIF_FONT, display.fontSize)`
  2. `lines = breakLines(paragraphs, maxWidth, measure)`（iOS 若命中 `measuredLinesCache` 则用真实排版行覆盖，见第六节）
  3. `pages = buildPages({ chapterId, lines, linesPerPage, firstPageLines })`
- `renderPage` 的 item 类型改为 `ReaderPageData`；`item.text` 已含段落空行，渲染逻辑不变。
- 清理：删除文件内旧 `splitByChars` / `paginateChapterText` / `ReaderPage` 类型残留（若仍存在），使 import 与使用一致。

### 二、翻页手势与热区（仅 page 模式）

- `renderPage` 的整页 `Pressable`：`onPress` 读取 `nativeEvent.locationX`，按 `viewportWidth` 三等分判定：
  - 左 1/3 → `goToPage(-1)`
  - 右 1/3 → `goToPage(+1)`
  - 中 1/3 → `toggleToolbar()`
- 滚动模式（`scroll`）点击行为保持现状（整屏 toggle 工具栏），不改。
- **`goToPage(delta)`** 为翻页中枢：
  - 目标页在 `[0, pages.length-1]` 内 → `flatListRef.scrollToIndex({ index, animated: true })` 并 `setPageIndex(index)`。
  - 越界 → 交章节边界逻辑（第四节）。

### 三、Web 吸附 + 键盘

- FlatList 应用 `WEB_SNAP_CONTAINER`（`scroll-snap-type: x mandatory`），每页容器应用 `WEB_SNAP_ITEM`（`scroll-snap-align: start`）：拖拽松手整页吸附，不停半页。
- Web 键盘：`Platform.OS === 'web' && pageMode === 'page'` 时 `useEffect` 挂 `window` 的 `keydown` 监听，卸载移除：
  - `ArrowLeft` / `PageUp` → `goToPage(-1)`
  - `ArrowRight` / `PageDown` / `Space` → `goToPage(+1)`
  - 依赖 `goToPage`、`pages.length`、`pageIndex`（用 ref 规避闭包过期）。

### 四、章节边界顺翻

- 本章**最后一页**继续向后 → `goToChapter(chapterIndex + 1)`，落新章**第 1 页**（默认行为）。
- 本章**第 1 页**继续向前 → `goToChapter(chapterIndex - 1)`，落上一章**最后一页**：
  - 设 `pendingLandRef.current = 'last'`，换章分页完成后的 effect 检测到该标记则 `setPageIndex(pages.length - 1)` 并清空标记。
- 触发方式：
  - 点击 / 键盘：在边界页触发对应翻章。
  - iOS 拖拽：`onScroll` 检测越界回弹位移超过 `CHAPTER_TURN_THRESHOLD` 时触发（到头继续拽的手感）。
- 已在首/末章时不翻（`goToChapter` 已有 `idx` 越界保护）。

### 五、重新分页保位

替换现有「任何变化都 `setPageIndex(0)`」的 effect：

- `currentOffsetRef` 记录当前页 `startOffset`；翻页 / momentum 结束时更新。
- `pages` 因字号 / 行距 / 主题 / 视口变化重算时：`setPageIndex(findPageByOffset(pages, currentOffsetRef.current))`，停在同一段文字所在的新页。
- 仅**换章**归零（`chapter.id` 变化且无 `pending` 落尾标记时 `setPageIndex(0)` 并重置 `currentOffsetRef`）。
- **范围界定**：章内偏移只做**本会话内**保位；不新增跨重启持久化。现有章级进度（`useUpdateReadingProgress`）照旧。跨重启记忆章内位置为额外范围，本次不做。

### 六、iOS onTextLayout 真实测量

- 仅 `Platform.OS !== 'web'` 挂载一个**离屏隐藏 Text**：
  - 样式 `position:absolute; opacity:0`，宽度 = `maxWidth`，字号 / 行高 / 字体与正文一致。
  - 内容 = `paragraphs.map(p => INDENT + p).join('\n')`。
  - `onTextLayout` 回调取 `nativeEvent.lines.map(l => l.text)`。
- 回调 → `linesFromTextLayout(paragraphs, lineTexts)` → 写入 `measuredLinesCache`（键含 `chapterId` + 排版参数）→ 触发 `pages` 用真实行重排。
- 测量完成前先用宽度表 `breakLines` 出稿，避免白屏；测量后覆盖为精确排版。
- Web 不挂该组件（canvas 测宽已足够）。

## 组件边界

- `src/utils/paginate.ts`：纯排版逻辑，无 RN 依赖，已单测（本次不改逻辑，除非接线暴露缺陷）。
- `src/utils/charWidth*.ts`：平台测宽，接口 `MeasureChar`。
- `ReaderScreen.tsx`：编排——度量 → 分页 → 渲染 → 手势/键盘/边界/保位。本次改动集中在此文件的翻页相关部分，不动工具栏 / 设置面板 / 目录抽屉 / 滚动模式的既有结构。

## 测试与验证

- 单元：`paginate.test.ts` 保持通过（`npm test` 或对应命令）。若接线中调整了 `buildPages` 的 `firstPageLines` 语义，补对应用例。
- Web（preview 工具）：
  - 键盘 ←/→ 翻页；拖拽松手整页吸附（无半页停留）；左右点击热区翻页、中间开关工具栏。
  - 调字号 / 行距 / 主题后停留在同一段文字（不跳回首页）。
  - 章节首/末页继续翻 → 顺翻到相邻章正确落页。
- iOS（真机 / 模拟器手动走查）：中英混排不切错行、页尾无大片留白；`onTextLayout` 覆盖后排版与实际渲染一致；边界拖拽翻章手感。

## 非目标（YAGNI）

- 仿真 / 覆盖式翻页动画（本次不做，用户未选）。
- 章内偏移跨重启持久化。
- 滚动模式的任何行为改动。
