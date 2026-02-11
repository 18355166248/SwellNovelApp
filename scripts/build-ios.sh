#!/bin/bash
# iOS 打包脚本 (macOS)
# 使用方法: ./scripts/build-ios.sh
# 可选: ./scripts/build-ios.sh --deep-clean  # 深度清理（解决 modulemap not found 等顽固错误）

set -e

DEEP_CLEAN=false
if [ "$1" = "--deep-clean" ]; then
    DEEP_CLEAN=true
fi

echo "========================================="
echo "   iOS 打包脚本"
echo "========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查是否在 macOS 上
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "错误: iOS 打包必须在 macOS 上进行"
    exit 1
fi

# 检查 Xcode 是否安装
if ! command -v xcodebuild &> /dev/null; then
    echo "错误: 未找到 Xcode，请先安装 Xcode"
    exit 1
fi

if [ "$DEEP_CLEAN" = true ]; then
    echo "0. 深度清理（解决 modulemap not found 等错误）..."
    cd ios
    echo "   - 执行 pod deintegrate..."
    pod deintegrate 2>/dev/null || true
    echo "   - 移除 Pods 和 Podfile.lock..."
    rm -rf Pods Podfile.lock
    cd ..
    DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
    for dir in ${DERIVED_DATA_PATH}/SwellNovalApp-*; do
        if [ -d "$dir" ]; then
            echo "   - 清理 DerivedData: $dir"
            rm -rf "$dir"
        fi
    done
    echo "   深度清理完成"
    echo ""
fi

echo "1. 安装 CocoaPods 依赖..."
cd ios
if [ -f "Podfile" ]; then
    if [ -f "Gemfile" ]; then
        bundle exec pod install
    else
        pod install
    fi
else
    echo "警告: 未找到 Podfile"
fi
cd ..

echo ""
echo "2. 清理之前的构建..."
# 清理 DerivedData 中本项目的缓存（解决 RCTSwiftUI.modulemap 等 modulemap not found 错误）
DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
PROJECT_DERIVED=$(ls -d ${DERIVED_DATA_PATH}/SwellNovalApp-* 2>/dev/null | head -1)
if [ -n "$PROJECT_DERIVED" ] && [ -d "$PROJECT_DERIVED" ]; then
    echo "   清理 DerivedData: $PROJECT_DERIVED"
    rm -rf "$PROJECT_DERIVED"
fi
cd ios
xcodebuild clean -workspace SwellNovalApp.xcworkspace -scheme SwellNovalApp
cd ..

echo ""
echo "3. 构建 Archive..."
echo "   注意: 此步骤需要在 Xcode 中手动完成以下操作:"
echo "   - 打开 ios/SwellNovalApp.xcworkspace"
echo "   - 选择 Product > Scheme > SwellNovalApp"
echo "   - 选择 Product > Destination > Any iOS Device"
echo "   - 配置签名: 选择项目 > Signing & Capabilities > 选择你的 Team"
echo "   - 选择 Product > Archive"
echo "   - 在 Organizer 中导出 IPA"
echo ""

# 尝试使用命令行构建（需要配置好签名）
echo "是否尝试使用命令行构建? (需要先配置好签名) [y/N]"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    cd ios
    ARCHIVE_DIR="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)"
    mkdir -p "$ARCHIVE_DIR"
    ARCHIVE_PATH="$ARCHIVE_DIR/SwellNovalApp.xcarchive"

    xcodebuild archive \
        -workspace SwellNovalApp.xcworkspace \
        -scheme SwellNovalApp \
        -configuration Release \
        -archivePath "$ARCHIVE_PATH" \
        -allowProvisioningUpdates

    if [ $? -eq 0 ]; then
        echo ""
        echo "========================================="
        echo "   Archive 构建成功!"
        echo "========================================="
        echo ""
        echo "Archive 位置: $ARCHIVE_PATH"
        echo ""
        echo "接下来请在 Xcode 中:"
        echo "1. 打开 Window > Organizer（或按 Cmd+Shift+O）"
        echo "2. 在 Archives 列表中选择刚才构建的 SwellNovalApp"
        echo "3. 点击 Distribute App 导出 IPA"
        echo ""
        echo "若 Organizer 中仍未显示，可双击此文件在 Finder 中打开:"
        echo "   $ARCHIVE_PATH"
    else
        echo "错误: Archive 构建失败"
        exit 1
    fi
    cd ..
else
    echo ""
    echo "请按照上述步骤在 Xcode 中手动打包"
fi

echo ""
