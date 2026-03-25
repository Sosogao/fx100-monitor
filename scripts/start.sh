#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="$ROOT_DIR/.devserver.pid"
LOG_FILE="$ROOT_DIR/.devserver.log"
PORT="${PORT:-3002}"

"$ROOT_DIR/scripts/stop.sh" >/dev/null 2>&1 || true

source ~/.nvm/nvm.sh
nvm install 22 >/dev/null
nvm use 22 >/dev/null
pnpm build >/dev/null

nohup bash -lc "source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && exec env PORT=$PORT NODE_ENV=production pnpm start" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for _ in {1..30}; do
  if ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
    break
  fi
  if grep -q "Server running on http://localhost:${PORT}/" "$LOG_FILE" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "Monitor server failed to start. See $LOG_FILE" >&2
  tail -n 120 "$LOG_FILE" >&2 || true
  exit 1
fi

echo "Monitor server: http://localhost:${PORT}/"
