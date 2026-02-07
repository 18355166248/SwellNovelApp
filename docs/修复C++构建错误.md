# 修复 C++ 构建错误指南

## 错误信息

```
ld.lld: error: .../Props.cpp.o: unknown file type
clang++: error: linker command failed with exit code 1
```

## 原因分析

这个错误通常由以下原因引起：

1. **构建缓存损坏**：编译过程中断导致目标文件损坏
2. **文件系统问题**：Windows 路径过长或权限问题
3. **CMake 缓存问题**：CMake 缓存文件损坏
4. **并发构建冲突**：多个构建进程同时访问同一文件

## 解决方案

### 方法一：快速清理（推荐）

运行清理脚本：

```powershell
.\scripts\clean-build.ps1
```

或手动清理：

```powershell
cd android
Remove-Item -Recurse -Force app\.cxx
Remove-Item -Recurse -Force app\build
.\gradlew.bat clean
```

### 方法二：完整清理

1. **清理 Android 构建目录**：
   ```powershell
   cd android
   .\gradlew.bat clean
   Remove-Item -Recurse -Force app\.cxx -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force app\build -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force app\.externalNativeBuild -ErrorAction SilentlyContinue
   ```

2. **清理 Gradle 缓存**（可选）：
   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches" -ErrorAction SilentlyContinue
   ```

3. **清理 Metro Bundler 缓存**：
   ```bash
   npm start -- --reset-cache
   ```

4. **重新构建**：
   ```bash
   npm run android
   ```

### 方法三：仅清理特定架构

如果只想清理 x86_64 架构：

```powershell
cd android
Remove-Item -Recurse -Force "app\.cxx\Debug\*\x86_64" -ErrorAction SilentlyContinue
.\gradlew.bat clean
```

## 预防措施

### 1. 避免中断构建

- 不要在构建过程中关闭终端
- 不要在构建过程中强制停止进程

### 2. 使用正确的清理命令

构建前先清理：

```bash
cd android
./gradlew clean
cd ..
npm run android
```

### 3. 检查磁盘空间

确保有足够的磁盘空间：

```powershell
Get-PSDrive C | Select-Object Used,Free
```

### 4. 检查文件权限

确保对项目目录有完全控制权限。

## 常见问题

### Q: 清理后仍然报错

**A**: 尝试：
1. 重启计算机（清除文件锁）
2. 以管理员身份运行
3. 检查防病毒软件是否阻止了文件访问

### Q: 清理时间太长

**A**: 可以只清理特定目录：
```powershell
# 只清理 C++ 构建缓存
Remove-Item -Recurse -Force android\app\.cxx
```

### Q: 权限不足

**A**: 
1. 以管理员身份运行 PowerShell
2. 或关闭可能占用文件的程序（Android Studio、VS Code 等）

## 验证修复

清理后重新构建：

```bash
cd android
./gradlew clean
cd ..
npm run android
```

如果仍然报错，检查：
1. NDK 版本是否正确（当前使用 27.1.12297006）
2. CMake 版本是否正确（当前使用 3.22.1）
3. 项目路径是否包含特殊字符或空格

## 相关文件

- `scripts/clean-build.ps1` - 自动清理脚本
- `android/app/.cxx/` - C++ 构建缓存目录
- `android/app/build/` - Android 构建输出目录
