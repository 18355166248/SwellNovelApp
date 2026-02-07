# Android 打包脚本 (PowerShell)
# 使用方法: .\scripts\build-android.ps1 [apk|aab]

param(
    [Parameter(Position=0)]
    [ValidateSet("apk", "aab")]
    [string]$BuildType = "apk"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Android 打包脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "package.json")) {
    Write-Host "错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 检查签名配置
$gradleProps = "android\gradle.properties"
if (Test-Path $gradleProps) {
    $propsContent = Get-Content $gradleProps -Raw
    if ($propsContent -match "MYAPP_RELEASE_STORE_PASSWORD=your_store_password") {
        Write-Host "警告: 检测到默认签名密码，请先配置 android\gradle.properties 中的签名信息" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "首次打包前，请先运行以下命令生成签名密钥:" -ForegroundColor Yellow
        Write-Host "keytool -genkeypair -v -storetype PKCS12 -keystore android\app\my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000" -ForegroundColor Yellow
        Write-Host ""
        $continue = Read-Host "是否继续使用debug签名打包? (y/n)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 0
        }
    }
}

# 检查签名文件是否存在
$keystorePath = "android\app\my-release-key.keystore"
if (-not (Test-Path $keystorePath)) {
    Write-Host "警告: 未找到签名文件 $keystorePath" -ForegroundColor Yellow
    Write-Host "将使用debug签名进行打包" -ForegroundColor Yellow
    Write-Host ""
}

# 配置本地 Gradle
# 注意: 项目需要 Gradle 8.13+，如果本地 Gradle 版本不够，将使用 Gradle Wrapper
$localGradlePath = "D:\ruanjian\gradle-8.14"
$useLocalGradle = $false
$minGradleVersion = [version]"8.13"
if (Test-Path $localGradlePath) {
    $gradleExe = Join-Path $localGradlePath "bin\gradle.bat"
    if (Test-Path $gradleExe) {
        # 检查 Gradle 版本
        try {
            $gradleVersionOutput = & $gradleExe --version 2>&1 | Select-String "Gradle"
            if ($gradleVersionOutput -match "Gradle (\d+\.\d+)") {
                $localGradleVersion = [version]$matches[1]
                if ($localGradleVersion -ge $minGradleVersion) {
                    # 检查 Java 版本兼容性（仅在 JAVA_HOME 已设置时检查）
                    if ($env:JAVA_HOME) {
                        $javaExePath = Join-Path $env:JAVA_HOME "bin\java.exe"
                        if (Test-Path $javaExePath) {
                            $javaVersion = & $javaExePath -version 2>&1 | Select-String "version"
                            if ($javaVersion -match "25") {
                                Write-Host "警告: 检测到 Java 25，但本地 Gradle $localGradleVersion 可能不支持 Java 25" -ForegroundColor Yellow
                                Write-Host "将使用 Gradle Wrapper 下载支持 Java 25 的 Gradle 版本 (9.1+)" -ForegroundColor Yellow
                                Write-Host ""
                                $useLocalGradle = $false
                            } else {
                                Write-Host "检测到本地 Gradle: $localGradlePath (版本 $localGradleVersion)" -ForegroundColor Green
                                $env:GRADLE_HOME = $localGradlePath
                                $env:PATH = "$localGradlePath\bin;$env:PATH"
                                $useLocalGradle = $true
                                Write-Host "已配置使用本地 Gradle" -ForegroundColor Green
                                Write-Host ""
                            }
                        } else {
                            Write-Host "检测到本地 Gradle: $localGradlePath (版本 $localGradleVersion)" -ForegroundColor Green
                            $env:GRADLE_HOME = $localGradlePath
                            $env:PATH = "$localGradlePath\bin;$env:PATH"
                            $useLocalGradle = $true
                            Write-Host "已配置使用本地 Gradle" -ForegroundColor Green
                            Write-Host ""
                        }
                    } else {
                        Write-Host "检测到本地 Gradle: $localGradlePath (版本 $localGradleVersion)" -ForegroundColor Green
                        $env:GRADLE_HOME = $localGradlePath
                        $env:PATH = "$localGradlePath\bin;$env:PATH"
                        $useLocalGradle = $true
                        Write-Host "已配置使用本地 Gradle" -ForegroundColor Green
                        Write-Host ""
                    }
                } else {
                    Write-Host "警告: 本地 Gradle 版本 $localGradleVersion 低于要求的最低版本 $minGradleVersion" -ForegroundColor Yellow
                    Write-Host "将使用 Gradle Wrapper 下载合适的版本" -ForegroundColor Yellow
                    Write-Host ""
                    $useLocalGradle = $false
                }
            } else {
                Write-Host "警告: 无法检测本地 Gradle 版本，将使用 Gradle Wrapper" -ForegroundColor Yellow
                Write-Host ""
                $useLocalGradle = $false
            }
        } catch {
            Write-Host "警告: 检查本地 Gradle 版本时出错，将使用 Gradle Wrapper" -ForegroundColor Yellow
            Write-Host ""
            $useLocalGradle = $false
        }
    } else {
        Write-Host "警告: 本地 Gradle 目录存在但未找到 gradle.bat，将使用 Gradle Wrapper" -ForegroundColor Yellow
        Write-Host ""
    }
} else {
    Write-Host "警告: 未找到本地 Gradle 目录 $localGradlePath，将使用 Gradle Wrapper" -ForegroundColor Yellow
    Write-Host ""
}

# 检测和配置 Java
if (-not $env:JAVA_HOME) {
    Write-Host "检测 Java 安装路径..." -ForegroundColor Yellow

    # 检查 gradle.properties 中是否配置了 Java 路径
    $javaHomeFromProps = $null
    if (Test-Path $gradleProps) {
        $propsLines = Get-Content $gradleProps
        foreach ($line in $propsLines) {
            if ($line -match '^JAVA_HOME=(.+)$') {
                $javaHomeFromProps = $matches[1].Trim()
                break
            }
        }
    }

    # 常见的 Java 安装路径
    $javaPaths = @()
    if ($javaHomeFromProps) {
        $javaPaths += $javaHomeFromProps
    }
    # 尝试从注册表读取
    try {
        $regJava = Get-ItemProperty -Path "HKLM:\SOFTWARE\JavaSoft\Java Development Kit\*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty JavaHome
        if ($regJava -and (Test-Path $regJava)) {
            $javaPaths += $regJava
        }
    } catch {}

    try {
        $regJdk = Get-ItemProperty -Path "HKLM:\SOFTWARE\JavaSoft\JDK\*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty JavaHome
        if ($regJdk -and (Test-Path $regJdk)) {
            $javaPaths += $regJdk
        }
    } catch {}

    $javaPaths += @(
        "D:\ruanjian\jdk-17",
        "D:\ruanjian\jdk-11",
        "D:\ruanjian\jdk-21",
        "D:\ruanjian\jdk-19",
        "D:\ruanjian\java",
        "D:\ruanjian\jdk",
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre",
        "C:\Program Files (x86)\Android\Android Studio\jbr",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Java\jdk-11",
        "C:\Program Files\Java\jdk-1.8.0",
        "C:\Program Files\Java\jdk*",
        "C:\Program Files\Eclipse Adoptium\jdk-21*",
        "C:\Program Files\Eclipse Adoptium\jdk-17*",
        "C:\Program Files\Eclipse Adoptium\jdk-11*",
        "C:\Program Files\Microsoft\jdk-25.0.2.10-hotspot",
        "C:\Program Files\Microsoft\jdk-25*",
        "C:\Program Files\Microsoft\jdk-21*",
        "C:\Program Files\Microsoft\jdk-17*",
        "$env:LOCALAPPDATA\Android\Sdk\jbr",
        "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr",
        "$env:ProgramFiles\Android\Android Studio\jbr"
    )

    # 搜索 D:\ruanjian 下的所有可能 JDK 目录
    if (Test-Path "D:\ruanjian") {
        try {
            $jdkDirs = Get-ChildItem "D:\ruanjian" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "jdk|java" }
            foreach ($dir in $jdkDirs) {
                $javaPaths += $dir.FullName
            }
        } catch {}
    }

    $javaFound = $false
    foreach ($path in $javaPaths) {
        # 处理通配符路径
        if ($path -match '\*') {
            $parentPath = $path -replace '\\[^\\]*\*.*$', ''
            $pattern = $path -replace '.*\\', ''
            if (Test-Path $parentPath) {
                $matches = Get-ChildItem $parentPath -Filter $pattern -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
                if ($matches) {
                    $path = $matches[0].FullName
                } else {
                    continue
                }
            } else {
                continue
            }
        }

        if (Test-Path $path) {
            $javaExe = Join-Path $path "bin\java.exe"
            if (Test-Path $javaExe) {
                $env:JAVA_HOME = $path
                $env:PATH = "$path\bin;$env:PATH"
                Write-Host "检测到 Java: $path" -ForegroundColor Green
                $javaFound = $true
                break
            }
        }
    }

    if (-not $javaFound) {
        Write-Host "错误: 未找到 Java 安装" -ForegroundColor Red
        Write-Host ""
        Write-Host "请选择以下方式之一配置 Java:" -ForegroundColor Yellow
        Write-Host "  1. 设置系统环境变量 JAVA_HOME" -ForegroundColor Yellow
        Write-Host "  2. 在 android\gradle.properties 中添加: JAVA_HOME=你的Java路径" -ForegroundColor Yellow
        Write-Host "  3. 将 Java 路径添加到脚本中的 javaPaths 数组" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "常见 Java 安装位置:" -ForegroundColor Yellow
        Write-Host "  - Android Studio: C:\Program Files\Android\Android Studio\jbr" -ForegroundColor Yellow
        Write-Host "  - Oracle JDK: C:\Program Files\Java\jdk-17" -ForegroundColor Yellow
        Write-Host "  - Adoptium: C:\Program Files\Eclipse Adoptium\jdk-17*" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "请提供您的 Java 安装路径，或按 Ctrl+C 退出后配置" -ForegroundColor Yellow
        $userJavaPath = Read-Host "Java 安装路径 (直接回车跳过)"
        if ($userJavaPath -and (Test-Path $userJavaPath)) {
            $javaExe = Join-Path $userJavaPath "bin\java.exe"
            if (Test-Path $javaExe) {
                $env:JAVA_HOME = $userJavaPath
                $env:PATH = "$userJavaPath\bin;$env:PATH"
                Write-Host "已配置 Java: $userJavaPath" -ForegroundColor Green
                Write-Host ""
            } else {
                Write-Host "错误: 该路径下未找到 java.exe" -ForegroundColor Red
                exit 1
            }
        } else {
            exit 1
        }
    }
    Write-Host ""
} else {
    Write-Host "使用已配置的 JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Green
    Write-Host ""
}

# 检测和配置 Android SDK
$localPropsPath = "android\local.properties"
$sdkDirConfigured = $false

# 检查 local.properties 文件
if (Test-Path $localPropsPath) {
    $localPropsContent = Get-Content $localPropsPath -Raw
    if ($localPropsContent -match 'sdk\.dir=(.+)') {
        $sdkPath = $matches[1].Trim()
        if (Test-Path $sdkPath) {
            Write-Host "检测到 Android SDK (来自 local.properties): $sdkPath" -ForegroundColor Green
            $env:ANDROID_HOME = $sdkPath
            $env:ANDROID_SDK_ROOT = $sdkPath
            $sdkDirConfigured = $true
        }
    }
}

# 如果未配置，尝试从环境变量获取
if (-not $sdkDirConfigured) {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        Write-Host "检测到 Android SDK (来自 ANDROID_HOME): $env:ANDROID_HOME" -ForegroundColor Green
        $sdkDirConfigured = $true
    } elseif ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
        Write-Host "检测到 Android SDK (来自 ANDROID_SDK_ROOT): $env:ANDROID_SDK_ROOT" -ForegroundColor Green
        $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
        $sdkDirConfigured = $true
    }
}

# 如果仍未找到，尝试常见路径
if (-not $sdkDirConfigured) {
    $commonSdkPaths = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "C:\Program Files\Android\Android Studio\sdk",
        "C:\Program Files (x86)\Android\android-sdk",
        "D:\Android\Sdk",
        "D:\ruanjian\Android\Sdk",
        "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
    )
    
    foreach ($sdkPath in $commonSdkPaths) {
        if (Test-Path $sdkPath) {
            Write-Host "检测到 Android SDK: $sdkPath" -ForegroundColor Green
            $env:ANDROID_HOME = $sdkPath
            $env:ANDROID_SDK_ROOT = $sdkPath
            
            # 更新或创建 local.properties
            $localPropsContent = "sdk.dir=$sdkPath`n"
            Set-Content -Path $localPropsPath -Value $localPropsContent -Force
            Write-Host "已更新 android\local.properties" -ForegroundColor Green
            $sdkDirConfigured = $true
            break
        }
    }
}

# 如果仍未找到，尝试使用默认路径或提示用户
if (-not $sdkDirConfigured) {
    Write-Host "警告: 未找到 Android SDK" -ForegroundColor Yellow
    Write-Host ""
    
    # 尝试使用最常见的默认路径
    $defaultSdkPath = "$env:LOCALAPPDATA\Android\Sdk"
    if (Test-Path $defaultSdkPath) {
        Write-Host "使用默认 Android SDK 路径: $defaultSdkPath" -ForegroundColor Green
        $env:ANDROID_HOME = $defaultSdkPath
        $env:ANDROID_SDK_ROOT = $defaultSdkPath
        $localPropsContent = "sdk.dir=$defaultSdkPath`n"
        Set-Content -Path $localPropsPath -Value $localPropsContent -Force
        Write-Host "已更新 android\local.properties" -ForegroundColor Green
        $sdkDirConfigured = $true
    } else {
        # 非交互模式下，尝试从环境变量或提示
        if ([Environment]::UserInteractive) {
            Write-Host "请选择以下方式之一配置 Android SDK:" -ForegroundColor Yellow
            Write-Host "  1. 设置系统环境变量 ANDROID_HOME 或 ANDROID_SDK_ROOT" -ForegroundColor Yellow
            Write-Host "  2. 在 android\local.properties 中添加: sdk.dir=你的SDK路径" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "常见 Android SDK 安装位置:" -ForegroundColor Yellow
            Write-Host "  - 默认位置: $env:LOCALAPPDATA\Android\Sdk" -ForegroundColor Yellow
            Write-Host "  - Android Studio: C:\Program Files\Android\Android Studio\sdk" -ForegroundColor Yellow
            Write-Host ""
            $userSdkPath = Read-Host "请输入 Android SDK 路径 (直接回车跳过)"
            if ($userSdkPath -and (Test-Path $userSdkPath)) {
                $env:ANDROID_HOME = $userSdkPath
                $env:ANDROID_SDK_ROOT = $userSdkPath
                $localPropsContent = "sdk.dir=$userSdkPath`n"
                Set-Content -Path $localPropsPath -Value $localPropsContent -Force
                Write-Host "已配置 Android SDK: $userSdkPath" -ForegroundColor Green
                Write-Host ""
                $sdkDirConfigured = $true
            }
        }
        
        if (-not $sdkDirConfigured) {
            Write-Host "错误: Android SDK 路径无效或未提供" -ForegroundColor Red
            Write-Host "请设置系统环境变量 ANDROID_HOME 或在 android\local.properties 中配置 sdk.dir" -ForegroundColor Red
            Write-Host ""
        }
    }
}

if ($sdkDirConfigured) {
    Write-Host ""
}

# 清理之前的构建
Write-Host "清理之前的构建文件..." -ForegroundColor Yellow
if (Test-Path "android\app\build") {
    Remove-Item -Recurse -Force "android\app\build" -ErrorAction SilentlyContinue
}

# 进入android目录
Push-Location android

try {
    # 构建APK或AAB
    if ($BuildType -eq "apk") {
        Write-Host ""
        Write-Host "开始构建 APK..." -ForegroundColor Green
        Write-Host ""

        if ($useLocalGradle) {
            # 使用本地 Gradle
            $gradleCmd = Join-Path $localGradlePath "bin\gradle.bat"
            & $gradleCmd assembleRelease
        } elseif ($IsWindows -or $env:OS -match "Windows") {
            .\gradlew.bat assembleRelease
        } else {
            ./gradlew assembleRelease
        }

        if ($LASTEXITCODE -eq 0) {
            $apkPath = "app\build\outputs\apk\release\app-release.apk"
            if (Test-Path $apkPath) {
                Write-Host ""
                Write-Host "=========================================" -ForegroundColor Green
                Write-Host "   构建成功!" -ForegroundColor Green
                Write-Host "=========================================" -ForegroundColor Green
                Write-Host ""
                Write-Host "APK 位置: $((Get-Item $apkPath).FullName)" -ForegroundColor Cyan
                Write-Host ""

                # 显示文件大小
                $fileSize = (Get-Item $apkPath).Length / 1MB
                Write-Host "文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
            } else {
                Write-Host "错误: 未找到生成的APK文件" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "错误: 构建失败" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host ""
        Write-Host "开始构建 AAB (用于 Google Play)..." -ForegroundColor Green
        Write-Host ""

        if ($useLocalGradle) {
            # 使用本地 Gradle
            $gradleCmd = Join-Path $localGradlePath "bin\gradle.bat"
            & $gradleCmd bundleRelease
        } elseif ($IsWindows -or $env:OS -match "Windows") {
            .\gradlew.bat bundleRelease
        } else {
            ./gradlew bundleRelease
        }

        if ($LASTEXITCODE -eq 0) {
            $aabPath = "app\build\outputs\bundle\release\app-release.aab"
            if (Test-Path $aabPath) {
                Write-Host ""
                Write-Host "=========================================" -ForegroundColor Green
                Write-Host "   构建成功!" -ForegroundColor Green
                Write-Host "=========================================" -ForegroundColor Green
                Write-Host ""
                Write-Host "AAB 位置: $((Get-Item $aabPath).FullName)" -ForegroundColor Cyan
                Write-Host ""

                # 显示文件大小
                $fileSize = (Get-Item $aabPath).Length / 1MB
                Write-Host "文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
            } else {
                Write-Host "错误: 未找到生成的AAB文件" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "错误: 构建失败" -ForegroundColor Red
            exit 1
        }
    }
} finally {
    Pop-Location
}

Write-Host ""
