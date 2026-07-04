#!/usr/bin/env bash
set -euo pipefail

DB_PATH="$HOME/Library/Application Support/WordEntropy/word_entropy.sqlite3"
WORD="commit"
LIMIT="12"

if [[ $# -gt 0 ]]; then
  if [[ "$1" == */* || "$1" == *.sqlite3 ]]; then
    DB_PATH="$1"
    shift
  fi
fi

if [[ $# -gt 0 ]]; then
  WORD="$1"
  shift
fi

if [[ $# -gt 0 ]]; then
  LIMIT="$1"
  shift
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH"
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required"
  exit 1
fi

echo "[C02 Quick Check]"
echo "Database: $DB_PATH"
echo "Word: $WORD"
echo

echo "1) Key source counts"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
WITH expected(ord, source) AS (
  VALUES
    (1, '词单元面板'),
    (2, '词单元悬停'),
    (3, '词单元点击'),
    (4, '右键服务-加词'),
    (5, '右键服务-学会')
),
counts AS (
  SELECT source, COUNT(1) AS cnt
  FROM lookup_events
  GROUP BY source
)
SELECT printf('  - %s: %d', expected.source, COALESCE(counts.cnt, 0))
FROM expected
LEFT JOIN counts ON counts.source = expected.source
ORDER BY expected.ord;
SQL
echo

echo "2) Latest service/click events"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - id=%d [%s] [%s] %s <- %s @ %s',
  id,
  source,
  COALESCE(NULLIF(app_name, ''), '未知应用'),
  word,
  observed_token,
  created_at
)
FROM lookup_events
WHERE source IN ('右键服务-加词', '右键服务-学会', '词单元点击')
ORDER BY id DESC
LIMIT $LIMIT;
SQL
echo

echo "3) Latest events for word: $WORD"
sqlite3 "$DB_PATH" <<SQL
.headers off
.mode list
SELECT printf('  - id=%d [%s] [%s] %s <- %s @ %s',
  id,
  source,
  COALESCE(NULLIF(app_name, ''), '未知应用'),
  word,
  observed_token,
  created_at
)
FROM lookup_events
WHERE word = '$WORD'
ORDER BY id DESC
LIMIT $LIMIT;
SQL
