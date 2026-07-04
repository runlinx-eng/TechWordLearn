#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
LABEL="com.techwordlearn.vocab-storage-sync"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_BIN="$(command -v python3)"
SCRIPT_PATH="$REPO_DIR/scripts/vocab-storage-sync-daemon.py"
LOG_OUT="$HOME/Library/Logs/techwordlearn-vocab-storage-sync.out.log"
LOG_ERR="$HOME/Library/Logs/techwordlearn-vocab-storage-sync.err.log"

if [[ "$MODE" == "stop" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  launchctl disable "gui/$(id -u)/$LABEL" 2>/dev/null || true
  echo "Stopped $LABEL"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"
mkdir -p "$HOME/.techwordlearn"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PY_BIN}</string>
    <string>${SCRIPT_PATH}</string>
    <string>--interval</string>
    <string>20</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_OUT}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_ERR}</string>
</dict>
</plist>
PLIST

chmod 644 "$PLIST"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Started $LABEL"
echo "plist: $PLIST"
echo "log: $LOG_OUT"
