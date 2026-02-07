# 修复 "Cannot find a Java installation" 错误

## 错误信息
```
Cannot find a Java installation on your machine (Windows 11 10.0 amd64) matching: {languageVersion=17, vendor=any vendor, implementation=vendor-specific, nativeImageCapable=false}. Toolchain auto-provisioning is not enabled.
```

## 解决方案

### 方法一：在 Android Studio 中配置 Java SDK（推荐）

1. **打开 Android Studio**
2. **打开项目结构**：
   - **File** → **Project Structure**（或按 `Ctrl+Alt+Shift+S`）
3. **选择 SDK Location** 标签页
4. **设置 JDK location**：
   - **JDK location**: `C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot`
   - 或者点击文件夹图标浏览选择该目录
5. 点击 **OK**
6. **同步项目**：
   - 点击顶部工具栏的 **Sync Project with Gradle Files** 图标（🔄）

### 方法二：在 Android Studio 设置中配置

1. **打开设置**：
   - **File** → **Settings**（或按 `Ctrl+Alt+S`）
2. **导航到**：
   - **Build, Execution, Deployment** → **Build Tools** → **Gradle**
3. **配置 Gradle JVM**：
   - 在 **Gradle JDK** 下拉菜单中选择已安装的 JDK 17
   - 如果没有，点击 **Download JDK** 或选择 **Add JDK** 添加本地 JDK
   - 路径：`C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot`
4. 点击 **Apply** 和 **OK**
5. **同步项目**

### 方法三：启用 Toolchain Auto-Provisioning（已更新）

已在 `android/gradle.properties` 中启用：
```properties
org.gradle.java.installations.auto-detect=true
org.gradle.java.installations.auto-download=true
```

这样如果本地找不到 Java，Gradle 会自动下载。

### 方法四：设置系统环境变量

1. **设置 JAVA_HOME**：
   - 右键 **此电脑** → **属性** → **高级系统设置** → **环境变量**
   - 在 **系统变量** 中新建：
     - 变量名：`JAVA_HOME`
     - 变量值：`C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot`
   - 在 **Path** 变量中添加：`%JAVA_HOME%\bin`
2. **重启 Android Studio**

### 方法五：验证 Java 安装

在 PowerShell 中运行：
```powershell
# 检查 Java 是否存在
Test-Path "C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot/bin/java.exe"

# 检查 Java 版本
& "C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot/bin/java.exe" -version
```

应该显示：
```
openjdk version "17.0.18" 2026-01-20 LTS
OpenJDK Runtime Environment Microsoft-13106358 (build 17.0.18+8-LTS)
```

## 验证修复

1. **清理项目**：
   - **Build** → **Clean Project**
2. **重新同步**：
   - **File** → **Sync Project with Gradle Files**
3. **尝试构建**：
   - **Build** → **Make Project**

如果仍然失败，查看 **Build** 输出面板的详细错误信息。

## 常见问题

### 1. 路径中的空格问题

Windows 路径中的空格可能导致问题。确保：
- 使用正斜杠 `/` 而不是反斜杠 `\`
- 或者在 Android Studio 中使用浏览功能选择路径

### 2. Android Studio 覆盖配置

Android Studio 的设置会覆盖 `gradle.properties` 中的配置。优先在 Android Studio 中配置。

### 3. 多个 Java 版本

如果系统有多个 Java 版本：
- 确保 Android Studio 使用 Java 17
- 检查 `java -version` 命令的输出
- 在 Android Studio 中明确指定 Java 17 路径

## 当前配置

- **Java 路径**: `C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot`
- **Java 版本**: 17.0.18
- **Gradle 版本**: 8.14
- **Auto-detect**: 已启用
- **Auto-download**: 已启用
