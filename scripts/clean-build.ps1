# 清理 React Native Android 构建缓存脚本

Write-Host "=== 清理 React Native Android 构建缓存 ===" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"

if (-not (Test-Path $androidDir)) {
    Write-Host "❌ Android 目录不存在: $androidDir" -ForegroundColor Red
    exit 1
}

Write-Host "`n正在清理构建缓存..." -ForegroundColor Yellow

# 清理目录列表
$cleanDirs = @(
    "app\.cxx",
    "app\build",
    "\.gradle",
    "build",
    "app\.externalNativeBuild"
)

$cleaned = 0
foreach ($dir in $cleanDirs) {
    $fullPath = Join-Path $androidDir $dir
    if (Test-Path $fullPath) {
        try {
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
            Write-Host "  ✅ 已删除: $dir" -ForegroundColor Green
            $cleaned++
        } catch {
            Write-Host "  ⚠️  无法删除: $dir - $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⏭️  不存在: $dir" -ForegroundColor Gray
    }
}

# 清理 Gradle 缓存（可选）
Write-Host "`n清理 Gradle 缓存..." -ForegroundColor Yellow
$gradleCache = "$env:USERPROFILE\.gradle\caches"
if (Test-Path $gradleCache) {
    $response = Read-Host "是否清理 Gradle 缓存? (y/n)"
    if ($response -eq "y") {
        try {
            Remove-Item -Path $gradleCache -Recurse -Force -ErrorAction Stop
            Write-Host "  ✅ 已清理 Gradle 缓存" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠️  无法清理 Gradle 缓存: $_" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n=== 清理完成 ===" -ForegroundColor Green
Write-Host "已清理 $cleaned 个目录" -ForegroundColor Cyan
Write-Host "`n下一步:" -ForegroundColor Yellow
Write-Host "1. 运行: cd android && ./gradlew clean" -ForegroundColor White
Write-Host "2. 然后: npm run android" -ForegroundColor White
