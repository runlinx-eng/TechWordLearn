#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT_DIR/dist/WordEntropyApp.app}"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
APP_EXECUTABLE="WordEntropyApp"
APP_BUNDLE_ID="com.zj16.wordentropy"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH"
  echo "Tip: run ./scripts/build_app_bundle.sh release first"
  exit 1
fi

echo "[1/3] Registering app bundle in LaunchServices..."
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_PATH" >/dev/null 2>&1 || true
fi

echo "[2/4] Restarting app and Services cache..."
osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
killall "$APP_EXECUTABLE" >/dev/null 2>&1 || true
killall pbs >/dev/null 2>&1 || true
sleep 0.3

echo "[3/4] Opening app..."
open "$APP_PATH"

echo "[4/4] Done:"
echo "  App: $APP_PATH"
echo "  Next: confirm runtime is latest, then in target app select a word -> right click -> 服务"
