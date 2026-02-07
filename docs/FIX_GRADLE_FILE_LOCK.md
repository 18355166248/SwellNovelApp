# Gradle 文件锁定问题修复

## 问题描述

错误信息：
```
Could not move temporary workspace to immutable location
java.nio.file.AccessDeniedException
```

## 原因分析

1. **Gradle daemon 正在运行**：可能有其他 Gradle 进程锁定了文件
2. **文件被其他程序占用**：Android Studio、IDE 或其他进程正在使用这些文件
3. **权限问题**：Windows 文件权限不足
4. **Gradle 缓存损坏**：`.gradle` 目录中的缓存文件可能损坏

## 解决方案

### 方案 1：停止所有 Gradle 进程并清理缓存（推荐）

**步骤 1：停止所有 Gradle daemon**

在项目根目录执行：
```bash
cd android
./gradlew --stop
```

或者在 Windows PowerShell 中：
```powershell
cd android
.\gradlew.bat --stop
```

**步骤 2：删除 Gradle 缓存目录**

```bash
# Windows PowerShell
Remove-Item -Recurse -Force android\.gradle
```

或者手动删除 `android\.gradle` 目录

**步骤 3：重新构建**

```bash
cd android
./gradlew clean
```

### 方案 2：关闭所有相关程序

1. 关闭 Android Studio
2. 关闭 VS Code / Cursor
3. 关闭所有可能访问项目文件的程序
4. 在任务管理器中结束所有 Java/Gradle 进程

### 方案 3：以管理员权限运行

1. 以管理员身份打开 PowerShell 或 CMD
2. 导航到项目目录
3. 执行清理和构建命令

### 方案 4：检查文件权限

确保项目目录有完全控制权限：

1. 右键点击项目文件夹
2. 属性 -> 安全
3. 确保当前用户有"完全控制"权限

### 方案 5：删除并重新生成 Gradle wrapper

如果问题持续存在：

```bash
cd android
# 删除旧的 wrapper
Remove-Item -Recurse -Force gradle\wrapper

# 重新生成 wrapper
./gradlew wrapper --gradle-version 8.9
```

## 快速修复脚本

创建一个 PowerShell 脚本 `fix-gradle.ps1`：

```powershell
# 停止所有 Gradle daemon
Write-Host "停止 Gradle daemon..."
cd android
.\gradlew.bat --stop

# 等待进程完全停止
Start-Sleep -Seconds 3

# 删除 .gradle 目录
Write-Host "删除 .gradle 缓存..."
if (Test-Path ".gradle") {
    Remove-Item -Recurse -Force .gradle
}

# 删除 app/build 目录
Write-Host "删除 app/build..."
if (Test-Path "app\build") {
    Remove-Item -Recurse -Force app\build
}

Write-Host "清理完成！现在可以重新构建项目了。"
```

运行脚本：
```powershell
.\fix-gradle.ps1
```

## 预防措施

1. **构建前停止 daemon**：
   ```bash
   ./gradlew --stop
   ```

2. **定期清理缓存**：
   ```bash
   ./gradlew clean
   ```

3. **避免多个 IDE 同时打开项目**

4. **使用 Gradle 守护进程**（默认启用，但可以禁用）：
   在 `gradle.properties` 中添加：
   ```properties
   org.gradle.daemon=false
   ```

## 验证修复

修复后，尝试构建：

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

如果仍然失败，检查：
1. 是否有其他进程占用文件（使用 Process Explorer）
2. 防病毒软件是否阻止了文件操作
3. 项目路径是否包含特殊字符或空格
