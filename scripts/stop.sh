#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.devserver.pid"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" || true)"
  if [[ -n "$PID" ]] && kill -0 "$PID" >/dev/null 2>&1; then
    kill "$PID" || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

pkill -f "/Users/vicky/Documents/GitHub/fx100-monitor/node_modules/.bin/../vite/bin/vite.js --host" >/dev/null 2>&1 || true
pkill -f "NODE_ENV=production node dist/index.js" >/dev/null 2>&1 || true
pkill -f "node dist/index.js" >/dev/null 2>&1 || true
pkill -f "fx100-monitoring-system@1.0.0 start" >/dev/null 2>&1 || true
pkill -f "/Users/vicky/Documents/GitHub/fx100-monitor/dist/index.js" >/dev/null 2>&1 || true

echo "Stopped monitor server."
