# 设置本地 Gradle 8.14 环境变量脚本
# 使用方法：以管理员身份运行此脚本

$gradleHome = "D:\ruanjian\gradle-8.14"

Write-Host "正在设置 Gradle 环境变量..." -ForegroundColor Green

# 检查 Gradle 目录是否存在
if (-not (Test-Path $gradleHome)) {
    Write-Host "错误: Gradle 目录不存在: $gradleHome" -ForegroundColor Red
    Write-Host "请确认 Gradle 8.14 已安装在指定路径" -ForegroundColor Yellow
    exit 1
}

# 检查是否为管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "警告: 需要管理员权限来设置系统环境变量" -ForegroundColor Yellow
    Write-Host "当前仅设置用户环境变量（当前会话有效）" -ForegroundColor Yellow
    
    # 设置用户环境变量（当前会话）
    $env:GRADLE_HOME = $gradleHome
    $env:PATH = "$env:PATH;$gradleHome\bin"
    
    Write-Host "已设置用户环境变量（当前会话）" -ForegroundColor Green
    Write-Host "GRADLE_HOME = $env:GRADLE_HOME" -ForegroundColor Cyan
} else {
    # 设置系统环境变量（永久）
    [System.Environment]::SetEnvironmentVariable("GRADLE_HOME", $gradleHome, "Machine")
    
    # 添加到 PATH
    $currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $gradleBin = "$gradleHome\bin"
    
    if ($currentPath -notlike "*$gradleBin*") {
        $newPath = "$currentPath;$gradleBin"
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
        Write-Host "已添加到 PATH: $gradleBin" -ForegroundColor Green
    } else {
        Write-Host "PATH 中已包含 Gradle bin 目录" -ForegroundColor Yellow
    }
    
    Write-Host "已设置系统环境变量（永久）" -ForegroundColor Green
}

# 验证设置
Write-Host "`n验证设置..." -ForegroundColor Green
Write-Host "GRADLE_HOME = $([System.Environment]::GetEnvironmentVariable('GRADLE_HOME', 'Machine'))" -ForegroundColor Cyan

# 测试 Gradle 命令
$gradleCmd = "$gradleHome\bin\gradle.bat"
if (Test-Path $gradleCmd) {
    Write-Host "`n测试 Gradle 版本..." -ForegroundColor Green
    & $gradleCmd --version
} else {
    Write-Host "警告: 找不到 gradle.bat，请检查 Gradle 安装是否完整" -ForegroundColor Yellow
}

Write-Host "`n设置完成！" -ForegroundColor Green
Write-Host "注意: 如果设置了系统环境变量，需要重启终端或 IDE 才能生效" -ForegroundColor Yellow
