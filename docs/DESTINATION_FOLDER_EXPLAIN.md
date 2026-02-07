# Destination Folder 说明

## 什么是 Destination Folder？

**Destination Folder（目标文件夹）** 是在 Android Studio 打包时，用于选择 **APK 或 AAB 文件保存位置** 的选项。

## 作用

- 指定打包完成后，生成的 APK 或 AAB 文件保存在哪个文件夹
- 默认情况下，文件会保存在项目的构建输出目录
- 您可以自定义选择任何文件夹来保存打包文件

## 默认位置

如果不指定 Destination Folder，文件会保存在：

### APK 文件
```
android/app/build/outputs/apk/release/app-release.apk
```

### AAB 文件（用于 Google Play）
```
android/app/build/outputs/bundle/release/app-release.aab
```

## 在 Android Studio 中

当您执行 **Build** → **Generate Signed Bundle / APK** 时：

1. 选择签名信息后
2. 选择构建变体（通常是 **release**）
3. 会看到 **Destination Folder** 选项
4. 可以点击 **...** 按钮浏览选择文件夹
5. 或直接使用默认位置

## 推荐设置

### 选项 1：使用默认位置（推荐）
- 直接点击 **Finish**，使用默认路径
- 文件会自动保存到 `android/app/build/outputs/` 目录

### 选项 2：自定义文件夹
- 点击 **...** 浏览选择文件夹
- 例如：`D:\APK` 或 `C:\Users\YourName\Desktop\Release`
- 方便后续查找和管理

## 示例

假设您选择 Destination Folder 为 `D:\MyApp\Release`：

- **APK 文件** 会保存到：`D:\MyApp\Release\app-release.apk`
- **AAB 文件** 会保存到：`D:\MyApp\Release\app-release.aab`

## 建议

1. **开发测试**：使用默认位置即可
2. **正式发布**：可以指定一个专门的发布文件夹，方便管理
3. **版本管理**：可以在文件夹名称中包含版本号，如 `Release-v1.0.0`

## 总结

- **Destination Folder** = 打包文件的保存位置
- 可以选择任何文件夹
- 默认位置在项目的 `build/outputs/` 目录
- 建议使用默认位置或创建专门的发布文件夹
