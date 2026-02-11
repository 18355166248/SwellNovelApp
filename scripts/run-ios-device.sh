#!/bin/bash
# 为真机打包做准备：清理缓存、安装 Pod 依赖
# 完成后需在 Xcode 中自行选择设备并点击 Build/Run
# 使用方法: ./scripts/run-ios-device.sh
# 可选: ./scripts/run-ios-device.sh --deep-clean  # 深度清理（解决 RCTSwiftUI.modulemap 等顽固错误）

set -e

DEEP_CLEAN=false
if [ "$1" = "--deep-clean" ]; then
    DEEP_CLEAN=true
fi

echo "========================================="
echo "   iOS 真机打包准备脚本"
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

echo "1. 清理构建缓存（解决 RCTSwiftUI.modulemap 等错误）..."
DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
if [ "$DEEP_CLEAN" = true ]; then
    cd ios
    echo "   执行 pod deintegrate..."
    pod deintegrate 2>/dev/null || true
    echo "   移除 Pods 和 Podfile.lock..."
    rm -rf Pods Podfile.lock
    cd ..
fi
for dir in ${DERIVED_DATA_PATH}/SwellNovalApp-*; do
    if [ -d "$dir" ]; then
        echo "   清理 DerivedData: $dir"
        rm -rf "$dir"
    fi
done

echo ""
echo "2. 安装 CocoaPods 依赖..."
cd ios
if [ -f "Podfile" ]; then
    USE_BUNDLE=false
    if [ -f "../Gemfile" ]; then
        echo "   执行 bundle install..."
        if bundle install; then
            USE_BUNDLE=true
        else
            echo ""
            echo "   bundle install 失败，将尝试使用全局 pod 命令"
            echo "   (若 pod 未安装，可执行: sudo gem install cocoapods)"
            echo ""
        fi
    fi
    if [ "$USE_BUNDLE" = true ]; then
        bundle exec pod install
    else
        pod install
    fi
else
    echo "错误: 未找到 Podfile"
    exit 1
fi
cd ..

echo ""
echo "========================================="
echo "   准备完成"
echo "========================================="
echo ""
echo "请按以下步骤在 Xcode 中构建并安装到真机:"
echo "  1. 打开 ios/SwellNovalApp.xcworkspace"
echo "  2. 选择 Product > Scheme > SwellNovalApp"
echo "  3. 选择 Product > Destination > 你的 iPhone 设备"
echo "  4. 配置签名: 项目 > Signing & Capabilities > 选择 Team"
echo "  5. 点击 Product > Build (或 Cmd+B) 构建"
echo "  6. 构建成功后点击 Run (或 Cmd+R) 运行到设备"
echo ""
echo "若需 Metro 调试，请先在另一终端运行: npm start"
echo ""
