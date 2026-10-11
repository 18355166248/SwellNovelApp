# 阅读笔记与常用功能走查

2026-10-11，iPhone 17 Pro / iOS 26.2 模拟器，Release 构建。本轮按用户要求使用模拟器；未更新真机、未提交代码。

## 发现与修复

- 摘抄列表只显示正文三行、笔记两行，点击会直接跳转正文，缺少完整查看和继续编辑入口。新增独立的摘抄与笔记面板，完整展示已保存的摘抄，笔记可编辑，明确点击“回到原文”才跳转。保存或取消后回到摘抄列表。
- 未保存的修改原本可以随关闭操作直接丢失。关闭按钮、遮罩、取消与 Android 返回共用确认逻辑；保存正常关闭不弹确认。
- 原章节暂时不在目录时，旧摘抄与书签原本被过滤隐藏。现在保留记录并提示章节不可用；摘抄可以继续查看、修改，原文定位暂时禁用。
- 修改已有笔记按稳定 ID 更新，保留最新章节引用、原摘抄与创建时间。目录在编辑期间重排也不会用旧位置新增一条摘抄。再次长按已保存的段落会带回原笔记。
- 普通书签长按删除增加确认，与摘抄一致；按 ID 删除，避免误触后立即丢失书签。
- 书架网格补充两行书名与作者，减少对封面文字的依赖。
- 夜间摘抄标题、原文入口与阅读记录标签改用阅读面板文字色，避免深绿色文字在深色面板上难以辨认。

## 走查步骤与证据

| 步骤 | 操作                          | 状态与边界                                                                                                                 | 截图           |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1    | 书架打开本地验证书，返回书架  | 正常；原位置是第 2 章第 3 页，更新后保留；网格书名/作者已补充                                                              | 04、12         |
| 2    | 查看、编辑已有长笔记          | 已修复；完整摘抄和笔记可见，保存后仍是 1 条摘抄；不是重新插入                                                              | 03、19         |
| 3    | 未保存时关闭、取消放弃、保存  | 正常；取消放弃后修改仍在，保存后返回列表                                                                                   | 14             |
| 4    | 弹出软键盘                    | 正常；面板收缩，输入框与保存按钮位于键盘上方；仅验证此设备竖屏                                                             | 20             |
| 5    | 回到原文、从记录恢复、冷启动  | 正常；查看和编辑期间保持第 4 页，点原文后进入第 3 页，通过跳转前记录返回第 4 页。冷启动保留第 4 页、342 字已修改笔记及记录 | 15、17、18、19 |
| 6    | 搜书 → 网站导入 → 返回        | 正常；网站导入从入口展示，返回搜书。未重新执行各站网络解析                                                                 | 05、06         |
| 7    | 发现页等待刷新结束            | 正常；已有书目在刷新期间继续展示，刷新最终结束，按钮恢复可用                                                               | 11             |
| 8    | 我的 → 设置 → 缓存管理 → 返回 | 正常；统计完成，显示 7 本在线书、45 章缓存，零缓存操作禁用。仅查看统计，未清理缓存                                         | 07、08、09     |
| 9    | 设置 → 回收站 → 返回          | 正常；空状态与禁用清空按钮正确；未执行永久删除、备份恢复或 WebDAV 写入                                                     | 10             |

无对应章节的记录、编辑期间目录重排、超过正常输入上限的旧笔记与书签删除保护采用自动化回归验证，未通过修改用户库在原生界面造出这些状态。

## 自动化与构建

- 全量 `npm run check`：79 套测试、575 项用例全部通过，TypeScript 通过；ESLint 无错误，保留 190 条既有警告；Web 生产构建通过，保留 2 条包体积警告。
- 夜间颜色调整后，阅读器、摘抄面板及书签相关 34 项用例再次通过；TypeScript 与受影响源码 ESLint 无错误。
- 基线构建、本轮功能构建及最终夜间颜色构建均成功。最终应用已安装、启动于同一模拟器，未卸载或重建其书库。
- 测试覆盖查看/保存不改变阅读位置、目录重排不重复插入、不可用章节仍可编辑、未保存关闭保护、书签确认后只删目标、完整文本以及较长旧笔记。
- 新面板封装在 `src/screens/reader/ReaderExcerptSheet.tsx`；笔记更新通过共享书签数据保存，沿用既有持久化和备份格式。

日志：`/tmp/swell-reader-app-review-check-final.log`、`/tmp/swell-reader-review-final-focused.log`、`/tmp/swell-reader-review-color-build.log`。

## 范围与后续验收

本轮是常用入口和阅读笔记流程走查，不能据此宣称所有站点或所有功能无缺陷。未重测真实 WebDAV 上传/恢复、各网站的端到端解析、真机、横屏键盘、辅助功能大字号及 VoiceOver 完整操作。书签永久删除只在自动化数据中验证；原生未删除已有记录。

01、02 来自启动时发现的旧安装，仅保留排查背景。03 是重新编译当前源码后拍摄的权威问题基线。13、16 是本轮夜间颜色调整前的过程图；最终面板和记录以 18–20 为准。21 是软键盘下滚动尝试未发生变化的过程图，不作为滚动验收证据。所有用于结论的图片均为本轮新拍摄并检查的实际模拟器截图。

## 页面截图

修改前的笔记入口：

![当前源码基线的摘抄列表](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/03-notes-current-before.png)

书架优化后：

![书架展示书名和作者](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/12-bookshelf-after.png)

搜书和网站导入入口：

![搜书](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/05-search.png)
![网站导入入口](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/06-website-entry.png)

发现页刷新完成：

![发现页稳定状态](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/11-discover.png)

设置和管理页面：

![我的](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/07-profile.png)
![设置](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/08-settings.png)
![缓存统计](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/09-cache-management.png)
![回收站空状态](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/10-recycle-bin.png)

关闭保护及返回位置：

![未保存修改确认](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/14-unsaved-note-protection.png)
![从记录恢复原阅读页](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/17-reading-position-restored.png)

最终夜间阅读记录、笔记面板和软键盘：

![夜间阅读记录](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/18-record-night-after.png)
![最终笔记面板](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/19-notes-final.png)
![软键盘下保存按钮](/Users/xmly/Swell/code/SwellNovelApp/docs/audits/2026-10-11-reader-app-review/20-notes-keyboard-final.png)
