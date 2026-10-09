# 通用书籍资料补全与解析诊断

## 仙工开物的实际原因

真机 Swell5 的玄幻阁目录页 `/wapbook-192466/` 没有本书封面标签。此前浏览器导入直接保存目录页资料，未进一步读取详情页，因此书名带“全文阅读”、作者为“佚名”、封面为 App 默认图。

详情页 `/info-192466/` 有原封面，真机读取的节点是：

```html
<div class="block_img2">
  <img
    src="http://wap.xuanhuange.info/files/article/image/192/192466/192466s.jpg"
  />
</div>
```

旧提取器也未覆盖这一封面容器。因此仅修正目录识别或仅补一个图片选择器都不完整。

## 共用流程

- `bookMetadata.ts`：同一纯函数用于 WebView DOM 注入及 HTML 回退，提取 Open Graph、JSON-LD Book、明确封面容器、图片书名及作者标签；读取 canonical、书名或详情锚点作为候选地址。不会执行页面脚本或直接采用页面第一张图片。
- `enrichBookMetadata.ts`：按已有书源详情地址、书源备用地址、页面候选链接、扩展候选和原页回读顺序补资料。每个地址最多访问一次，默认最多 3 次请求、总计 18 秒；页面发现的候选最多延伸两层。补全失败保留已识别目录。
- 已注册书源校验站点与站内书号；未知站点限同站候选，并要求补全页的规范书名匹配。推荐书、广告站和拦截页面不参与合并。图片可正常使用 CDN 地址。
- 只补缺少的标题、作者、封面、简介；同书标题可移除“全文阅读”等后缀。已有有效作者、封面不被覆盖，章节与阅读位置不参与资料合并。
- 浏览器导入、注册书源链接导入、旧书详情页共用流程。旧书详情页失焦时停止等待；响应迟到不会覆盖最新进度，也不会重新插入已经删除的书。

这是资料补全层，不替代已有章节路由、目录分页、章内分页和正文提取规则。无页面线索、站点拦截或非标准页面仍可能需要小范围扩展。

## 扩展方式

1. 页面公开了 OG、JSON-LD、封面容器、详情链接：直接使用通用规则，不注册站点。
2. 书源有备用详情地址或镜像：实现 `BookSource.metadataUrls(url)`；镜像还需由该书源的 `matchUrl` 和 `extractId` 确认同书身份。
3. 特殊布局：在 `BOOK_METADATA_EXTENSIONS` 登记 `MetadataExtension`，仅提供 `matches`、`candidates` 或 `extract`。超时、抓取次数、去重、同书校验、合并、诊断不需要重写。也可通过 `options.extensions` 注入做单独验证。
4. 测试或其他取页能力：注入 `options.fetchHtml(url, signal)`，无需耦合 WebView。

## 下次如何排查

真机固定文件：`Documents/diagnostics/book-metadata.json`，仅保存最近 20 个来源地址的资料报告，不保存网页 HTML、小说正文或书架快照。Web/Node 使用 `getBookMetadataReport(url)` 或 `onDiagnostic`；原生同时输出 `[BookMetadata]` 日志。

报告字段：

- `missing` / `remaining`：最初缺什么、最终还缺什么。
- `attempts[].url` / `via`：访问或拒绝哪个地址、候选从哪里来。
- `status` / `reason`：合并、无新字段、拒绝、失败，以及书名不符、跨书跨站、网络失败、超时等原因。
- `fields` / `rules`：哪些字段被补回、对应哪条提取规则。
- `resolved` / `elapsedMs`：最终资料与补全过程耗时。

例如玄幻阁真机此次报告：从 `source-detail` 访问 `/info-192466/`，通过 `image:book-container` 取得封面、`label:author` 取得“蛊真人”，补回四个资料字段，`remaining=[]`，耗时 2853 毫秒。

## 验证

- Swell5 Release 构建、安装成功。打开已有《仙工开物》详情后自动显示原封面、作者“蛊真人”和规范书名“仙工开物”，返回书架也显示原封面。
- 原有 1165 个目录项、8851 已缓存字数、3% 阅读进度及第 30 章续读入口保留；未重新导入目录。
- 从真机读取上述固定诊断文件，确认成功地址、字段来源、规则及耗时。
- 回归覆盖 DOM/HTML 一致性、真实 RN URL 环境、未知站点及原页发现、去重、同书校验、扩展规则、备用地址失败、请求预算、总超时、取消，以及迟到响应期间更新进度、删书和卸载页面。
- 最终全量 Jest：71 套件、489 项测试通过；新增服务、hook 和对应回归 ESLint 无错误或警告，diff check 通过。
- Web production 构建通过，仍有原有两条包体积提示。全量类型检查仍只有详情页原有的 `Image.pointerEvents` 类型错误，本次未修改该图片节点。
- 改动未提交或推送。

## 玄鉴仙族追加排查

用户在浏览器目录预览发现默认封面后，读取真机当前 `/info-220996/` 的 HTML。图片地址为 `http://wap.xuanhuange.info/modules/article/images/nocover.jpg`。当时依据文件名将它判断成占位图；后续真机复核确认网页实际展示《玄鉴仙族》封面，之前的判断错误，修正见下文。

同时发现两个此前未覆盖的实际问题：

1. 浏览器底部预览未接入补全，只有加入书架和详情页会补资料。现已由 `useRecognizedBookMetadata` 接入预览；异步补回资料时保留最新目录，重复自动识别不重复抓取，切站/失焦取消，入库复用已完成的预览结果。站点占位封面会显示“本站未提供原封面，暂用默认封面”。
2. 真机 Release 使用 Hermes，`Function.toString()` 返回 `function extractBookMetadata(a0, a1, a2) { [bytecode] }`。通过 LLDB 读取当前 RNCWebView 的 `injectedJavaScript` 已确认此字符串真实进入网页；可见页资料提取执行时失败，随后退回旧规则。JSDOM 的普通函数源码没有复现这个差异；此前仙工开物的真机成功来自原生 HTML 补全路径，不能证明 DOM 注入也成功。

现改为 `scripts/generate-book-metadata-script.cjs` 从唯一 TS 提取器生成 `bookMetadataScript.generated.ts` 静态脚本文本。启动 Metro、Web 构建、Swell5 续装前自动生成；修改规则后也可运行 `npm run generate:metadata-script`。回归检查生成结果与源文件一致，并模拟 Hermes 的 bytecode 字符串验证网页封面提取。

诊断新增 `outcome`（complete / partial / cancelled / timeout）、占位封面 issues 与 `site-placeholder-cover` 原因；用户取消时也记录正在访问的地址和 `caller-aborted`，避免只有空 attempts 而无法区分从未请求与中途取消。

未提取到封面时，流程保留默认封面。跨书源找图片需要额外核验书名、作者和图片来源；`nocover` 文件名本身不证明原站缺少本书封面。

追加修复验证：72 套件、495 项测试通过；相关服务与回归 ESLint 无错误或警告，Web production 构建通过。Release 已成功覆盖安装到 Swell5；安装后用户更换测试手机，新预览提示改在下述新设备完成复核。

用户更换手机后，已在“江测试机”（iPhone 12 Pro Max，iOS 18.7.8）重新构建并覆盖安装 Release。构建与安装成功；描述文件包含新设备，签名有效至 2026-10-16。首次启动被 iOS 的开发者信任检查拒绝，用户完成签名信任后，已成功启动并通过手机镜像完成预览验收：

- 《仙工开物》详情页预览直接显示原封面与作者，确认静态 DOM 注入在 Hermes Release 中生效。目录页预览显示原封面、作者“蛊真人”、本页 40 项与 30 页目录；固定诊断报告确认从 `source-detail` 补回 author/cover，耗时 1486 毫秒，`outcome=complete`、`remaining=[]`。
- 《玄鉴仙族》详情页和目录页都明确提示“本站未提供原封面，暂用默认封面”。目录页预览显示作者“季越人”、本页 40 项与 44 页目录。固定报告确认详情页 `placeholder-cover` / `site-placeholder-cover`，继续访问目录原页后仍缺 cover，耗时 2781 毫秒，最终 `outcome=partial`、`remaining=[cover]`。
- 核对过程仅查看浏览器识别预览，未将详情页的 16 条最新章节预览误当完整目录导入书架。诊断结果已读取至 `/tmp/swell-new-phone-metadata.json`。

## 玄鉴仙族封面文件名误过滤修正

2026-10-09 再次在 Swell5 真机复核：网页显示有书名和树木图案的《玄鉴仙族》封面，App 预览却显示默认图和“本站未提供原封面”。读取当前可见 WKWebView 的 `.block_img2 img`，`src` 与 `currentSrc` 均为上述 `nocover.jpg`；固定补全报告仍记录 `placeholder-cover`。因此问题是文件名黑名单误过滤，并非站点没有封面，也不是图片加载失败。

- 共享提取器、DOM 兼容分支和补全合并统一移除 `nocover` 文件名拒绝条件；仍只接受书籍 meta、结构化资料、明确封面容器或匹配书名的图片，继续过滤 `no_photo` 等失败图片。
- 未硬编码书号或封面 URL，没有新增跨站图片搜索。站点复用的图片地址仍可能改变内容，当前结果表示采用站点为本书展示的图片。
- 回归先复现失败，再验证 DOM、HTML、目录补全都保留封面；同时验证无关图片不会误提取、OG 兼容分支不会重新写回 `no_photo`。
- 最终验证：77 套件、557 项测试通过，TypeScript 和相关文件 ESLint 通过；Web production 构建通过（既有 2 条包体积警告），Swell5 Release 构建、覆盖安装成功。
- 真机详情预览显示与网页一致的封面；从“查看目录”进入后仍成功补全封面，显示本页 40 项、44 页目录。固定报告确认 `source-detail` / `image:book-container` 补回 author、cover，耗时 1585 毫秒，`outcome=complete`、`remaining=[]`。核对过程中未重新导入书籍。
- [真机截图及节点、补全报告](./2026-10-09-xuanjian-cover/)。本次修复尚未提交。
