# 设置 Gradle 系统环境变量指南

## 目标

设置系统环境变量，让 Gradle 8.14 在所有应用程序中可用。

## 方式一：自动设置（推荐）

### 设置系统环境变量（需要管理员权限）

1. **以管理员身份打开 PowerShell**：
   - 按 `Win + X`
   - 选择 "Windows PowerShell (管理员)" 或 "终端 (管理员)"
   - 或者在开始菜单搜索 PowerShell，右键选择 "以管理员身份运行"

2. **导航到项目目录**：
   ```powershell
   cd F:\FrontEnd\Code\SwellNovalApp
   ```

3. **运行设置脚本**：
   ```powershell
   .\scripts\set-gradle-env.ps1
   ```

4. **验证设置**：
   ```powershell
   # 在新终端中验证
   $env:GRADLE_HOME
   gradle --version
   ```

### 只设置用户环境变量（不需要管理员）

如果不想使用管理员权限，可以只设置用户环境变量：

```powershell
.\scripts\set-gradle-env.ps1 -UserOnly
```

**注意**：用户环境变量只对当前用户生效，系统环境变量对所有用户生效。

## 方式二：手动设置（图形界面）

### Windows 10/11

1. **打开系统属性**：
   - 右键点击 "此电脑" 或 "我的电脑"
   - 选择 "属性"
   - 点击 "高级系统设置"

2. **打开环境变量设置**：
   - 点击 "环境变量" 按钮

3. **设置 GRADLE_HOME**：
   - 在 "系统变量" 区域点击 "新建"
   - 变量名：`GRADLE_HOME`
   - 变量值：`D:\ruanjian\gradle-8.14`
   - 点击 "确定"

4. **添加到 PATH**：
   - 在 "系统变量" 中找到 `Path` 变量
   - 点击 "编辑"
   - 点击 "新建"
   - 输入：`%GRADLE_HOME%\bin`
   - 点击 "确定" 保存所有更改

5. **验证**：
   - 打开新的命令提示符或 PowerShell
   - 运行：`gradle --version`

## 方式三：PowerShell 命令（快速）

### 设置系统环境变量（需要管理员）

```powershell
# 以管理员身份运行 PowerShell
[System.Environment]::SetEnvironmentVariable("GRADLE_HOME", "D:\ruanjian\gradle-8.14", "Machine")

# 添加到 PATH
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$gradleBin = "D:\ruanjian\gradle-8.14\bin"
if ($currentPath -notlike "*$gradleBin*") {
    $newPath = "$currentPath;$gradleBin"
    [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
}
```

### 设置用户环境变量（不需要管理员）

```powershell
[System.Environment]::SetEnvironmentVariable("GRADLE_HOME", "D:\ruanjian\gradle-8.14", "User")

$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$gradleBin = "D:\ruanjian\gradle-8.14\bin"
if ($currentPath -notlike "*$gradleBin*") {
    $newPath = if ($currentPath) { "$currentPath;$gradleBin" } else { $gradleBin }
    [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
}
```

## 验证设置

### 方法 1：检查环境变量

**PowerShell**：
```powershell
[System.Environment]::GetEnvironmentVariable("GRADLE_HOME", "Machine")  # 系统变量
[System.Environment]::GetEnvironmentVariable("GRADLE_HOME", "User")     # 用户变量
$env:GRADLE_HOME  # 当前会话
```

**CMD**：
```cmd
echo %GRADLE_HOME%
```

### 方法 2：测试 Gradle 命令

```bash
gradle --version
```

应该显示：
```
Gradle 8.14
```

### 方法 3：检查 PATH

**PowerShell**：
```powershell
$env:PATH -split ';' | Select-String "gradle"
```

**CMD**：
```cmd
echo %PATH% | findstr gradle
```

## 使环境变量生效

设置环境变量后，需要重启以下程序：

1. **所有 PowerShell 终端**
2. **所有 CMD 窗口**
3. **Android Studio**（如果已打开）
4. **VS Code / Cursor**（如果已打开）
5. **其他 IDE**

**快速刷新**（仅当前 PowerShell 会话）：
```powershell
$env:GRADLE_HOME = [System.Environment]::GetEnvironmentVariable("GRADLE_HOME", "Machine")
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
```

## 常见问题

### 1. 设置了环境变量但命令仍不可用

**原因**：程序在设置环境变量之前已启动

**解决**：
- 重启所有相关程序
- 或在新终端中测试

### 2. 权限不足

**错误**：`Access Denied` 或 `需要管理员权限`

**解决**：
- 使用管理员权限运行 PowerShell
- 或使用 `-UserOnly` 参数只设置用户环境变量

### 3. PATH 中已有 Gradle

**检查**：
```powershell
$env:PATH -split ';' | Select-String "gradle"
```

如果已有其他 Gradle 路径，可能需要：
- 移除旧的路径
- 或确保新路径在旧路径之前

### 4. Android Studio 仍使用旧配置

**解决**：
1. 关闭 Android Studio
2. `File -> Settings -> Build Tools -> Gradle`
3. 选择 "Use local gradle distribution"
4. 设置路径：`D:\ruanjian\gradle-8.14`
5. 重启 Android Studio

## 推荐配置

为了最佳体验，建议：

1. ✅ **设置系统环境变量**（所有用户可用）
2. ✅ **在 Android Studio 中也配置**（IDE 专用设置）
3. ✅ **重启所有相关程序**（使环境变量生效）

## 相关脚本

- `scripts/set-gradle-env.ps1` - 自动设置环境变量（推荐）
- `scripts/setup-local-gradle.ps1` - 旧版设置脚本
- `scripts/quick-start.ps1` - 快速启动脚本（临时设置）

## 下一步

设置完成后：

1. **验证环境变量**：
   ```bash
   gradle --version
   ```

2. **运行 React Native 项目**：
   ```bash
   npm run android
   ```

3. **在 Android Studio 中打开项目**：
   - Gradle 会自动使用本地安装
