# 使用本地 Gradle 8.14 配置说明

## 配置方式

有两种方式使用本地 Gradle 8.14：

### 方式一：设置环境变量（推荐）

设置系统环境变量，让 Gradle Wrapper 自动使用本地 Gradle：

1. **设置 GRADLE_HOME 环境变量**：
   - 变量名：`GRADLE_HOME`
   - 变量值：`D:\ruanjian\gradle-8.14`

2. **添加到 PATH**（可选）：
   - 添加 `%GRADLE_HOME%\bin` 到 PATH 环境变量

3. **验证**：
   ```bash
   gradle --version
   ```

### 方式二：直接使用本地 Gradle 命令

如果 PATH 中已配置 Gradle，可以直接使用 `gradle` 命令而不是 `gradlew`：

```bash
cd android
gradle clean
gradle assembleDebug
```

## 当前配置

项目已配置为：
- 使用 Gradle 8.14（通过 Wrapper 下载或本地环境变量）
- 如果设置了 `GRADLE_HOME`，Gradle Wrapper 会自动使用本地 Gradle

## 验证配置

### 检查环境变量

**Windows PowerShell**：
```powershell
$env:GRADLE_HOME
```

**Windows CMD**：
```cmd
echo %GRADLE_HOME%
```

### 验证 Gradle 版本

```bash
cd android
./gradlew --version
```

应该显示：
```
Gradle 8.14
```

## 设置环境变量（Windows）

### 方法一：通过系统设置

1. 右键"此电脑" -> "属性"
2. 点击"高级系统设置"
3. 点击"环境变量"
4. 在"系统变量"中点击"新建"
5. 变量名：`GRADLE_HOME`
6. 变量值：`D:\ruanjian\gradle-8.14`
7. 确定保存

### 方法二：通过 PowerShell（临时，当前会话）

```powershell
$env:GRADLE_HOME = "D:\ruanjian\gradle-8.14"
$env:PATH += ";$env:GRADLE_HOME\bin"
```

### 方法三：通过 PowerShell（永久）

```powershell
[System.Environment]::SetEnvironmentVariable("GRADLE_HOME", "D:\ruanjian\gradle-8.14", "Machine")
[System.Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";D:\ruanjian\gradle-8.14\bin", "Machine")
```

## 故障排除

### 1. Gradle Wrapper 仍然下载 Gradle

如果设置了 `GRADLE_HOME` 但 Wrapper 仍然下载，检查：
- 环境变量是否正确设置
- 需要重启终端或 IDE 使环境变量生效
- 检查 `D:\ruanjian\gradle-8.14` 目录是否存在且完整

### 2. 权限问题

如果遇到文件访问权限错误：
- 确保 Gradle 目录有读取权限
- 以管理员身份运行终端
- 清理 `.gradle` 缓存目录

### 3. 清理缓存

```powershell
cd android
Remove-Item -Recurse -Force .gradle -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force app/build -ErrorAction SilentlyContinue
```

## 注意事项

1. **Gradle 版本兼容性**：
   - Gradle 8.14 需要 Java 17 或更高版本
   - 确保 AGP 版本与 Gradle 版本兼容（当前使用 AGP 8.7.3）

2. **路径格式**：
   - Windows 路径使用反斜杠 `\` 或正斜杠 `/` 都可以
   - 环境变量中建议使用反斜杠

3. **IDE 配置**：
   - Android Studio：File -> Settings -> Build, Execution, Deployment -> Build Tools -> Gradle
   - 选择 "Use local gradle distribution" 并指定路径

## 推荐配置

为了确保一致性，建议：

1. **设置环境变量** `GRADLE_HOME`
2. **使用 Gradle Wrapper**（`gradlew`）而不是直接使用 `gradle`
3. **版本锁定**：通过 `gradle-wrapper.properties` 锁定 Gradle 版本

这样既可以使用本地 Gradle（提高速度），又保持了项目的可移植性。
