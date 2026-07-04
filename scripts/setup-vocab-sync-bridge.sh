#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
LABEL="com.techwordlearn.vocab-sync-bridge"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_BIN="$(command -v python3)"
SCRIPT_PATH="$REPO_DIR/scripts/vocab-sync-bridge.py"
STATE_FILE="$HOME/.techwordlearn/vocab-bridge-state.json"
LOG_OUT="$HOME/Library/Logs/techwordlearn-vocab-sync-bridge.out.log"
LOG_ERR="$HOME/Library/Logs/techwordlearn-vocab-sync-bridge.err.log"

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
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>43110</string>
    <string>--state-file</string>
    <string>${STATE_FILE}</string>
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
echo "state: $STATE_FILE"
echo "log: $LOG_OUT"
