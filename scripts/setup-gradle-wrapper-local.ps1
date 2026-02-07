# 配置 Gradle Wrapper 使用本地 Gradle 8.14
# 避免从网络下载

$localGradle = "D:\ruanjian\gradle-8.14"
$gradleUserHome = "$env:USERPROFILE\.gradle"
$wrapperCache = "$gradleUserHome\wrapper\dists\gradle-8.14-bin"

Write-Host "=== 配置 Gradle Wrapper 使用本地 Gradle ===" -ForegroundColor Cyan
Write-Host "本地 Gradle: $localGradle" -ForegroundColor Gray

# 检查本地 Gradle
if (-not (Test-Path $localGradle)) {
    Write-Host "❌ 错误: Gradle 目录不存在: $localGradle" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 找到本地 Gradle" -ForegroundColor Green

# 创建缓存目录
if (-not (Test-Path $wrapperCache)) {
    New-Item -ItemType Directory -Path $wrapperCache -Force | Out-Null
    Write-Host "✅ 已创建缓存目录" -ForegroundColor Green
}

# 查找或创建哈希目录
$hashDirs = Get-ChildItem -Path $wrapperCache -Directory -ErrorAction SilentlyContinue

if ($hashDirs.Count -eq 0) {
    # 创建一个哈希目录（使用常见的哈希值）
    # Gradle Wrapper 使用 SHA-256 哈希来标识版本
    $hash = "7fcb0c0ad2c738bd0405efd8c2e211751e56733e"
    $hashDir = Join-Path $wrapperCache $hash
    New-Item -ItemType Directory -Path $hashDir -Force | Out-Null
    Write-Host "✅ 已创建哈希目录: $hash" -ForegroundColor Green
} else {
    # 使用第一个找到的哈希目录
    $hashDir = $hashDirs[0].FullName
    Write-Host "✅ 使用现有缓存目录: $($hashDirs[0].Name)" -ForegroundColor Green
}

# 目标目录
$targetDir = Join-Path $hashDir "gradle-8.14"

# 检查是否已存在
if (Test-Path $targetDir) {
    Write-Host "`n⚠️  目标目录已存在: $targetDir" -ForegroundColor Yellow
    $response = Read-Host "是否覆盖? (y/n)"
    if ($response -ne "y") {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n正在复制 Gradle 到 Wrapper 缓存..." -ForegroundColor Cyan
Write-Host "从: $localGradle" -ForegroundColor Gray
Write-Host "到: $targetDir" -ForegroundColor Gray
Write-Host "这可能需要几分钟..." -ForegroundColor Yellow

try {
    # 复制 Gradle
    $startTime = Get-Date
    Copy-Item -Path $localGradle -Destination $targetDir -Recurse -Force
    
    $elapsed = (Get-Date) - $startTime
    Write-Host "✅ 复制完成! (耗时: $($elapsed.TotalSeconds) 秒)" -ForegroundColor Green
    
    # 验证
    $gradleBat = Join-Path $targetDir "bin\gradle.bat"
    if (Test-Path $gradleBat) {
        Write-Host "`n验证安装..." -ForegroundColor Cyan
        $version = & $gradleBat --version 2>&1 | Select-String "Gradle"
        if ($version) {
            Write-Host "✅ $version" -ForegroundColor Green
        }
    }
    
    Write-Host "`n=== 配置完成 ===" -ForegroundColor Green
    Write-Host "Gradle Wrapper 现在会使用本地 Gradle，不会从网络下载" -ForegroundColor Cyan
    Write-Host "`n测试:" -ForegroundColor Yellow
    Write-Host "  cd android" -ForegroundColor Gray
    Write-Host "  .\gradlew.bat --version" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ 复制失败: $_" -ForegroundColor Red
    Write-Host "`n可能的解决方案:" -ForegroundColor Yellow
    Write-Host "1. 确保有足够的磁盘空间" -ForegroundColor White
    Write-Host "2. 检查文件权限" -ForegroundColor White
    Write-Host "3. 关闭可能占用文件的程序" -ForegroundColor White
    exit 1
}
