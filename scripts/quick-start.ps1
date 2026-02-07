# React Native 快速启动脚本
# 自动设置环境变量并启动项目

Write-Host "=== SwellNovel App 快速启动 ===" -ForegroundColor Cyan

# 设置 Gradle 环境变量
$gradleHome = "D:\ruanjian\gradle-8.14"
if (Test-Path $gradleHome) {
    $env:GRADLE_HOME = $gradleHome
    if ($env:PATH -notlike "*$gradleHome\bin*") {
        $env:PATH = "$env:PATH;$gradleHome\bin"
    }
    Write-Host "✅ 已设置 GRADLE_HOME = $gradleHome" -ForegroundColor Green
} else {
    Write-Host "⚠️  Gradle 目录不存在: $gradleHome" -ForegroundColor Yellow
}

# 设置 Java 环境变量（如果未设置）
$javaHome = "C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot"
if (Test-Path $javaHome) {
    $env:JAVA_HOME = $javaHome
    Write-Host "✅ 已设置 JAVA_HOME = $javaHome" -ForegroundColor Green
}

# 检查 Metro Bundler
Write-Host "`n检查 Metro Bundler..." -ForegroundColor Cyan
$metroRunning = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($metroRunning) {
    Write-Host "✅ Metro Bundler 正在运行 (端口 8081)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Metro Bundler 未运行，将启动..." -ForegroundColor Yellow
    Write-Host "   运行命令: npm start" -ForegroundColor Gray
}

# 检查 ADB（Android Debug Bridge）
Write-Host "`n检查 Android 设备连接..." -ForegroundColor Cyan
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if ($adbPath) {
    $devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device" }
    if ($devices) {
        Write-Host "✅ 发现 Android 设备:" -ForegroundColor Green
        $devices | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    } else {
        Write-Host "⚠️  未发现 Android 设备" -ForegroundColor Yellow
        Write-Host "   请确保模拟器已启动或设备已连接" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  ADB 未找到，请确保 Android SDK 已安装" -ForegroundColor Yellow
}

Write-Host "`n=== 环境配置完成 ===" -ForegroundColor Cyan
Write-Host "`n下一步操作:" -ForegroundColor Yellow
Write-Host "1. 如果 Metro Bundler 未运行，执行: npm start" -ForegroundColor White
Write-Host "2. 在另一个终端运行: npm run android" -ForegroundColor White
Write-Host "3. 或直接运行: npm run android" -ForegroundColor White
