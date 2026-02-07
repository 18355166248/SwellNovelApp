# 修复 Android Gradle Plugin (AGP) 升级问题

## 问题描述

Android Studio 提示需要将 AGP 从 8.12.0 升级到 8.13.0，但升级助手无法找到版本号。

## 原因

React Native 0.83.1 使用了新的 Gradle Plugin 管理方式，AGP 版本由 React Native Gradle Plugin 自动管理，因此在 `build.gradle` 中没有显式指定版本号：

```gradle
classpath("com.android.tools.build:gradle")  // 没有版本号
```

Android Studio 的升级助手无法识别这种配置方式。

## 解决方案

### ✅ 已修复

已在 `android/build.gradle` 中手动添加了 AGP 版本号：

```gradle
classpath("com.android.tools.build:gradle:8.13.0")
```

## 验证修复

1. **同步项目**：
   - 在 Android Studio 中点击 **Sync Project with Gradle Files**（🔄）
   - 或 **File** → **Sync Project with Gradle Files**

2. **检查构建**：
   - **Build** → **Clean Project**
   - **Build** → **Make Project**

3. **验证版本**：
   - 在 **Build** 输出面板中查看，应该不再显示升级警告

## 如果仍然有问题

### 方法一：手动检查 AGP 版本

在 Android Studio Terminal 中运行：
```powershell
cd android
.\gradlew.bat dependencies --configuration classpath | Select-String "com.android.tools.build:gradle"
```

应该显示 `8.13.0`。

### 方法二：清理并重新同步

1. **File** → **Invalidate Caches / Restart**
2. 选择 **Invalidate and Restart**
3. 等待项目重新索引和同步

### 方法三：检查 React Native 版本兼容性

React Native 0.83.1 支持 AGP 8.12.0 - 8.13.0+，当前配置的 8.13.0 是兼容的。

## 相关文件

- `android/build.gradle` - 已更新 AGP 版本
- `android/gradle.properties` - Gradle 配置
- `android/gradle/wrapper/gradle-wrapper.properties` - Gradle Wrapper 版本

## 注意事项

1. **版本兼容性**：
   - AGP 8.13.0 需要 Gradle 8.13+
   - 当前项目使用 Gradle 8.14（兼容 ✅）

2. **React Native 插件**：
   - React Native Gradle Plugin 会自动管理兼容的 AGP 版本
   - 手动指定版本可以确保使用特定版本

3. **未来升级**：
   - 如果需要升级 AGP，只需修改 `build.gradle` 中的版本号
   - 确保新版本与 React Native 版本兼容

## 当前配置

- **React Native**: 0.83.1
- **Android Gradle Plugin**: 8.13.0
- **Gradle**: 8.14
- **Java**: 17.0.18

所有版本都是兼容的 ✅
