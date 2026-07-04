#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-$HOME/Library/Application Support/WordEntropy/word_entropy.sqlite3}"
WORD="${2:-variable}"
LIMIT="${3:-12}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH"
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required"
  exit 1
fi

echo "[D01 Quick Check]"
echo "Database: $DB_PATH"
echo "Word: $WORD"
echo

echo "1) Source distribution"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - %s: %d', source, COUNT(1))
FROM lookup_events
GROUP BY source
ORDER BY COUNT(1) DESC, source ASC;
SQL
echo

echo "2) Latest source timestamps"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - %s: %s', source, MAX(created_at))
FROM lookup_events
GROUP BY source
ORDER BY source ASC;
SQL
echo

echo "3) Latest events for word: $WORD"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - id=%d [%s] [%s] %s <- %s @ %s', id, source, COALESCE(NULLIF(app_name, ''), '未知应用'), word, observed_token, created_at)
FROM lookup_events
WHERE word = '$WORD'
ORDER BY id DESC
LIMIT $LIMIT;
SQL
echo

echo "4) Latest hover events"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - id=%d [%s] %s <- %s @ %s', id, COALESCE(NULLIF(app_name, ''), '未知应用'), word, observed_token, created_at)
FROM lookup_events
WHERE source = '词单元悬停'
ORDER BY id DESC
LIMIT $LIMIT;
SQL
