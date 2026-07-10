# 轻读

轻读是一款基于 React Native 的本地优先小说阅读器，支持 iOS、Android 和 Web。
核心能力包括 TXT 导入、在线书源、左右翻页/上下滚动、书签、阅读进度、阅读统计与运行时字体下载。

## 当前能力

- 本地 TXT 导入、自动章节识别与书架管理
- 在线搜索、URL/内置浏览器识别入库、章节缓存与更新检查
- 左右翻页和上下滚动，目录搜索、书签与续读
- 字号、行距、主题、亮度和多种可下载中文字体
- 原生文件持久化；Web 使用 localStorage + IndexedDB
- iOS、Android、Web 三端构建

暂未提供 EPUB、划线笔记、语音朗读、云同步和后台更新通知。界面不会展示尚未实现的服务。

## 技术栈

- React Native 0.83 / React 19 / TypeScript
- React Navigation 7 / Jotai 2
- Jest / ESLint / Webpack
- iOS 15.1+，Android API 24+

## 本地开发

```bash
npm install
npm start
```

Metro 固定运行在 `8082`。另开终端启动平台：

```bash
npm run ios
npm run android
npm run web
```

Web 默认使用 `8080`，在线书源代理由 Webpack 开发服务器提供。

## 质量检查

```bash
npm run lint
npm run test:ci
npm run typecheck
npm run build:web
```

发布前以上命令必须全部通过。字体、分页、书源解析和持久化迁移都有对应单元测试。
也可以直接执行 `npm run check`；GitHub Actions 会在每次 Push 和 Pull Request 自动运行同一检查。

## 项目结构

```text
src/screens/          页面与阅读器
src/store/            Jotai atoms、hooks、持久化桥
src/services/source/  在线书源适配器
src/services/fonts/   字体下载与原生注册
src/utils/            分页、导入、存储和通用算法
ios/                  iOS 原生工程与字体/亮度模块
android/              Android 原生工程与字体/亮度模块
server.js             Web 静态资源与白名单书源代理
```

## 数据存储

- 元数据：书籍、进度、书签、设置和统计
- 正文：按书拆分存储，打开书籍时懒加载
- 原生：App Documents 目录
- Web：localStorage + IndexedDB

当前数据仅保存在本机。删除 App 前请注意数据不会自动同步到其他设备。

## 在线书源代理

部分书源依赖 `server.js` 的 curl 白名单代理。生产代理地址统一配置在
`src/config/proxy.ts`。服务器必须安装 `curl`，且只能代理登记域名。

当前公网代理仍为 HTTP IP 地址，因此 iOS 需要 ATS 全局例外。正式商店发布前应为代理配置
HTTPS 域名和有效证书，再关闭 `NSAllowsArbitraryLoads`。

## 发布

- 版本号以 `package.json` 为 Android 和界面显示的来源；iOS `MARKETING_VERSION` 必须同步。
- Android Release 必须提供 `MYAPP_RELEASE_STORE_FILE` 等四个签名参数，缺少时构建会失败。
- iOS Archive 需要在 Xcode 中配置开发团队与发布证书。
- 不允许使用 debug 证书生成正式发布包。

详细现状和路线见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 内容与许可

项目本身不提供版权内容。在线书源仅用于用户主动访问公开页面；发布前需确认目标市场的内容、
版权、隐私与网络抓取合规要求。第三方字体按各自许可证使用。
