# Android Studio 打包指南

本文档介绍如何通过 Android Studio 将 React Native 应用打包成 Android APK 或 AAB。

## 前置准备

### 1. 确保环境已配置
- ✅ Java JDK（已配置：`C:/Program Files/Microsoft/jdk-17.0.18.8-hotspot`）
- ✅ Android SDK（已配置：`C:/Users/lang/AppData/Local/Android/Sdk`）
- ✅ Android Studio 已安装

### 2. 检查签名密钥（Release 打包需要）

项目已配置签名信息，签名文件位置：`android/app/my-release-key.keystore`

如果签名文件不存在，需要先生成：
```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore android/app/my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

## 方法一：使用 Android Studio GUI 打包

### 步骤 1：在 Android Studio 中打开项目

1. 打开 Android Studio
2. 选择 **File** → **Open**
3. 选择项目中的 `android` 文件夹（**不是项目根目录**）
   - 路径：`f:\FrontEnd\Code\SwellNovalApp\android`
4. 等待 Gradle 同步完成

### 步骤 2：配置签名（如果尚未配置）

1. 在 Android Studio 中，点击 **File** → **Project Structure**（或按 `Ctrl+Alt+Shift+S`）
2. 选择左侧的 **Modules** → **app**
3. 切换到 **Signing** 标签页
4. 点击 **+** 添加签名配置，填写：
   - **Name**: `release`
   - **Store File**: 选择 `android/app/my-release-key.keystore`
   - **Store Password**: `SwellNovalApp123`
   - **Key Alias**: `my-key-alias`
   - **Key Password**: `SwellNovalApp123`
5. 切换到 **Build Variants** 标签页，确保 **release** 变体已配置使用该签名
6. 点击 **OK** 保存

### 步骤 3：生成签名 APK

#### 方式 A：使用 Build 菜单

1. 点击顶部菜单 **Build** → **Generate Signed Bundle / APK**
2. 选择 **APK**（用于直接安装）或 **Android App Bundle**（用于 Google Play 发布）
3. 选择签名配置（如果已配置，选择 `release`；否则手动选择密钥文件）
4. 选择 **release** 构建变体
5. 点击 **Finish**
6. 等待构建完成

#### 方式 B：使用 Gradle 面板

1. 在右侧边栏找到 **Gradle** 面板（如果没有，点击 **View** → **Tool Windows** → **Gradle`）
2. 展开项目 → **app** → **Tasks** → **build**
3. 双击以下任务之一：
   - **assembleRelease** - 生成 APK
   - **bundleRelease** - 生成 AAB（用于 Google Play）

### 步骤 4：找到生成的 APK/AAB

构建完成后，文件位置：

- **APK**: `android/app/build/outputs/apk/release/app-release.apk`
- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab`

## 方法二：使用命令行脚本（推荐）

项目已提供自动化打包脚本，使用更方便：

### 生成 APK（用于直接安装）
```powershell
npm run build:android:apk
# 或直接运行
.\scripts\build-android.ps1 apk
```

### 生成 AAB（用于 Google Play 发布）
```powershell
npm run build:android:aab
# 或直接运行
.\scripts\build-android.ps1 aab
```

脚本会自动：
- ✅ 检测和配置 Java 环境
- ✅ 检测和配置 Android SDK
- ✅ 检查签名配置
- ✅ 清理旧的构建文件
- ✅ 执行构建并显示结果

## 方法三：直接使用 Gradle 命令

在项目根目录或 `android` 目录下运行：

### Windows
```powershell
cd android
.\gradlew.bat assembleRelease    # 生成 APK
.\gradlew.bat bundleRelease       # 生成 AAB
```

### 生成 Debug APK（用于测试）
```powershell
cd android
.\gradlew.bat assembleDebug
```

## 常见问题

### 1. Gradle 同步失败
- 检查网络连接（Gradle 需要下载依赖）
- 检查 `android/gradle.properties` 中的 Java 路径是否正确
- 尝试 **File** → **Invalidate Caches / Restart**

### 2. 签名错误
- 确认 `android/app/my-release-key.keystore` 文件存在
- 检查 `android/gradle.properties` 中的签名密码是否正确
- 如果使用 Debug 签名，确保 `android/app/debug.keystore` 存在

### 3. 找不到 SDK
- 确认 `android/local.properties` 中 `sdk.dir` 路径正确
- 或在 Android Studio 中：**File** → **Project Structure** → **SDK Location** 设置 SDK 路径

### 4. 构建速度慢
- 首次构建会下载依赖，需要较长时间
- 后续构建会使用缓存，速度更快
- 可以在 `android/gradle.properties` 中启用并行构建：
  ```
  org.gradle.parallel=true
  ```

## 构建变体说明

- **Debug**: 调试版本，使用 debug 签名，包含调试信息
- **Release**: 发布版本，使用 release 签名，代码经过优化

## 签名配置说明

当前项目的签名配置在 `android/gradle.properties` 中：

```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=SwellNovalApp123
MYAPP_RELEASE_KEY_PASSWORD=SwellNovalApp123
```

**⚠️ 重要提示**：生产环境请使用更安全的密码，并妥善保管密钥文件！

## 下一步

- APK 可以直接安装到 Android 设备进行测试
- AAB 需要上传到 Google Play Console 进行发布
- 建议在发布前进行充分测试
