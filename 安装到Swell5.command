#!/bin/zsh
# Swell5 免费签名续装入口：Finder 双击运行，或执行 npm run ios:swell5。
# 使用固定设备标识可以避免误装到同时连接的其他测试机；覆盖安装会保留 App 数据。

set -u

PROJECT_DIR="${0:A:h}"
XCODE_DEVICE_UDID="${SWELL5_XCODE_UDID:-00008110-001154AC0E91801E}"
CORE_DEVICE_ID="${SWELL5_CORE_DEVICE_ID:-5A92794F-DF8F-5713-B9F1-A3372804DF13}"
DERIVED_DATA_PATH="/tmp/SwellNovelAppDeviceDerivedData"
APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release-iphoneos/SwellNovalApp.app"
LOG_PATH="/tmp/SwellNovelApp-Swell5-install.log"
BUNDLE_ID="org.reactjs.native.example.SwellNovalApp"
NO_PAUSE=false

for argument in "$@"; do
  case "$argument" in
    --no-pause)
      NO_PAUSE=true
      ;;
    -h|--help)
      echo "用法："
      echo "  Finder 双击：安装到Swell5.command"
      echo "  命令行运行：npm run ios:swell5"
      echo ""
      echo "可选环境变量：SWELL5_XCODE_UDID、SWELL5_CORE_DEVICE_ID"
      exit 0
      ;;
    *)
      echo "未知参数：${argument}"
      exit 2
      ;;
  esac
done

pause_before_exit() {
  if [[ "$NO_PAUSE" == false && -t 0 ]]; then
    echo ""
    read -k 1 "?按任意键关闭窗口…"
    echo ""
  fi
}

fail_with_log() {
  local message="$1"
  echo ""
  echo "❌ ${message}"
  if [[ -f "$LOG_PATH" ]]; then
    echo ""
    echo "最近的构建日志："
    tail -n 50 "$LOG_PATH"
    echo ""
    echo "完整日志：${LOG_PATH}"
  fi
  pause_before_exit
  exit 1
}

cd "$PROJECT_DIR" || exit 1
: > "$LOG_PATH"

echo "========================================="
echo "  SwellNovelApp → Swell5 一键续装"
echo "========================================="
echo ""

if ! command -v xcodebuild >/dev/null 2>&1; then
  fail_with_log "未找到 Xcode 命令行工具，请先安装或启动 Xcode。"
fi

echo "[1/3] 检查 Swell5…"
DEVICE_LIST=""
# CoreDevice 偶尔会在刚唤醒时初始化超时，短暂重试可避免用户重复双击脚本。
for attempt in 1 2 3; do
  if DEVICE_LIST="$(xcrun devicectl list devices 2>>"$LOG_PATH")"; then
    break
  fi
  if [[ "$attempt" -lt 3 ]]; then
    sleep 2
  fi
done
DEVICE_LINE="$(printf '%s\n' "$DEVICE_LIST" | grep -F "$CORE_DEVICE_ID" || true)"
if [[ -z "$DEVICE_LINE" ]]; then
  fail_with_log "没有找到 Swell5。请打开手机的开发者模式，并用数据线连接或保持在同一网络。"
fi
# devicectl 的状态 “unavailable” 本身含有 “available” 子串，必须先排除它再判断，
# 否则设备离线时这一步会误判通过，直到 xcodebuild 才报“找不到 destination”。
if [[ "$DEVICE_LINE" == *"unavailable"* ]]; then
  fail_with_log "Swell5 已配对但当前不可用（unavailable）。请用数据线连接手机、解锁屏幕，或确认它与本机在同一网络后重试。"
fi
if [[ "$DEVICE_LINE" != *"available"* && "$DEVICE_LINE" != *"connected"* ]]; then
  fail_with_log "Swell5 状态异常，请解锁手机并重新连接后重试。当前状态：${DEVICE_LINE}"
fi

echo "[2/3] 增量构建 Release（首次较慢，后续会复用缓存）…"
if ! xcodebuild \
  -workspace ios/SwellNovalApp.xcworkspace \
  -scheme SwellNovalApp \
  -configuration Release \
  -destination "platform=iOS,id=${XCODE_DEVICE_UDID}" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  build >>"$LOG_PATH" 2>&1; then
  fail_with_log "构建或免费签名续期失败。"
fi

if [[ ! -d "$APP_PATH" ]]; then
  fail_with_log "构建成功但没有找到 App 产物。"
fi

echo "[3/3] 覆盖安装到 Swell5（保留书架与阅读进度）…"
if ! xcrun devicectl device install app \
  --device "$CORE_DEVICE_ID" \
  "$APP_PATH" >>"$LOG_PATH" 2>&1; then
  fail_with_log "安装失败，请保持 Swell5 解锁并重新连接。"
fi

echo ""
echo "✅ 安装成功，免费签名已续期。"
echo "   建议下次续装：$(date -v+6d '+%Y-%m-%d %H:%M') 前"

if xcrun devicectl device process launch \
  --device "$CORE_DEVICE_ID" \
  --terminate-existing "$BUNDLE_ID" >>"$LOG_PATH" 2>&1; then
  echo "✅ App 已自动启动。"
else
  echo "ℹ️  Swell5 当前可能锁屏；解锁后手动点击 App 即可。"
fi

echo "   详细日志：${LOG_PATH}"
pause_before_exit
