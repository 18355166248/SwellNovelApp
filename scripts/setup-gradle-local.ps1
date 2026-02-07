# 配置使用本地 Gradle 8.14 的脚本
# 将本地 Gradle 链接到 Gradle Wrapper 缓存目录

$localGradle = "D:\ruanjian\gradle-8.14"
$gradleUserHome = "$env:USERPROFILE\.gradle"
$wrapperCache = "$gradleUserHome\wrapper\dists\gradle-8.14-bin"

Write-Host "=== 配置本地 Gradle 8.14 ===" -ForegroundColor Cyan

# 检查本地 Gradle
if (-not (Test-Path $localGradle)) {
    Write-Host "❌ 错误: Gradle 目录不存在: $localGradle" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 找到本地 Gradle: $localGradle" -ForegroundColor Green

# 创建 Wrapper 缓存目录
if (-not (Test-Path $wrapperCache)) {
    New-Item -ItemType Directory -Path $wrapperCache -Force | Out-Null
    Write-Host "✅ 已创建缓存目录: $wrapperCache" -ForegroundColor Green
}

# 查找或创建哈希目录
# Gradle Wrapper 使用哈希来标识不同的 Gradle 版本
# 我们需要找到正确的哈希目录，或者创建一个符号链接

$hashDirs = Get-ChildItem -Path $wrapperCache -Directory -ErrorAction SilentlyContinue

if ($hashDirs.Count -eq 0) {
    # 如果没有哈希目录，创建一个并使用符号链接
    $hash = "7fcb0c0ad2c738bd0405efd8c2e211751e56733e"
    $hashDir = Join-Path $wrapperCache $hash
    New-Item -ItemType Directory -Path $hashDir -Force | Out-Null
    
    Write-Host "`n方法 1: 创建符号链接（推荐）" -ForegroundColor Yellow
    Write-Host "将本地 Gradle 链接到 Wrapper 缓存..." -ForegroundColor Gray
    
    # 创建符号链接
    $linkPath = Join-Path $hashDir "gradle-8.14"
    if (Test-Path $linkPath) {
        Remove-Item -Path $linkPath -Force -ErrorAction SilentlyContinue
    }
    
    try {
        # 需要管理员权限创建符号链接
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        
        if ($isAdmin) {
            New-Item -ItemType SymbolicLink -Path $linkPath -Target $localGradle -Force | Out-Null
            Write-Host "✅ 已创建符号链接" -ForegroundColor Green
        } else {
            Write-Host "⚠️  需要管理员权限创建符号链接" -ForegroundColor Yellow
            Write-Host "   将使用复制方式..." -ForegroundColor Gray
            
            # 复制 Gradle（如果空间允许）
            Write-Host "   复制 Gradle 到缓存目录..." -ForegroundColor Gray
            Copy-Item -Path $localGradle -Destination $linkPath -Recurse -Force
            Write-Host "✅ 已复制 Gradle 到缓存目录" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  符号链接创建失败，使用复制方式..." -ForegroundColor Yellow
        Copy-Item -Path $localGradle -Destination $linkPath -Recurse -Force
        Write-Host "✅ 已复制 Gradle 到缓存目录" -ForegroundColor Green
    }
} else {
    Write-Host "✅ 找到现有的缓存目录" -ForegroundColor Green
    $hashDirs | ForEach-Object { Write-Host "   $($_.Name)" -ForegroundColor Gray }
}

# 设置环境变量
Write-Host "`n设置环境变量..." -ForegroundColor Cyan
$env:GRADLE_HOME = $localGradle
if ($env:PATH -notlike "*$localGradle\bin*") {
    $env:PATH = "$env:PATH;$localGradle\bin"
}
Write-Host "✅ GRADLE_HOME = $env:GRADLE_HOME" -ForegroundColor Green

# 验证
Write-Host "`n验证配置..." -ForegroundColor Cyan
$gradleVersion = & "$localGradle\bin\gradle.bat" --version 2>&1 | Select-String "Gradle"
if ($gradleVersion) {
    Write-Host "✅ $gradleVersion" -ForegroundColor Green
} else {
    Write-Host "⚠️  无法验证 Gradle 版本" -ForegroundColor Yellow
}

Write-Host "`n=== 配置完成 ===" -ForegroundColor Cyan
Write-Host "`n注意:" -ForegroundColor Yellow
Write-Host "1. 环境变量仅在当前 PowerShell 会话中有效" -ForegroundColor White
Write-Host "2. 要永久设置，请运行: .\scripts\setup-local-gradle.ps1 (需要管理员)" -ForegroundColor White
Write-Host "3. 或者手动设置系统环境变量 GRADLE_HOME" -ForegroundColor White
