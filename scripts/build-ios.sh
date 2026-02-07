#!/bin/bash
# iOS 打包脚本 (macOS)
# 使用方法: ./scripts/build-ios.sh

set -e

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
    xcodebuild archive \
        -workspace SwellNovalApp.xcworkspace \
        -scheme SwellNovalApp \
        -configuration Release \
        -archivePath build/SwellNovalApp.xcarchive \
        -allowProvisioningUpdates
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "========================================="
        echo "   Archive 构建成功!"
        echo "========================================="
        echo ""
        echo "Archive 位置: ios/build/SwellNovalApp.xcarchive"
        echo ""
        echo "接下来请在 Xcode 中:"
        echo "1. 打开 Window > Organizer"
        echo "2. 选择刚才构建的 Archive"
        echo "3. 点击 Distribute App 导出 IPA"
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
