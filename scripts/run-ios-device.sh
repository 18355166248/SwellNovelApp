#!/bin/bash
# iOS 真机安装脚本：构建 Release 包并安装到真机。
#
# Release 包会在构建阶段内置 main.jsbundle，不依赖 Metro/端口连接；
# 后续真机安装统一走这个脚本，避免 Debug 包连 8002/8082 失败。
#
# 使用:
#   npm run ios:device
#   npm run ios:device -- --udid 00008110-001154AC0E91801E
#   npm run ios:device -- --deep-clean

set -e

DEEP_CLEAN=false
DEVICE_UDID="${IOS_DEVICE_UDID:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --deep-clean)
      DEEP_CLEAN=true
      shift
      ;;
    --udid)
      DEVICE_UDID="$2"
      shift 2
      ;;
    *)
      if [ -z "$DEVICE_UDID" ]; then
        DEVICE_UDID="$1"
      fi
      shift
      ;;
  esac
done

echo "========================================="
echo "   iOS 真机 Release 安装"
echo "========================================="
echo ""

if [ ! -f "package.json" ]; then
  echo "错误: 请在项目根目录运行此脚本"
  exit 1
fi

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "错误: iOS 安装必须在 macOS 上进行"
  exit 1
fi

if ! command -v xcodebuild &> /dev/null; then
  echo "错误: 未找到 Xcode，请先安装 Xcode"
  exit 1
fi

if [ -z "$DEVICE_UDID" ]; then
  echo "检测已连接真机..."
  while IFS= read -r line; do
    if [[ "$line" == "== Simulators =="* ]] || [[ "$line" == "== Devices Offline =="* ]]; then
      break
    fi
    if [[ "$line" =~ \(([0-9A-F]{8}-[0-9A-F]+)\)$ ]]; then
      DEVICE_UDID="${BASH_REMATCH[1]}"
      break
    fi
  done < <(xcrun xctrace list devices 2>/dev/null)
fi

if [ -z "$DEVICE_UDID" ]; then
  echo "错误: 未检测到可用真机。请连接 iPhone，或传入 --udid <设备UDID>"
  echo ""
  echo "当前设备列表:"
  xcrun xctrace list devices || true
  exit 1
fi

if [ "$DEEP_CLEAN" = true ]; then
  echo "1. 深度清理 Pods 与 DerivedData..."
  cd ios
  pod deintegrate 2>/dev/null || true
  rm -rf Pods Podfile.lock
  cd ..
  DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
  for dir in "${DERIVED_DATA_PATH}"/SwellNovalApp-*; do
    if [ -d "$dir" ]; then
      echo "   清理 DerivedData: $dir"
      rm -rf "$dir"
    fi
  done
else
  echo "1. 跳过深度清理（需要时加 --deep-clean）"
fi

echo ""
echo "2. 安装 CocoaPods 依赖..."
cd ios
if [ -f "Podfile" ]; then
  if [ -f "../Gemfile" ]; then
    if bundle install; then
      bundle exec pod install
    else
      echo "bundle install 失败，尝试使用全局 pod"
      pod install
    fi
  else
    pod install
  fi
else
  echo "错误: 未找到 Podfile"
  exit 1
fi
cd ..

echo ""
echo "3. 构建并安装 Release 到真机..."
echo "   设备 UDID: $DEVICE_UDID"
echo "   说明: Release 会内置 JS，不使用 Metro 端口。"
npx react-native run-ios --mode Release --udid "$DEVICE_UDID" --port 8082

echo ""
echo "========================================="
echo "   安装完成"
echo "========================================="
