#!/usr/bin/env bash
# Native (no Docker) production runner: builds once, then runs agent + dashboard (+ Telegram gateway when
# TELEGRAM_BOT_TOKEN is set) as plain Node processes. If any process exits, the script exits so
# launchd/systemd restarts the set. Storage: whatever .env says (SQLite needs nothing else).
set -euo pipefail
cd "$(dirname "$0")/.."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use "$(tr -d '[:space:]' < .node-version)" >/dev/null 2>&1 || true
export PATH="$HOME/.local/share/pnpm:$PATH"
set -a; [ -f .env ] && . ./.env; set +a
export NODE_ENV=production MASTRA_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 COPILOTKIT_TELEMETRY_DISABLED=true
export PORT="${AGENT_PORT:-4111}"

if [ ! -f apps/agent/.mastra/output/index.mjs ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "▸ building agent"; pnpm --filter @xdc-ai/agent build
fi
if [ ! -d apps/dashboard/.next ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "▸ building dashboard"; pnpm --filter @xdc-ai/dashboard build
fi

pids=()
( cd apps/agent && exec node .mastra/output/index.mjs ) & pids+=($!)
( cd apps/dashboard && PORT="${DASHBOARD_PORT:-3000}" exec pnpm exec next start -p "${DASHBOARD_PORT:-3000}" ) & pids+=($!)
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  ( cd apps/agent && exec node src/gateway.ts ) & pids+=($!)
fi
trap 'kill "${pids[@]}" 2>/dev/null; wait; exit 0' INT TERM
echo "▸ agent :${PORT} · dashboard :${DASHBOARD_PORT:-3000}${TELEGRAM_BOT_TOKEN:+ · telegram gateway on}"
wait -n
echo "✗ a process exited; stopping the rest so the service manager restarts everything"
kill "${pids[@]}" 2>/dev/null; wait; exit 1
