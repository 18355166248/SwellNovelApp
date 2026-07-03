# 阅读器左右翻页优化设计（iOS + Web）

日期：2026-07-02
状态：已确认

## 背景与目标

阅读器左右翻页模式（`pageMode: 'page'`）初版基于横向 `FlatList` + `pagingEnabled` + 字符数估算分页，体验存在明显问题。本次优化聚焦三点（用户确认的范围）：

1. **Web 端翻页吸附** —— `pagingEnabled` 在 react-native-web 上不生效，横向列表自由滚动、可停在半页。
2. **分页排版精度** —— 现有 `splitByChars` 按 `字号 × 1.08` 固定每行字数硬切，中英混排切错行、页尾留白/溢出、段中硬换行破坏 justify。
3. **翻页手势与热区** —— 无点击热区（点任意处只开关工具栏）、章节边界不能顺势翻页、调字号/行距后阅读位置重置为第 1 页。

**不做**（本次范围外）：翻页动画质感（覆盖式/仿真翻页）、亮度调节真实生效、上下滚动模式改动。

## 总体方案

方案 A：**统一贪心断行器 + 平台化测宽**。两端共享同一套纯函数分页逻辑，仅"字符测宽"一层按平台实现；iOS 额外用 `onTextLayout` 做真实排版测量（两阶段分页）。

## 模块划分

### 1. 测宽层 `src/utils/charWidth.ts` / `charWidth.web.ts`

平台分叉，沿用项目现有 `.web.ts` 后缀约定（参考 `libraryStorage.web.ts`）。

统一接口：

```ts
getCharWidthMeasurer(fontFamily: string, fontSize: number): (char: string) => number
```

- **Web 实现**：canvas 2D `measureText`，按字符缓存测量结果（一章去重后通常仅数千个不同字符，开销很小）。
- **iOS 实现**：字符宽度表估算 —— CJK 统一区 = 1em、ASCII ≈ 0.5em、全角标点 = 1em、其他按区间近似。仅作为 `onTextLayout` 真实测量完成前的过渡。

### 2. 分页器 `src/utils/paginate.ts`（纯函数，两端共享，可单测）

- `breakLines(paragraphs, maxWidth, measure)`：贪心断行，按字符宽度累加换行；每段首行加全角缩进（`　　`）；每行携带**章内字符偏移量** `charOffset`。
- `buildPages(lines, linesPerPage, firstPageLines)`：按行组页；首页行数扣除标题实际占位（不再用 `-2/-3` 经验修正）；段落间保留空行间隔；每页记录 `startOffset`。
- `findPageByOffset(pages, offset)`：字符偏移 → 页码，用于重分页后恢复阅读位置。

## iOS 真实测量（两阶段分页）

1. **第一阶段（立即）**：宽度表估算分页，首屏不等待测量。
2. **第二阶段（测量完成后）**：挂隐藏 `Text`（`opacity: 0`、绝对定位、与正文完全相同的 fontFamily/fontSize/lineHeight/宽度）渲染整章文本，`onTextLayout` 回调返回真实排版 `lines[]`；用真实行重建页面，`findPageByOffset` 把当前阅读位置映射到新页码，读者无感切换。
3. 测量结果按 `(chapterId, fontSize, lineHeight, width)` 缓存，同章同设置不重测。
4. Web 端 canvas 测宽即为精确结果，跳过第二阶段。

## Web 翻页吸附

- `FlatList` 的 `style` 增加 `scrollSnapType: 'x mandatory'`（仅 web），每页容器加 `scrollSnapAlign: 'start'`。
- `window.addEventListener('keydown')` 支持 ←/→ 翻页（仅 web；组件卸载时移除监听）。
- 程序化翻页统一走 `scrollToIndex({ animated: true })`。
- **已知风险**：smooth scroll 与 `scroll-snap-type: mandatory` 在个别浏览器可能冲突；若出现，程序化翻页降级为瞬时定位（`animated: false`），实现时用 preview 验证。

## 点击热区与章节边界

### 三分热区（仅翻页模式）

页面覆盖三分热区：左 1/3 上一页、右 1/3 下一页、中间 1/3 开关工具栏。滚动模式保持现有"点击开关工具栏"行为不变。

### 章节边界打通

- 最后一页向后翻 → `openChapter(下一章)`，落在第 1 页。
- 第 1 页向前翻 → 进入上一章，落在**最后一页**：新增 `pendingPage: 'last'` 机制，待上一章分页完成后定位。
- iOS 手势跨章：`onScrollEndDrag` 检测越界回弹超过阈值（约 40px）时触发；Web 端由点击热区/键盘承担跨章。

### 阅读位置保持

- 当前位置的权威表示改为「章内字符偏移量」；`pageIndex` 由偏移量派生。
- 字号/行距/主题/视口尺寸变化 → 重新分页 → `findPageByOffset` 恢复位置，不再重置为第 1 页。
- 底部进度提示同步改用偏移量计算，跨页更平滑。

## 错误处理与边界情况

- 空章节 / 单段超长文本：分页器保证至少产出 1 页，无死循环。
- iOS `onTextLayout` 未触发或返回行数异常（如字体未就绪）：保留估算分页，不阻塞阅读。
- 视口尺寸变化（web 窗口缩放、转屏）：与字号变化走同一条"重分页 + 偏移恢复"路径。

## 测试

- **Jest 单测**（`paginate.ts`）：
  - 中英混排断行后每行累计宽度不超过 `maxWidth`；
  - 段落首行缩进与段间空行规则；
  - 偏移量 ↔ 页码往返映射一致性；
  - 空章节、单段超长文本边界。
- **Web 实测**（preview 工具）：吸附停页、←/→ 键盘翻页、三分热区、跨章翻页。
- **iOS 验收**：用户在模拟器/真机验证手感与排版。
