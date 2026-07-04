#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${1:-release}"
OUT_DIR="$ROOT_DIR/dist"
APP_DIR="$OUT_DIR/WordEntropyApp.app"
APP_EXECUTABLE="WordEntropyApp"
INFO_PLIST_TEMPLATE="$ROOT_DIR/Sources/WordEntropyApp/Info.plist"
SOURCE_VOCAB_PATH="$ROOT_DIR/Sources/WordEntropyApp/Resources/vocabulary.json"

echo "[1/6] Building executable ($CONFIG)..."
swift build -c "$CONFIG" --package-path "$ROOT_DIR"

BIN_PATH="$(find "$ROOT_DIR/.build" -type f -path "*/$CONFIG/$APP_EXECUTABLE" | head -n 1)"
if [[ -z "$BIN_PATH" ]]; then
  echo "Build artifact not found for executable: $APP_EXECUTABLE"
  exit 1
fi

RESOURCE_BUNDLE_PATH="$(find "$ROOT_DIR/.build" -type d -path "*/$CONFIG/WordEntropyApp_WordEntropyApp.bundle" | head -n 1)"
if [[ -z "$RESOURCE_BUNDLE_PATH" ]]; then
  echo "Resource bundle not found: WordEntropyApp_WordEntropyApp.bundle"
  exit 1
fi

echo "[2/6] Creating app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

echo "[3/6] Copying executable and resources..."
cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/$APP_EXECUTABLE"
chmod +x "$APP_DIR/Contents/MacOS/$APP_EXECUTABLE"
cp -R "$RESOURCE_BUNDLE_PATH" "$APP_DIR/Contents/Resources/"
cp "$SOURCE_VOCAB_PATH" "$APP_DIR/Contents/Resources/vocabulary.json"

echo "[4/6] Writing Info.plist..."
cp "$INFO_PLIST_TEMPLATE" "$APP_DIR/Contents/Info.plist"

echo "[5/6] Signing app bundle (ad-hoc)..."
codesign --force --deep --sign - "$APP_DIR"

echo "[6/6] Registering app bundle for Services..."
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Done:"
echo "  App bundle: $APP_DIR"
echo "  Launch command: open \"$APP_DIR\""
