# 修复 C++ 构建错误的完整脚本

Write-Host "=== 修复 C++ 构建错误 ===" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"

if (-not (Test-Path $androidDir)) {
    Write-Host "❌ Android 目录不存在" -ForegroundColor Red
    exit 1
}

Set-Location $androidDir

Write-Host "`n步骤 1: 清理 C++ 构建缓存..." -ForegroundColor Yellow
$cleanDirs = @(
    "app\.cxx",
    "app\build",
    "app\.externalNativeBuild",
    "build"
)

foreach ($dir in $cleanDirs) {
    if (Test-Path $dir) {
        try {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction Stop
            Write-Host "  ✅ 已删除: $dir" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠️  无法删除: $dir" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n步骤 2: 运行 Gradle clean..." -ForegroundColor Yellow
$gradlePath = "D:\ruanjian\gradle-8.14\bin\gradle.bat"

if (Test-Path $gradlePath) {
    Write-Host "  使用本地 Gradle..." -ForegroundColor Gray
    & $gradlePath clean 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Gradle clean 完成" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Gradle clean 有警告，但继续..." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  本地 Gradle 未找到，跳过..." -ForegroundColor Yellow
}

Write-Host "`n步骤 3: 清理 Metro Bundler 缓存（可选）..." -ForegroundColor Yellow
$response = Read-Host "是否清理 Metro 缓存? (y/n)"
if ($response -eq "y") {
    Set-Location $projectRoot
    Write-Host "  运行: npm start -- --reset-cache" -ForegroundColor Gray
    Write-Host "  （需要在另一个终端运行）" -ForegroundColor Gray
}

Set-Location $projectRoot

Write-Host "`n=== 修复完成 ===" -ForegroundColor Green
Write-Host "`n现在可以重新构建项目:" -ForegroundColor Cyan
Write-Host "  npm run android" -ForegroundColor White
