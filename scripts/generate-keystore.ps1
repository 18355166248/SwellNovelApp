# 生成 Android 签名密钥脚本
# 使用方法: .\scripts\generate-keystore.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   生成 Android 签名密钥" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "package.json")) {
    Write-Host "错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 检查 keytool 是否可用
if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
    Write-Host "错误: 未找到 keytool 命令" -ForegroundColor Red
    Write-Host "请确保已安装 JDK 并配置了环境变量" -ForegroundColor Yellow
    exit 1
}

$keystorePath = "android\app\my-release-key.keystore"

# 检查密钥文件是否已存在
if (Test-Path $keystorePath) {
    Write-Host "警告: 签名密钥文件已存在: $keystorePath" -ForegroundColor Yellow
    Write-Host ""
    $overwrite = Read-Host "是否覆盖? (y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "已取消操作" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $keystorePath -Force
}

Write-Host "请按提示输入签名信息:" -ForegroundColor Green
Write-Host ""

# 生成密钥
$keytoolArgs = @(
    "-genkeypair",
    "-v",
    "-storetype", "PKCS12",
    "-keystore", $keystorePath,
    "-alias", "my-key-alias",
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "10000"
)

try {
    & keytool $keytoolArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=========================================" -ForegroundColor Green
        Write-Host "   密钥生成成功!" -ForegroundColor Green
        Write-Host "=========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "密钥文件位置: $((Get-Item $keystorePath).FullName)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "重要提示:" -ForegroundColor Yellow
        Write-Host "1. 请妥善保管密钥文件和密码" -ForegroundColor Yellow
        Write-Host "2. 如果丢失密钥，将无法更新已发布的应用" -ForegroundColor Yellow
        Write-Host "3. 请将密码填写到 android\gradle.properties 文件中" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "错误: 密钥生成失败" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "错误: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
