# 打包脚本说明

## Android 打包

### 首次打包前准备

1. **生成签名密钥**（仅首次需要）:
   ```powershell
   keytool -genkeypair -v -storetype PKCS12 -keystore android\app\my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   按提示输入密码等信息，请妥善保管密钥文件。

2. **配置签名信息**:
   编辑 `android/gradle.properties` 文件，修改以下内容：
   ```properties
   MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
   MYAPP_RELEASE_KEY_ALIAS=my-key-alias
   MYAPP_RELEASE_STORE_PASSWORD=你的密码
   MYAPP_RELEASE_KEY_PASSWORD=你的密码
   ```

### 打包命令

**方式一：使用 npm 脚本**
```bash
# 打包 APK
npm run build:android:apk

# 打包 AAB (用于 Google Play)
npm run build:android:aab
```

**方式二：直接运行脚本**
```powershell
# 打包 APK
.\scripts\build-android.ps1 apk

# 打包 AAB
.\scripts\build-android.ps1 aab
```

### 输出位置

- **APK**: `android/app/build/outputs/apk/release/app-release.apk`
- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab`

---

## iOS 打包

### 重要说明

⚠️ **iOS 打包必须在 macOS 上进行**，因为需要 Xcode。iOS 设备本身无法进行打包。

### 前提条件

1. macOS 系统
2. 安装 Xcode
3. 拥有 Apple Developer 账号（用于签名）

### 打包步骤

**方式一：使用 npm 脚本**
```bash
npm run build:ios
```

**方式二：直接运行脚本**
```bash
chmod +x scripts/build-ios.sh
./scripts/build-ios.sh
```

### 手动打包（推荐）

由于 iOS 打包需要配置签名和证书，推荐在 Xcode 中手动操作：

1. **安装依赖**:
   ```bash
   cd ios
   bundle exec pod install
   cd ..
   ```

2. **打开 Xcode**:
   ```bash
   open ios/SwellNovalApp.xcworkspace
   ```

3. **在 Xcode 中**:
   - 选择 `Product` → `Scheme` → `SwellNovalApp`
   - 选择 `Product` → `Destination` → `Any iOS Device`
   - 配置签名：选择项目 → `Signing & Capabilities` → 选择你的 Team
   - 构建：`Product` → `Archive`
   - 导出：`Window` → `Organizer` → 选择 Archive → `Distribute App`

---

## 常见问题

### Android

**Q: 打包时提示找不到签名文件？**  
A: 请先按照"首次打包前准备"步骤生成签名密钥。

**Q: 可以使用 debug 签名打包吗？**  
A: 可以，但仅用于测试。发布到应用商店必须使用 release 签名。

**Q: 忘记签名密码怎么办？**  
A: 无法恢复，需要重新生成新的签名密钥。如果已发布应用，需要联系应用商店更新签名。

### iOS

**Q: 为什么不能在 Windows 上打包 iOS？**  
A: iOS 打包需要 Xcode，而 Xcode 只能在 macOS 上运行。

**Q: 可以在 iOS 设备上打包吗？**  
A: 不可以，必须在 macOS 上使用 Xcode 进行打包。

**Q: 打包时提示签名错误？**  
A: 请确保：
- 已登录 Apple Developer 账号
- 在 Xcode 中正确配置了 Signing & Capabilities
- 证书和描述文件有效
