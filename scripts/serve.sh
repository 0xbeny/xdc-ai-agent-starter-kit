#!/usr/bin/env bash
# Native (no Docker) production runner: builds once, then runs agent + dashboard (+ Telegram gateway when
# TELEGRAM_BOT_TOKEN is set) as plain processes. If any process exits, the script exits so launchd/systemd
# restarts the set. Portable to macOS's stock bash 3.2 and launchd's minimal environment.
# `serve.sh --check` only resolves node/pnpm and prints versions (used by tests and by humans debugging).
set -euo pipefail
cd "$(dirname "$0")/.."

REQ=$(tr -d '[:space:]' < .node-version)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# Try the nvm shell function first; it may not work under launchd, so fall back to the versioned bin dir.
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use "$REQ" >/dev/null 2>&1 || true
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null)" != "v$REQ" ]; then
  [ -d "$NVM_DIR/versions/node/v$REQ/bin" ] && PATH="$NVM_DIR/versions/node/v$REQ/bin:$PATH"
fi
PATH="$HOME/.local/share/pnpm:$PATH"
export PATH
command -v node >/dev/null 2>&1 || { echo "✗ node v$REQ not found (looked in PATH and $NVM_DIR/versions/node/v$REQ). Re-run the installer: curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "✗ pnpm not found for node $(node -v). Re-run the installer (it sets pnpm up via corepack or npm)." >&2; exit 1; }

if [ "${1:-}" = "--check" ]; then
  echo "node $(node -v) at $(command -v node)"
  echo "pnpm $(pnpm -v) at $(command -v pnpm)"
  exit 0
fi

set +u; set -a; [ -f .env ] && . ./.env; set +a; set -u
export NODE_ENV=production MASTRA_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 COPILOTKIT_TELEMETRY_DISABLED=true
export PORT="${AGENT_PORT:-4111}"

if [ ! -f apps/agent/.mastra/output/index.mjs ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "▸ building agent"; pnpm --filter @xdc-ai/agent build
fi
if [ ! -d apps/dashboard/.next ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "▸ building dashboard"; pnpm --filter @xdc-ai/dashboard build
fi

pids=""
( cd apps/agent && exec node .mastra/output/index.mjs ) & pids="$pids $!"
( cd apps/dashboard && PORT="${DASHBOARD_PORT:-3000}" exec pnpm exec next start -H "${DASHBOARD_HOST:-127.0.0.1}" -p "${DASHBOARD_PORT:-3000}" ) & pids="$pids $!"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  ( cd apps/agent && exec node src/gateway.ts ) & pids="$pids $!"
fi
# shellcheck disable=SC2086
trap 'kill $pids 2>/dev/null; wait; exit 0' INT TERM
echo "▸ agent :${PORT} · dashboard :${DASHBOARD_PORT:-3000}${TELEGRAM_BOT_TOKEN:+ · telegram gateway on}"

# macOS ships bash 3.2 (no `wait -n`): poll the children instead.
while :; do
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "✗ a process exited; stopping the rest so the service manager restarts everything" >&2
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null
      wait
      exit 1
    fi
  done
  sleep 2
done
