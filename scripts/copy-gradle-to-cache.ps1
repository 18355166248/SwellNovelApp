# 将本地 Gradle 复制到 Wrapper 缓存目录
# 这样 Gradle Wrapper 就可以使用本地 Gradle 而不需要下载

$localGradle = "D:\ruanjian\gradle-8.14"
$gradleUserHome = "$env:USERPROFILE\.gradle"
$wrapperCache = "$gradleUserHome\wrapper\dists\gradle-8.14-bin"

Write-Host "=== 复制本地 Gradle 到 Wrapper 缓存 ===" -ForegroundColor Cyan

# 检查本地 Gradle
if (-not (Test-Path $localGradle)) {
    Write-Host "❌ 错误: Gradle 目录不存在: $localGradle" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 找到本地 Gradle: $localGradle" -ForegroundColor Green

# 创建缓存目录
if (-not (Test-Path $wrapperCache)) {
    New-Item -ItemType Directory -Path $wrapperCache -Force | Out-Null
    Write-Host "✅ 已创建缓存目录" -ForegroundColor Green
}

# 查找现有的哈希目录或创建新的
$hashDirs = Get-ChildItem -Path $wrapperCache -Directory -ErrorAction SilentlyContinue

if ($hashDirs.Count -eq 0) {
    # 创建一个哈希目录（使用常见的哈希值）
    $hash = "7fcb0c0ad2c738bd0405efd8c2e211751e56733e"
    $hashDir = Join-Path $wrapperCache $hash
} else {
    # 使用第一个找到的哈希目录
    $hashDir = $hashDirs[0].FullName
    Write-Host "✅ 找到现有缓存目录: $($hashDirs[0].Name)" -ForegroundColor Green
}

$targetDir = Join-Path $hashDir "gradle-8.14"

# 检查是否已存在
if (Test-Path $targetDir) {
    Write-Host "⚠️  目标目录已存在: $targetDir" -ForegroundColor Yellow
    $response = Read-Host "是否覆盖? (y/n)"
    if ($response -ne "y") {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item -Path $targetDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n正在复制 Gradle..." -ForegroundColor Cyan
Write-Host "从: $localGradle" -ForegroundColor Gray
Write-Host "到: $targetDir" -ForegroundColor Gray
Write-Host "这可能需要几分钟..." -ForegroundColor Yellow

try {
    # 复制 Gradle
    Copy-Item -Path $localGradle -Destination $targetDir -Recurse -Force
    
    Write-Host "✅ 复制完成!" -ForegroundColor Green
    Write-Host "`nGradle Wrapper 现在可以使用本地 Gradle 了" -ForegroundColor Green
    
    # 验证
    $gradleBat = Join-Path $targetDir "bin\gradle.bat"
    if (Test-Path $gradleBat) {
        Write-Host "`n验证安装..." -ForegroundColor Cyan
        $version = & $gradleBat --version 2>&1 | Select-String "Gradle"
        Write-Host "✅ $version" -ForegroundColor Green
    }
    
} catch {
    Write-Host "❌ 复制失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 完成 ===" -ForegroundColor Cyan
Write-Host "现在可以运行: cd android && ./gradlew --version" -ForegroundColor Yellow
