# Gradle 版本兼容性修复

## 问题描述

构建时出现错误：
```
Failed to apply plugin 'com.facebook.react'.
It is too late to call `finalizeDsl` as the DSL finalization blocks have already been executed.
```

## 原因分析

- Android Gradle Plugin (AGP) 版本 9.0.0 对于 React Native 0.83.1 来说太新
- Gradle 版本 9.1.0 也可能存在兼容性问题
- React Native 0.83.1 需要 AGP 8.7.x 和 Gradle 8.9

## 修复方案

### 1. 降级 Android Gradle Plugin

**文件**: `android/build.gradle`

```gradle
dependencies {
    classpath('com.android.tools.build:gradle:8.7.3')  // 从 9.0.0 降级到 8.7.3
    classpath("com.facebook.react:react-native-gradle-plugin")
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
}
```

### 2. 降级 Gradle 版本

**文件**: `android/gradle/wrapper/gradle-wrapper.properties`

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.9-bin.zip
```

## 版本兼容性

| React Native 版本 | AGP 版本 | Gradle 版本 |
|------------------|---------|------------|
| 0.83.1           | 8.7.x   | 8.9        |

## 验证修复

运行以下命令验证修复：

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

## 注意事项

1. 如果仍然遇到问题，可以尝试清理构建缓存：
   ```bash
   cd android
   ./gradlew clean
   rm -rf .gradle
   rm -rf app/build
   ```

2. 如果使用 Android Studio，可能需要：
   - File -> Invalidate Caches / Restart
   - 重新同步 Gradle 项目

3. 确保 Java 版本兼容：
   - AGP 8.7.3 需要 Java 17
   - 检查 `gradle.properties` 中的 `JAVA_HOME` 设置

## 参考

- [React Native 0.83 发布说明](https://github.com/facebook/react-native/releases/tag/v0.83.1)
- [AGP 8.7 发布说明](https://developer.android.com/build/releases/gradle-plugin)
- [Gradle 8.9 发布说明](https://docs.gradle.org/8.9/release-notes.html)
