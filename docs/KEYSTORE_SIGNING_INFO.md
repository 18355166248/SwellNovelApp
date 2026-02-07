# Android 签名密钥信息

## 签名信息说明

当 Android Studio 提示填写签名信息时，请使用以下值：

### 📝 签名字段说明

| 字段名称 | 说明 | 值 |
|---------|------|-----|
| **Key Store Path** | 密钥文件路径 | `android/app/my-release-key.keystore`<br>或完整路径：`f:\FrontEnd\Code\SwellNovalApp\android\app\my-release-key.keystore` |
| **Key Store Password** | 密钥库密码 | `SwellNovalApp123` |
| **Key Alias** | 密钥别名 | `my-key-alias` |
| **Key Password** | 密钥密码 | `SwellNovalApp123` |

## 在 Android Studio 中填写

### 方式一：Generate Signed Bundle / APK 对话框

1. **Build** → **Generate Signed Bundle / APK**
2. 选择 **APK** 或 **Android App Bundle**
3. 如果提示选择密钥文件：
   - 点击 **Choose existing...** 或 **Create new...**
   - 如果选择现有密钥，填写：
     - **Key store path**: 浏览选择 `android/app/my-release-key.keystore`
     - **Key store password**: `SwellNovalApp123`
     - **Key alias**: `my-key-alias`
     - **Key password**: `SwellNovalApp123`
4. 点击 **Next**
5. 选择 **release** 构建变体
6. 点击 **Finish**

### 方式二：Project Structure 中配置

1. **File** → **Project Structure**（`Ctrl+Alt+Shift+S`）
2. 选择 **Modules** → **app**
3. 切换到 **Signing** 标签页
4. 点击 **+** 添加签名配置：
   - **Name**: `release`
   - **Store File**: 浏览选择 `android/app/my-release-key.keystore`
   - **Store Password**: `SwellNovalApp123`
   - **Key Alias**: `my-key-alias`
   - **Key Password**: `SwellNovalApp123`
5. 切换到 **Build Variants** 标签页
6. 确保 **release** 变体使用该签名配置
7. 点击 **OK**

## 字段详细说明

### 1. Key Store Path（密钥文件路径）
- **作用**: 指定签名密钥文件的位置
- **当前值**: `android/app/my-release-key.keystore`
- **完整路径**: `f:\FrontEnd\Code\SwellNovalApp\android\app\my-release-key.keystore`
- **注意**: 可以使用相对路径（相对于项目根目录）或绝对路径

### 2. Key Store Password（密钥库密码）
- **作用**: 用于解锁密钥库文件的密码
- **当前值**: `SwellNovalApp123`
- **安全提示**: ⚠️ 生产环境请使用更复杂的密码

### 3. Key Alias（密钥别名）
- **作用**: 密钥库中特定密钥的标识名称
- **当前值**: `my-key-alias`
- **说明**: 一个密钥库可以包含多个密钥，通过别名区分

### 4. Key Password（密钥密码）
- **作用**: 用于访问特定密钥的密码
- **当前值**: `SwellNovalApp123`
- **注意**: 通常与 Key Store Password 相同，但可以不同

## 配置文件位置

签名配置已保存在 `android/gradle.properties` 文件中：

```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=SwellNovalApp123
MYAPP_RELEASE_KEY_PASSWORD=SwellNovalApp123
```

## 验证签名文件

检查签名文件是否存在：
```powershell
Test-Path "android\app\my-release-key.keystore"
```

查看签名文件信息（需要密码）：
```powershell
keytool -list -v -keystore android\app\my-release-key.keystore
```

## 重要提示

### ⚠️ 安全注意事项

1. **妥善保管密钥文件**：
   - 密钥文件 `my-release-key.keystore` 是应用更新的唯一凭证
   - 如果丢失，将无法更新已发布的应用
   - 建议备份到安全位置

2. **密码安全**：
   - 当前密码 `SwellNovalApp123` 仅用于开发测试
   - 生产环境请使用更复杂、唯一的密码
   - 不要将密码提交到版本控制系统

3. **密钥文件位置**：
   - 当前密钥文件在：`android/app/my-release-key.keystore`
   - 该文件已在 `.gitignore` 中，不会被提交到 Git

### 📋 快速参考

**在 Android Studio 打包时填写：**
```
Key Store Path:    android/app/my-release-key.keystore
Key Store Password: SwellNovalApp123
Key Alias:         my-key-alias
Key Password:      SwellNovalApp123
```

## 如果密钥文件丢失

如果密钥文件丢失，需要重新生成：

```powershell
# 运行生成脚本
.\scripts\generate-keystore.ps1

# 或手动生成
keytool -genkeypair -v -storetype PKCS12 -keystore android/app/my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

**注意**: 重新生成密钥后，之前用旧密钥签名的应用将无法更新！

## 常见问题

### Q: 为什么需要签名？
A: Android 要求所有应用必须使用数字证书签名才能安装。Release 版本必须使用非调试签名。

### Q: Debug 和 Release 签名的区别？
A: 
- **Debug**: 使用默认调试密钥，仅用于开发测试
- **Release**: 使用自定义密钥，用于发布到应用商店

### Q: 可以修改密码吗？
A: 可以，但需要：
1. 重新生成密钥文件
2. 更新 `gradle.properties` 中的密码
3. 注意：旧密钥签名的应用将无法更新

### Q: 多个应用可以使用同一个密钥吗？
A: 可以，但不推荐。建议每个应用使用独立的密钥。
