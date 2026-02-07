# SwellNovel App 项目规则

## 项目概述

SwellNovel App 是一个基于 React Native 开发的跨平台小说阅读器应用，支持 Android 和 iOS 平台。

## 技术栈

- **框架**: React Native 0.83.1
- **语言**: TypeScript
- **React 版本**: 19.2.0
- **构建工具**: Metro Bundler
- **包管理**: npm

## 代码规范

### 通用规则

1. **代码风格**
   - 使用 TypeScript 进行类型检查
   - 遵循 ESLint 和 Prettier 配置
   - 使用函数式组件和 Hooks
   - 组件文件使用 PascalCase 命名（如 `HomeScreen.tsx`）
   - 工具函数和常量使用 camelCase 命名

2. **文件组织**
   - 组件放在 `src/components/` 目录
   - 页面放在 `src/screens/` 目录
   - 工具函数放在 `src/utils/` 目录
   - 类型定义放在 `src/types/` 目录
   - 常量配置放在 `src/constants/` 目录
   - 样式文件可以内联或放在 `src/styles/` 目录

3. **组件规范**
   - 每个组件应该有清晰的职责
   - 使用 TypeScript 定义 Props 类型
   - 优先使用函数式组件
   - 合理使用 React Hooks（useState, useEffect, useMemo, useCallback 等）
   - 组件应该支持深色模式（使用 `useColorScheme`）

4. **样式规范**
   - 使用 StyleSheet.create 创建样式
   - 支持深色模式和浅色模式切换
   - 使用响应式设计，适配不同屏幕尺寸
   - 颜色值应该根据主题动态调整

5. **性能优化**
   - 使用 React.memo 优化组件渲染
   - 使用 useMemo 和 useCallback 避免不必要的计算和函数重建
   - 长列表使用 FlatList 或 VirtualizedList
   - 图片使用适当的缓存策略

## 小说阅读器特定规则

### 阅读器功能

1. **文本显示**
   - 支持多种字体大小设置
   - 支持行间距和段间距调整
   - 支持背景颜色和文字颜色自定义
   - 支持翻页动画（左右滑动、上下滚动）

2. **阅读体验**
   - 支持章节跳转
   - 支持书签功能
   - 支持阅读进度保存
   - 支持夜间模式（护眼模式）
   - 支持横屏和竖屏阅读

3. **书籍管理**
   - 支持本地书籍导入（TXT, EPUB 等格式）
   - 支持在线书籍搜索和下载
   - 支持书架管理（添加、删除、分类）
   - 支持阅读历史记录

4. **数据存储**
   - 使用 AsyncStorage 存储用户设置和阅读进度
   - 书籍内容可以存储在本地文件系统
   - 考虑使用 SQLite 或 Realm 存储结构化数据

### UI/UX 规范

1. **阅读界面**
   - 阅读区域应该占据屏幕主要部分
   - 顶部和底部工具栏可以隐藏，通过点击屏幕显示/隐藏
   - 翻页手势应该流畅自然
   - 支持点击屏幕左右区域进行翻页

2. **书架界面**
   - 使用网格或列表展示书籍
   - 显示书籍封面、书名、作者、阅读进度
   - 支持搜索和筛选功能
   - 支持下拉刷新

3. **设置界面**
   - 字体大小、行间距、背景色等阅读设置
   - 主题切换（浅色/深色/护眼模式）
   - 缓存管理
   - 关于页面

## 开发指南

### 运行项目

```bash
# 安装依赖
npm install

# 启动 Metro Bundler
npm start

# 运行 Android
npm run android

# 运行 iOS
npm run ios
```

### 构建项目

```bash
# 构建 Android APK
npm run build:android:apk

# 构建 Android AAB
npm run build:android:aab

# 构建 iOS
npm run build:ios
```

### 代码检查

```bash
# 运行 ESLint
npm run lint

# 运行测试
npm test
```

## 注意事项

1. **平台差异**
   - Android 和 iOS 的导航方式可能不同，需要适配
   - 文件系统访问权限处理方式不同
   - 状态栏和导航栏的处理需要分别适配

2. **性能考虑**
   - 大文本文件需要分页加载，避免一次性加载全部内容
   - 图片资源需要优化，避免内存溢出
   - 长列表需要虚拟化处理

3. **用户体验**
   - 加载状态应该有明确的提示
   - 错误处理应该有友好的错误提示
   - 操作反馈应该及时（如翻页、切换章节）

4. **代码质量**
   - 禁止使用嵌套的三元表达式，多层三元表达式请根据情况选择使用 if else 或者策略模式实现
   - 不要删除代码中未主动要求修改的注释
   - 添加 console 日志时使用统一的前缀标识，便于在控制台中搜索

5. **Git 提交**
   - 使用中文编写 Git commit message
   - commit message 应该清晰描述本次修改的内容

## 项目结构建议

```
src/
├── components/          # 可复用组件
│   ├── BookCard/       # 书籍卡片组件
│   ├── Reader/         # 阅读器组件
│   └── ...
├── screens/            # 页面组件
│   ├── HomeScreen.tsx  # 首页/书架
│   ├── ReaderScreen.tsx # 阅读页面
│   ├── SearchScreen.tsx # 搜索页面
│   └── SettingsScreen.tsx # 设置页面
├── navigation/         # 导航配置
├── services/           # 业务逻辑服务
│   ├── bookService.ts  # 书籍相关服务
│   └── storageService.ts # 存储服务
├── utils/              # 工具函数
├── types/              # TypeScript 类型定义
├── constants/          # 常量配置
└── styles/             # 全局样式（可选）
```

## 未来扩展功能

- 支持更多书籍格式（EPUB, MOBI 等）
- 支持在线书源管理
- 支持阅读统计（阅读时长、阅读字数等）
- 支持笔记和标注功能
- 支持阅读社区功能
- 支持语音朗读功能
