# Jotai 状态管理架构文档

## 概述

本项目使用 [Jotai](https://jotai.org/) 作为状态管理库。Jotai 是一个基于原子化（Atomic）状态管理的轻量级库，非常适合 React Native 应用。

## 架构设计原则

1. **原子化状态管理**：每个状态都是独立的原子（atom），可以单独使用和组合
2. **类型安全**：所有状态都有完整的 TypeScript 类型定义
3. **高可维护性**：按功能模块组织代码，清晰的目录结构
4. **高可读性**：使用自定义 Hooks 封装业务逻辑，提供简洁的 API
5. **性能优化**：利用 Jotai 的自动优化，只更新依赖的组件

## 目录结构

```
src/store/
├── types/              # TypeScript 类型定义
│   ├── book.ts         # 书籍相关类型
│   ├── reader.ts       # 阅读器相关类型
│   └── settings.ts     # 设置相关类型
├── atoms/              # 原子状态定义
│   ├── bookAtoms.ts    # 书籍管理 atoms
│   ├── readerAtoms.ts  # 阅读器 atoms
│   ├── settingsAtoms.ts # 应用设置 atoms
│   └── index.ts        # 统一导出
├── hooks/              # 自定义 Hooks
│   ├── useBooks.ts     # 书籍管理 hooks
│   ├── useReader.ts    # 阅读器 hooks
│   ├── useSettings.ts  # 设置 hooks
│   └── index.ts        # 统一导出
└── index.ts            # Store 统一导出入口
```

## 核心概念

### 1. Atoms（原子状态）

Atoms 是状态的最小单位，可以是原始值、对象或数组。

**示例**：
```typescript
// 基础 atom
export const booksAtom = atom<Book[]>([]);

// 派生 atom（computed）
export const currentBookAtom = atom<Book | null>((get) => {
  const bookId = get(selectedBookIdAtom);
  if (!bookId) return null;
  const books = get(booksAtom);
  return books.find((book) => book.id === bookId) || null;
});
```

### 2. Hooks（自定义 Hooks）

封装业务逻辑，提供简洁的 API。

**示例**：
```typescript
// 使用 hook
const books = useBooks();
const addBook = useAddBook();

// 添加书籍
addBook({
  id: '1',
  title: '示例书籍',
  author: '作者',
  // ...
});
```

## 模块说明

### 书籍管理模块 (`bookAtoms.ts`)

**Atoms**：
- `booksAtom` - 所有书籍列表
- `selectedBookIdAtom` - 当前选中的书籍 ID
- `currentBookAtom` - 当前书籍（派生状态）
- `chaptersAtom` - 章节列表（按书籍 ID 索引）
- `bookmarksAtom` - 书签列表
- `readingHistoryAtom` - 阅读历史
- `bookSearchQueryAtom` - 搜索关键词
- `filteredBooksAtom` - 筛选后的书籍列表（派生状态）

**Hooks**：
- `useBooks()` - 获取筛选后的书籍列表
- `useAllBooks()` - 获取所有书籍
- `useCurrentBook()` - 获取当前书籍
- `useSelectBook()` - 选择书籍
- `useAddBook()` - 添加书籍
- `useRemoveBook()` - 删除书籍
- `useUpdateBook()` - 更新书籍信息
- `useUpdateReadingProgress()` - 更新阅读进度
- `useSetChapters()` - 设置章节列表
- `useBookChapters()` - 获取书籍章节
- `useBookSearch()` - 书籍搜索

**使用示例**：
```typescript
import { useBooks, useAddBook, useSelectBook } from '@/store';

function BookshelfScreen() {
  const books = useBooks();
  const addBook = useAddBook();
  const selectBook = useSelectBook();
  
  // 添加书籍
  const handleAddBook = () => {
    addBook({
      id: Date.now().toString(),
      title: '新书籍',
      author: '作者',
      addedAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
    });
  };
  
  // 选择书籍
  const handleSelectBook = (bookId: string) => {
    selectBook(bookId);
  };
  
  return (
    // ...
  );
}
```

### 阅读器模块 (`readerAtoms.ts`)

**Atoms**：
- `readerSettingsAtom` - 阅读设置（字体大小、颜色等）
- `readerStateAtom` - 阅读器状态（当前章节、滚动位置等）
- `currentChapterContentAtom` - 当前章节内容
- `currentChapterIndexAtom` - 当前章节索引
- `isLoadingChapterAtom` - 章节加载状态

**Hooks**：
- `useReaderSettings()` - 获取阅读设置
- `useUpdateReaderSettings()` - 更新阅读设置
- `useResetReaderSettings()` - 重置阅读设置
- `useReaderState()` - 获取阅读器状态
- `useUpdateReaderState()` - 更新阅读器状态
- `useToggleToolbar()` - 切换工具栏显示/隐藏
- `useSetToolbarVisible()` - 设置工具栏可见性
- `useCurrentChapterContent()` - 获取当前章节内容
- `useSetChapterContent()` - 设置章节内容
- `useCurrentChapterIndex()` - 获取章节索引
- `useSetChapterIndex()` - 设置章节索引
- `useIsLoadingChapter()` - 获取加载状态
- `useSetLoadingChapter()` - 设置加载状态

**使用示例**：
```typescript
import { useReaderSettings, useUpdateReaderSettings } from '@/store';

function ReaderScreen() {
  const settings = useReaderSettings();
  const updateSettings = useUpdateReaderSettings();
  
  // 调整字体大小
  const handleFontSizeChange = (size: number) => {
    updateSettings({ fontSize: size });
  };
  
  return (
    <View style={{ backgroundColor: settings.backgroundColor }}>
      <Text style={{ fontSize: settings.fontSize, color: settings.textColor }}>
        内容
      </Text>
    </View>
  );
}
```

### 应用设置模块 (`settingsAtoms.ts`)

**Atoms**：
- `appSettingsAtom` - 应用设置（主题、语言、通知等）
- `isDarkModeAtom` - 是否深色模式（派生状态）

**Hooks**：
- `useAppSettings()` - 获取应用设置
- `useUpdateAppSettings()` - 更新应用设置
- `useToggleTheme()` - 切换主题
- `useSetTheme()` - 设置主题
- `useIsDarkMode()` - 获取是否深色模式
- `useToggleNotifications()` - 切换通知
- `useSetNotificationsEnabled()` - 设置通知启用状态

**使用示例**：
```typescript
import { useAppSettings, useToggleTheme } from '@/store';

function SettingsScreen() {
  const settings = useAppSettings();
  const toggleTheme = useToggleTheme();
  
  return (
    <Switch
      value={settings.theme === 'dark'}
      onValueChange={toggleTheme}
    />
  );
}
```

## 最佳实践

### 1. 使用自定义 Hooks

**推荐**：
```typescript
// ✅ 使用自定义 hook
const books = useBooks();
const addBook = useAddBook();
```

**不推荐**：
```typescript
// ❌ 直接使用 atom
const [books, setBooks] = useAtom(booksAtom);
```

### 2. 派生状态使用派生 Atom

**推荐**：
```typescript
// ✅ 使用派生 atom
export const currentBookAtom = atom<Book | null>((get) => {
  const bookId = get(selectedBookIdAtom);
  const books = get(booksAtom);
  return books.find(b => b.id === bookId) || null;
});
```

**不推荐**：
```typescript
// ❌ 在组件中计算
const currentBook = books.find(b => b.id === selectedBookId);
```

### 3. 按功能模块组织

- 每个功能模块有独立的 atoms 文件
- 每个功能模块有独立的 hooks 文件
- 类型定义放在 `types/` 目录

### 4. 类型安全

- 所有 atoms 都有明确的类型
- 所有 hooks 都有返回类型
- 使用 TypeScript 严格模式

### 5. 性能优化

- 使用 `useAtomValue` 只读取值
- 使用 `useSetAtom` 只设置值
- 避免不必要的重新渲染

## 与主题系统集成

主题系统已与 Jotai 集成，通过 `appSettingsAtom` 管理主题设置：

```typescript
// ThemeContext 中使用 Jotai
const appSettings = useAtomValue(appSettingsAtom);
const isDarkMode = appSettings.theme === 'dark' || 
                   (appSettings.theme === 'auto' && systemColorScheme === 'dark');
```

## 扩展指南

### 添加新的 Atom

1. 在对应的 `atoms/` 文件中添加 atom
2. 在 `atoms/index.ts` 中导出
3. 在 `store/index.ts` 中导出（如果需要）

### 添加新的 Hook

1. 在对应的 `hooks/` 文件中添加 hook
2. 在 `hooks/index.ts` 中导出
3. 在 `store/index.ts` 中导出

### 添加新的类型

1. 在 `types/` 目录中添加类型定义文件
2. 在 `store/index.ts` 中导出

## 常见问题

### Q: 为什么使用 Jotai 而不是 Redux？

A: Jotai 更轻量级，API 更简洁，不需要 Provider，性能更好，更适合 React Native。

### Q: 如何持久化状态？

A: 可以使用 `jotai-persist` 或自定义持久化方案。后续可以添加 AsyncStorage 集成。

### Q: 如何处理异步操作？

A: 可以在 hooks 中处理异步操作，或者使用 `jotai/utils` 中的工具。

### Q: 如何调试状态？

A: 可以使用 React DevTools 或 Jotai DevTools（如果可用）。

## 参考资源

- [Jotai 官方文档](https://jotai.org/)
- [Jotai GitHub](https://github.com/pmndrs/jotai)
- [Jotai 最佳实践](https://jotai.org/docs/basics/concepts)
