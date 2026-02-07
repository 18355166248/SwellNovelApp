# 使用本地 Gradle 构建 Android 应用
# 避免 Gradle Wrapper 下载

param(
    [string]$Task = "assembleDebug"  # 默认构建 Debug APK
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"
$localGradle = "D:\ruanjian\gradle-8.14"

Write-Host "=== 使用本地 Gradle 构建 Android ===" -ForegroundColor Cyan

# 设置环境变量
$env:GRADLE_HOME = $localGradle
if ($env:PATH -notlike "*$localGradle\bin*") {
    $env:PATH = "$env:PATH;$localGradle\bin"
}

Write-Host "GRADLE_HOME = $env:GRADLE_HOME" -ForegroundColor Green

# 检查本地 Gradle
$gradleBat = "$localGradle\bin\gradle.bat"
if (-not (Test-Path $gradleBat)) {
    Write-Host "❌ 错误: 找不到本地 Gradle: $gradleBat" -ForegroundColor Red
    exit 1
}

# 切换到 android 目录
Set-Location $androidDir

Write-Host "`n运行 Gradle 任务: $Task" -ForegroundColor Yellow
Write-Host "使用本地 Gradle: $localGradle" -ForegroundColor Gray

# 使用本地 Gradle 运行任务
& $gradleBat $Task

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 构建成功!" -ForegroundColor Green
} else {
    Write-Host "`n❌ 构建失败 (退出码: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Set-Location $projectRoot
