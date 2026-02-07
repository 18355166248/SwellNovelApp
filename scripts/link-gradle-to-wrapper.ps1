# 创建符号链接，让 Gradle Wrapper 使用本地 Gradle
# 避免复制大文件

$localGradle = "D:\ruanjian\gradle-8.14"
$gradleUserHome = "$env:USERPROFILE\.gradle"
$wrapperCache = "$gradleUserHome\wrapper\dists\gradle-8.14-bin"

Write-Host "=== 配置 Gradle Wrapper 使用本地 Gradle（符号链接）===" -ForegroundColor Cyan

# 检查本地 Gradle
if (-not (Test-Path $localGradle)) {
    Write-Host "❌ 错误: Gradle 目录不存在: $localGradle" -ForegroundColor Red
    exit 1
}

# 创建缓存目录
if (-not (Test-Path $wrapperCache)) {
    New-Item -ItemType Directory -Path $wrapperCache -Force | Out-Null
}

# 查找或创建哈希目录
$hashDirs = Get-ChildItem -Path $wrapperCache -Directory -ErrorAction SilentlyContinue
$hash = if ($hashDirs.Count -gt 0) { 
    $hashDirs[0].Name 
} else { 
    "7fcb0c0ad2c738bd0405efd8c2e211751e56733e"
    $hashDir = Join-Path $wrapperCache $hash
    New-Item -ItemType Directory -Path $hashDir -Force | Out-Null
    $hash
}

$hashDir = Join-Path $wrapperCache $hash
$targetDir = Join-Path $hashDir "gradle-8.14"

Write-Host "`n哈希目录: $hash" -ForegroundColor Gray
Write-Host "目标路径: $targetDir" -ForegroundColor Gray

# 检查是否已存在
if (Test-Path $targetDir) {
    Write-Host "`n⚠️  目标目录已存在" -ForegroundColor Yellow
    $response = Read-Host "是否删除并重新创建符号链接? (y/n)"
    if ($response -eq "y") {
        Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
}

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`n⚠️  创建符号链接需要管理员权限" -ForegroundColor Yellow
    Write-Host "`n替代方案：设置环境变量让 Gradle Wrapper 检测本地 Gradle" -ForegroundColor Cyan
    
    # 设置环境变量
    $env:GRADLE_HOME = $localGradle
    if ($env:PATH -notlike "*$localGradle\bin*") {
        $env:PATH = "$env:PATH;$localGradle\bin"
    }
    
    Write-Host "`n✅ 已设置环境变量（当前会话）" -ForegroundColor Green
    Write-Host "GRADLE_HOME = $env:GRADLE_HOME" -ForegroundColor Cyan
    
    Write-Host "`n注意: Gradle Wrapper 可能仍会尝试下载" -ForegroundColor Yellow
    Write-Host "建议: 使用本地 gradle 命令而不是 gradlew" -ForegroundColor Yellow
    Write-Host "  例如: gradle clean 而不是 ./gradlew clean" -ForegroundColor Gray
    
    exit 0
}

# 创建符号链接
Write-Host "`n正在创建符号链接..." -ForegroundColor Cyan
try {
    New-Item -ItemType SymbolicLink -Path $targetDir -Target $localGradle -Force | Out-Null
    Write-Host "✅ 符号链接创建成功!" -ForegroundColor Green
    
    # 验证
    if (Test-Path (Join-Path $targetDir "bin\gradle.bat")) {
        Write-Host "✅ 验证通过" -ForegroundColor Green
    }
    
    Write-Host "`n=== 配置完成 ===" -ForegroundColor Green
    Write-Host "Gradle Wrapper 现在会使用本地 Gradle" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ 创建符号链接失败: $_" -ForegroundColor Red
    Write-Host "`n尝试替代方案..." -ForegroundColor Yellow
    
    # 替代方案：只复制必要文件
    Write-Host "复制 Gradle 核心文件（跳过缓存）..." -ForegroundColor Cyan
    
    $excludeDirs = @("caches", "daemon", "native")
    $items = Get-ChildItem -Path $localGradle -Exclude $excludeDirs
    
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    
    foreach ($item in $items) {
        try {
            Copy-Item -Path $item.FullName -Destination (Join-Path $targetDir $item.Name) -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Host "  ⚠️  跳过: $($item.Name)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "✅ 核心文件复制完成" -ForegroundColor Green
}

Write-Host "`n测试:" -ForegroundColor Yellow
Write-Host "  cd android" -ForegroundColor Gray
Write-Host "  .\gradlew.bat --version" -ForegroundColor Gray
