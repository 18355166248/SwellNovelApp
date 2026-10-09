# 网站导入广告闪烁修复

2026-10-09，Swell5 真机（iPhone 13 Pro Max），轻读内置浏览器当前 `https://www.bqquge.org/6`《借剑》详情页。

## 原因与修复

用户反馈黄色广告反复闪现。读取当前 WKWebView 发现净化脚本已安装，固定广告宿主已有隐藏标记；其中一组广告被拆为 40 个背景切片，随机 class，`z-index:2147483646`。静态快照只能确认抓取时广告已隐藏，不能证明没有闪烁。

旧脚本把 DOM 变化合并后延迟 80ms 处理，广告插入或重写 `display:block!important` 时，可以先绘制再被隐藏。新增回归在第一帧检查切片可见性，旧版失败（display=block）。

改为在 MutationObserver 回调内合并同批变动并立即净化，处理图片加载时也立即检查。保留子树扫描、重复注入保护、样式幂等修复，以及书籍封面、目录、表单和验证码保护；未新增书号或广告 class 硬编码。

## 验证

- 新增回归验证背景广告切片首次插入及三次重写 important 样式，第一帧均已隐藏；既有长目录回归仍验证单张广告变动不重新扫描整本目录。
- 全量 Jest：77 套件、558 项测试通过。TypeScript、相关文件 ESLint、diff check 通过；Web production 构建通过，仍有两条既有包体积警告。
- Release 构建并覆盖安装到 Swell5，保留书架；通过镜像启动新版并重新打开原页面、刷新，书名、封面和导入预览正常显示。
- 实际 WKWebView 中选取当前 42 个已隐藏固定广告宿主，连续采样 6006ms、343 个 requestAnimationFrame，visibleFrames=0；主动对其中一个背景切片三次写入 `display:block!important`，下一帧 display 与 inline 值均为 none。测试完停止采样、删除临时页面报告变量并解除调试。
- 逐帧结果覆盖已识别的当前广告宿主，不代表所有网站或未来广告形态均已覆盖。镜像截图也不能单独证明每一帧没有闪烁。

节点摘要：[host-before.json](./host-before.json)。真机逐帧结果：[frame-after.json](./frame-after.json)。

本轮尚未提交。
