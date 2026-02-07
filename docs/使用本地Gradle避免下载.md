# 使用本地 Gradle 避免下载

## 问题

Gradle Wrapper 仍然尝试从网络下载 Gradle 8.14，即使本地已安装。

## 解决方案

### 方法一：使用本地 Gradle 命令（最简单，推荐）

不使用 `gradlew`，直接使用本地 `gradle` 命令：

```bash
# 设置环境变量（如果还没设置）
$env:GRADLE_HOME = "D:\ruanjian\gradle-8.14"
$env:PATH = "$env:PATH;$env:GRADLE_HOME\bin"

# 使用本地 gradle
cd android
gradle clean
gradle assembleDebug
```

**优点**：
- 不需要配置 Wrapper
- 立即生效
- 不依赖网络

**缺点**：
- 需要确保环境变量已设置
- 团队成员需要各自配置

### 方法二：创建符号链接（需要管理员权限）

运行脚本创建符号链接：

```powershell
# 以管理员身份运行
.\scripts\link-gradle-to-wrapper.ps1
```

这会在 Gradle Wrapper 缓存目录创建符号链接，指向本地 Gradle。

**优点**：
- Wrapper 可以使用本地 Gradle
- 不需要修改构建脚本

**缺点**：
- 需要管理员权限
- 符号链接在某些情况下可能不工作

### 方法三：复制到 Wrapper 缓存（如果符号链接失败）

如果符号链接不工作，可以复制 Gradle 到缓存目录：

```powershell
.\scripts\setup-gradle-wrapper-local.ps1
```

**注意**：复制过程中可能遇到文件锁定错误（Gradle 缓存文件正在使用）。

**解决方法**：
1. 关闭所有使用 Gradle 的程序
2. 停止 Gradle daemon：`gradle --stop`
3. 重新运行脚本

### 方法四：修改 React Native 构建脚本

修改 `package.json` 中的脚本，使用本地 gradle：

```json
{
  "scripts": {
    "android": "cd android && gradle assembleDebug && cd .. && react-native run-android"
  }
}
```

但这需要确保 `gradle` 命令在 PATH 中。

## 推荐配置

### 1. 设置环境变量（永久）

运行：
```powershell
.\scripts\set-gradle-env.ps1 -UserOnly
```

或手动设置系统环境变量 `GRADLE_HOME`。

### 2. 使用本地 Gradle 命令

在构建脚本中使用 `gradle` 而不是 `gradlew`：

```bash
# 在 android 目录
gradle clean
gradle assembleDebug
```

### 3. 或者在 Android Studio 中配置

1. `File -> Settings -> Build Tools -> Gradle`
2. 选择 "Use local gradle distribution"
3. 设置路径：`D:\ruanjian\gradle-8.14`

## 验证配置

### 检查环境变量

```powershell
$env:GRADLE_HOME
# 应该显示: D:\ruanjian\gradle-8.14
```

### 测试 Gradle 命令

```bash
gradle --version
# 应该显示: Gradle 8.14
```

### 测试 Wrapper（如果配置了符号链接）

```bash
cd android
.\gradlew.bat --version
# 应该使用本地 Gradle，不会下载
```

## 当前状态

✅ 已设置用户环境变量 `GRADLE_HOME`  
✅ 本地 Gradle 8.14 可用  
⚠️  Gradle Wrapper 可能仍会尝试下载

## 快速解决

**立即使用本地 Gradle**：

```powershell
# 1. 设置环境变量（当前会话）
$env:GRADLE_HOME = "D:\ruanjian\gradle-8.14"
$env:PATH = "$env:PATH;$env:GRADLE_HOME\bin"

# 2. 使用本地 gradle 构建
cd android
gradle clean
gradle assembleDebug

# 3. 或者直接运行 React Native（如果配置了）
cd ..
npm run android
```

## 相关脚本

- `scripts/set-gradle-env.ps1` - 设置环境变量
- `scripts/link-gradle-to-wrapper.ps1` - 创建符号链接
- `scripts/setup-gradle-wrapper-local.ps1` - 复制到缓存目录
