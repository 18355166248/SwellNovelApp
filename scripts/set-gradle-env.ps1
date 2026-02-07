# 设置 Gradle 系统环境变量脚本
# 需要以管理员身份运行

param(
    [switch]$UserOnly  # 如果指定，只设置用户环境变量（不需要管理员权限）
)

$gradleHome = "D:\ruanjian\gradle-8.14"

Write-Host "=== 设置 Gradle 系统环境变量 ===" -ForegroundColor Cyan
Write-Host "Gradle 路径: $gradleHome" -ForegroundColor Gray

# 检查 Gradle 目录是否存在
if (-not (Test-Path $gradleHome)) {
    Write-Host "❌ 错误: Gradle 目录不存在: $gradleHome" -ForegroundColor Red
    Write-Host "请确认 Gradle 8.14 已安装在指定路径" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Gradle 目录存在" -ForegroundColor Green

# 检查是否为管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $UserOnly) {
    Write-Host "`n⚠️  需要管理员权限来设置系统环境变量" -ForegroundColor Yellow
    Write-Host "`n选项 1: 以管理员身份重新运行此脚本" -ForegroundColor Cyan
    Write-Host "   右键点击 PowerShell -> 以管理员身份运行" -ForegroundColor Gray
    Write-Host "   然后运行: .\scripts\set-gradle-env.ps1" -ForegroundColor Gray
    
    Write-Host "`n选项 2: 只设置用户环境变量（不需要管理员）" -ForegroundColor Cyan
    Write-Host "   运行: .\scripts\set-gradle-env.ps1 -UserOnly" -ForegroundColor Gray
    
    $response = Read-Host "`n是否只设置用户环境变量? (y/n)"
    if ($response -eq "y") {
        $UserOnly = $true
    } else {
        Write-Host "`n请以管理员身份重新运行此脚本" -ForegroundColor Yellow
        exit 1
    }
}

# 确定作用域
$scope = if ($UserOnly) { "User" } else { "Machine" }
Write-Host "`n设置作用域: $scope" -ForegroundColor Cyan

# 设置 GRADLE_HOME
Write-Host "`n1. 设置 GRADLE_HOME..." -ForegroundColor Yellow
try {
    [System.Environment]::SetEnvironmentVariable("GRADLE_HOME", $gradleHome, $scope)
    Write-Host "   ✅ GRADLE_HOME = $gradleHome" -ForegroundColor Green
} catch {
    Write-Host "   ❌ 设置失败: $_" -ForegroundColor Red
    exit 1
}

# 添加到 PATH
Write-Host "`n2. 添加到 PATH..." -ForegroundColor Yellow
$gradleBin = "$gradleHome\bin"
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", $scope)

if ($currentPath -like "*$gradleBin*") {
    Write-Host "   ⚠️  PATH 中已包含: $gradleBin" -ForegroundColor Yellow
} else {
    try {
        $newPath = if ($currentPath) { "$currentPath;$gradleBin" } else { $gradleBin }
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, $scope)
        Write-Host "   ✅ 已添加到 PATH: $gradleBin" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ 添加到 PATH 失败: $_" -ForegroundColor Red
    }
}

# 验证设置
Write-Host "`n3. 验证设置..." -ForegroundColor Yellow
$envGradleHome = [System.Environment]::GetEnvironmentVariable("GRADLE_HOME", $scope)
if ($envGradleHome) {
    Write-Host "   ✅ GRADLE_HOME = $envGradleHome" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  环境变量未设置（可能需要刷新）" -ForegroundColor Yellow
}

# 测试 Gradle 命令
Write-Host "`n4. 测试 Gradle 命令..." -ForegroundColor Yellow
$gradleBat = "$gradleHome\bin\gradle.bat"
if (Test-Path $gradleBat) {
    try {
        # 刷新当前会话的环境变量
        $env:GRADLE_HOME = $gradleHome
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", $scope)
        
        $version = & $gradleBat --version 2>&1 | Select-String "Gradle"
        if ($version) {
            Write-Host "   ✅ $version" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ⚠️  无法测试 Gradle 命令" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  找不到 gradle.bat" -ForegroundColor Yellow
}

# 完成
Write-Host "`n=== 设置完成 ===" -ForegroundColor Green
Write-Host "`n重要提示:" -ForegroundColor Yellow
Write-Host "1. 环境变量已设置为 $scope 级别" -ForegroundColor White
if (-not $UserOnly) {
    Write-Host "2. 系统环境变量对所有用户生效" -ForegroundColor White
} else {
    Write-Host "2. 用户环境变量仅对当前用户生效" -ForegroundColor White
}
Write-Host "3. 需要重启以下程序使环境变量生效:" -ForegroundColor White
Write-Host "   - 所有 PowerShell 终端" -ForegroundColor Gray
Write-Host "   - Android Studio" -ForegroundColor Gray
Write-Host "   - VS Code / Cursor" -ForegroundColor Gray
Write-Host "   - 其他 IDE" -ForegroundColor Gray

Write-Host "`n验证方法:" -ForegroundColor Cyan
Write-Host "  在新终端中运行: gradle --version" -ForegroundColor White
Write-Host "  或: `$env:GRADLE_HOME" -ForegroundColor White
