# Gradle 8.14 配置完成

## ✅ 当前状态

- **本地 Gradle 安装位置**: `D:\ruanjian\gradle-8.14`
- **Gradle 版本**: 8.14 ✅
- **环境变量**: `GRADLE_HOME` 已设置（当前会话）

## 使用方法

### 方法一：使用 Gradle Wrapper（推荐）

Gradle Wrapper 会自动检测并使用本地 Gradle（如果设置了 `GRADLE_HOME`）：

```bash
cd android
./gradlew --version
./gradlew clean
./gradlew assembleDebug
```

### 方法二：直接使用本地 Gradle

如果 `GRADLE_HOME` 已添加到 PATH：

```bash
cd android
gradle --version
gradle clean
gradle assembleDebug
```

### 方法三：在 Android Studio 中配置

1. 打开 Android Studio
2. `File -> Settings -> Build, Execution, Deployment -> Build Tools -> Gradle`
3. 选择 **"Use local gradle distribution"**
4. 设置 Gradle home: `D:\ruanjian\gradle-8.14`
5. 点击 Apply 和 OK

## 永久设置环境变量

### Windows 系统设置（推荐）

1. 右键"此电脑" -> "属性"
2. 点击"高级系统设置"
3. 点击"环境变量"
4. 在"系统变量"中点击"新建"：
   - 变量名：`GRADLE_HOME`
   - 变量值：`D:\ruanjian\gradle-8.14`
5. 编辑 PATH 变量，添加：`%GRADLE_HOME%\bin`
6. 确定保存
7. **重启终端或 IDE 使环境变量生效**

### PowerShell 脚本（需要管理员权限）

运行项目中的脚本：

```powershell
# 以管理员身份运行
.\scripts\setup-local-gradle.ps1
```

## 验证配置

### 检查环境变量

```powershell
$env:GRADLE_HOME
```

### 检查 Gradle 版本

```bash
# 使用本地 Gradle
gradle --version

# 或使用 Wrapper
cd android
./gradlew --version
```

应该显示：
```
Gradle 8.14
```

## 快速启动脚本

项目已包含快速启动脚本，自动设置环境变量：

```powershell
.\scripts\quick-start.ps1
```

这会：
- 设置 `GRADLE_HOME`
- 设置 `JAVA_HOME`
- 检查 Metro Bundler 状态
- 检查 Android 设备连接

## 常见问题

### 1. Gradle Wrapper 仍然下载 Gradle

**原因**: 环境变量未设置或未生效

**解决**:
- 确保设置了 `GRADLE_HOME` 环境变量
- 重启终端或 IDE
- 或者在 Android Studio 中手动配置

### 2. 权限错误

**解决**:
- 确保 Gradle 目录有读取权限
- 以管理员身份运行终端（如果需要）

### 3. 版本不匹配

如果遇到版本问题，检查：
- `android/gradle/wrapper/gradle-wrapper.properties` 中的版本
- 本地 Gradle 版本是否匹配

## 下一步

现在可以：

1. **运行 React Native 应用**:
   ```bash
   npm run android
   ```

2. **构建 APK**:
   ```bash
   npm run build:android:apk
   ```

3. **在 Android Studio 中打开项目**:
   - 打开 `android` 文件夹
   - Gradle 会自动使用本地安装

## 相关文件

- `scripts/setup-local-gradle.ps1` - 设置系统环境变量
- `scripts/setup-gradle-local.ps1` - 配置本地 Gradle 使用
- `scripts/quick-start.ps1` - 快速启动脚本
- `android/gradle/wrapper/gradle-wrapper.properties` - Wrapper 配置
- `android/gradle.properties` - Gradle 项目配置
