#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/release}"
VERSION="$(node -p "require('$ROOT_DIR/manifest.json').version")"
OUT_FILE="$OUT_DIR/techwordlearn-v${VERSION}.zip"
TMP_FILE="$OUT_DIR/.techwordlearn-v${VERSION}.tmp.zip"

mkdir -p "$OUT_DIR"
rm -f "$TMP_FILE"
trap 'rm -f "$TMP_FILE"' EXIT

cd "$ROOT_DIR"
zip -r "$TMP_FILE" \
  manifest.json \
  background.js \
  content.js \
  styles.css \
  popup.html \
  popup.js \
  options.html \
  options.css \
  manual-sync.js \
  options.js \
  vocabulary.json \
  LICENSE >/dev/null

mv "$TMP_FILE" "$OUT_FILE"
trap - EXIT

echo "Packaged: $OUT_FILE"
