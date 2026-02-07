# Android Studio 配置本地 Gradle 指南

## 问题
Android Studio 默认使用 Gradle Wrapper 从网络下载 Gradle，如果网络有问题或想使用本地已安装的 Gradle，需要配置 Android Studio 使用本地 Gradle。

## 解决方案

### 方法一：在 Android Studio 中配置（推荐）

1. **打开 Android Studio**
2. **打开项目**：File → Open → 选择 `android` 文件夹
3. **打开设置**：
   - Windows/Linux: **File** → **Settings**（或按 `Ctrl+Alt+S`）
   - Mac: **Android Studio** → **Preferences**（或按 `Cmd+,`）
4. **导航到 Gradle 设置**：
   - 左侧菜单：**Build, Execution, Deployment** → **Build Tools** → **Gradle**
5. **配置 Gradle 使用**：
   - 选择 **Use local gradle distribution**
   - **Gradle home**: 输入 `D:\ruanjian\gradle-8.14`
   - 或者点击文件夹图标浏览选择该目录
6. **应用设置**：点击 **Apply** 和 **OK**
7. **同步项目**：
   - 点击顶部工具栏的 **Sync Project with Gradle Files** 图标（🔄）
   - 或 **File** → **Sync Project with Gradle Files**

### 方法二：通过项目设置配置

1. **打开项目结构**：
   - **File** → **Project Structure**（或按 `Ctrl+Alt+Shift+S`）
2. **选择 SDK Location** 标签页
3. **设置 Gradle**：
   - 在 **Gradle settings** 部分
   - 选择 **Use local gradle distribution**
   - **Gradle home**: `D:\ruanjian\gradle-8.14`
4. 点击 **OK**
5. **同步项目**

### 方法三：修改 gradle.properties（项目级别）

在 `android/gradle.properties` 文件中添加：

```properties
# 使用本地 Gradle
org.gradle.java.home=C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot
```

但 Gradle 路径需要在 Android Studio 设置中配置。

## 验证配置

配置完成后，可以通过以下方式验证：

1. **查看 Gradle 版本**：
   - 打开 Android Studio 的 **Terminal**（底部面板）
   - 运行：`cd android` 然后 `.\gradlew.bat --version`
   - 应该显示 Gradle 8.14

2. **查看构建输出**：
   - 执行一次构建（Build → Make Project）
   - 在 **Build** 输出面板中查看是否使用了本地 Gradle

## 常见问题

### 1. Android Studio 仍然下载 Gradle

**原因**：Gradle Wrapper 配置会优先使用 wrapper 下载的版本。

**解决**：
- 确保在 Android Studio 设置中选择了 **Use local gradle distribution**
- 删除 `android/.gradle` 文件夹（如果存在）后重新同步
- 删除 `~/.gradle/wrapper/dists` 中的缓存（可选）

### 2. Gradle 版本不匹配

**检查**：
- 本地 Gradle 版本：`D:\ruanjian\gradle-8.14\bin\gradle.bat --version`
- 项目要求的版本：查看 `android/gradle/wrapper/gradle-wrapper.properties` 中的 `distributionUrl`

**当前项目要求**：Gradle 8.14（已匹配 ✅）

### 3. Java 版本问题

确保本地 Gradle 8.14 与 Java 版本兼容：
- Gradle 8.14 支持 Java 8-21
- 当前项目使用 Java 17（兼容 ✅）

### 4. 权限问题

如果遇到权限错误：
- 确保 `D:\ruanjian\gradle-8.14` 目录可读
- 以管理员身份运行 Android Studio（如果需要）

## 推荐配置

### Android Studio 设置（File → Settings → Build Tools → Gradle）

```
✅ Use local gradle distribution
Gradle home: D:\ruanjian\gradle-8.14

✅ Use Gradle 'wrapper' task configuration（取消勾选，如果使用本地 Gradle）
```

### 项目级别设置

在 `android/gradle.properties` 中已配置：
```properties
JAVA_HOME=C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot
org.gradle.java.home=C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot
```

## 快速检查清单

- [ ] Android Studio 已安装并打开
- [ ] 项目已打开（`android` 文件夹）
- [ ] Gradle 设置中选择了 **Use local gradle distribution**
- [ ] Gradle home 路径设置为 `D:\ruanjian\gradle-8.14`
- [ ] 已同步项目（Sync Project with Gradle Files）
- [ ] 构建成功（Build → Make Project）

## 如果仍然失败

1. **检查 Gradle 安装**：
   ```powershell
   D:\ruanjian\gradle-8.14\bin\gradle.bat --version
   ```

2. **检查 Java 环境**：
   ```powershell
   java -version
   ```

3. **清理并重新同步**：
   - File → Invalidate Caches / Restart
   - 选择 **Invalidate and Restart**

4. **查看详细错误**：
   - View → Tool Windows → Build
   - 查看错误日志

5. **使用命令行验证**：
   ```powershell
   cd android
   D:\ruanjian\gradle-8.14\bin\gradle.bat tasks
   ```
