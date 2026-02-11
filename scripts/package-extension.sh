#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/release}"
VERSION="$(node -p "require('$ROOT_DIR/manifest.json').version")"
OUT_FILE="$OUT_DIR/techwordlearn-v${VERSION}.zip"

mkdir -p "$OUT_DIR"

cd "$ROOT_DIR"
zip -r "$OUT_FILE" \
  manifest.json \
  background.js \
  content.js \
  styles.css \
  popup.html \
  popup.js \
  options.html \
  options.css \
  options.js \
  vocabulary.json \
  docs \
  scripts \
  vocab_versions \
  -x "*/.DS_Store" "*/node_modules/*" "*/.git/*" "*/release/*" "*.log" >/dev/null

echo "Packaged: $OUT_FILE"
