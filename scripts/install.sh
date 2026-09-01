#!/usr/bin/env bash
# One-line installer:  curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash
# Installs prerequisites it can (nvm/node 22, pnpm), clones the kit into ~/xdc-ai-agent-starter-kit, runs setup.
set -euo pipefail
REPO_URL=${REPO_URL:-https://github.com/0xbeny/xdc-ai-agent-starter-kit}
DIR=${XDC_AGENT_DIR:-$HOME/xdc-ai-agent-starter-kit}
NODE_MAJOR=22

say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is required (macOS: xcode-select --install)"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt $NODE_MAJOR ]; then
  say "Installing Node $NODE_MAJOR via nvm"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install $NODE_MAJOR >/dev/null
  nvm use $NODE_MAJOR >/dev/null
fi
say "Node $(node -v)"

if ! command -v pnpm >/dev/null; then
  say "Enabling pnpm via corepack"
  corepack enable && corepack prepare pnpm@10.18.2 --activate
fi

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"; git -C "$DIR" pull --ff-only
else
  say "Cloning into $DIR"; git clone --depth 1 "$REPO_URL" "$DIR"
fi
cd "$DIR"
say "Installing dependencies"; pnpm install --frozen-lockfile

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  say "Docker detected — Postgres + Redis are available in setup (optional)"
else
  say "No Docker — that's fine: choose SQLite in setup; nothing else is required"
fi

if [ -t 0 ]; then
  say "Starting setup"; pnpm setup </dev/tty
else
  say "Non-interactive shell: run  cd $DIR && pnpm setup  to configure the agent"
fi

if [ "$(uname)" = "Darwin" ] && [ -t 0 ]; then
  printf '\n'; read -r -p "Install as a background service that starts at login (launchd)? [y/N] " yn </dev/tty || yn=n
  if [ "${yn:-n}" = "y" ] || [ "${yn:-n}" = "Y" ]; then
    mkdir -p "$HOME/Library/LaunchAgents" data
    sed "s|__REPO__|$DIR|g" deploy/launchd/tech.xdcai.agent.plist > "$HOME/Library/LaunchAgents/tech.xdcai.agent.plist"
    launchctl unload "$HOME/Library/LaunchAgents/tech.xdcai.agent.plist" 2>/dev/null || true
    launchctl load -w "$HOME/Library/LaunchAgents/tech.xdcai.agent.plist"
    say "Service installed. First start builds the apps (a minute or two). Dashboard: http://localhost:3000 · logs: $DIR/data/service.*.log"
    exit 0
  fi
fi
say "Run it:   cd $DIR && pnpm dev   +   pnpm dev:dashboard   → http://localhost:3000"
say "Or as a service:  bash scripts/serve.sh   (see deploy/launchd and deploy/systemd)"
