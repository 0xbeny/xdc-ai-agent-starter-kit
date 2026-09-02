#!/usr/bin/env bash
# Self-update from the original repo. Touches only tracked code: workspace/, data/, .env and the database
# are git-ignored and never modified. Usage: pnpm update:kit   (or bash scripts/update.sh [--no-restart])
set -euo pipefail
cd "$(dirname "$0")/.."
REQ=$(tr -d '[:space:]' < .node-version)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use "$REQ" >/dev/null 2>&1 || true
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null)" != "v$REQ" ]; then
  [ -d "$NVM_DIR/versions/node/v$REQ/bin" ] && PATH="$NVM_DIR/versions/node/v$REQ/bin:$PATH"
fi
PATH="$HOME/.local/share/pnpm:$PATH"; export PATH
say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %b\n' "$*" >&2; exit 1; }

BRANCH=${KIT_BRANCH:-main}
REMOTE=${KIT_REMOTE:-origin}
before=$(git rev-parse --short HEAD)

dirty=$(git status --porcelain --untracked-files=no)
if [ -n "$dirty" ]; then
  die "You have local changes to kit files:\n$dirty\nCommit or stash them first (your agent data in workspace/, data/ and .env is not affected by this check)."
fi

say "Fetching $REMOTE/$BRANCH"
git fetch --quiet "$REMOTE" "$BRANCH"
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "$REMOTE/$BRANCH")" ]; then
  say "Already up to date ($before)"; exit 0
fi
git pull --ff-only --quiet "$REMOTE" "$BRANCH" || die "Fast-forward failed; your branch has diverged from $REMOTE/$BRANCH"
after=$(git rev-parse --short HEAD)
say "Updated $before → $after"
git --no-pager log --oneline "$before..$after" | sed 's/^/    /' | head -20

say "Installing dependencies"; pnpm install --frozen-lockfile
say "Adding any new workspace templates (edited files are left alone)"
node --experimental-strip-types -e "import('./packages/workspace/src/seed.ts').then(m=>{const a=m.addMissingFromTemplates('workspace','templates/workspace');console.log(a.length?'    added: '+a.join(', '):'    nothing new')})" 2>/dev/null || true

say "Rebuilding"; REBUILD=1 pnpm --filter @xdc-ai/agent build >/dev/null && pnpm --filter @xdc-ai/dashboard build >/dev/null || die "Build failed — run 'pnpm check' to see why"

if [ "${1:-}" != "--no-restart" ]; then
  if [ "$(uname)" = "Darwin" ] && launchctl list 2>/dev/null | grep -q tech.xdcai.agent; then
    say "Restarting launchd service"; launchctl kickstart -k "gui/$(id -u)/tech.xdcai.agent" || true
  elif command -v systemctl >/dev/null && systemctl is-active --quiet xdc-ai-agent 2>/dev/null; then
    say "Restarting systemd service"; sudo systemctl restart xdc-ai-agent
  else
    say "No service manager detected; restart your dev processes to pick up the update"
  fi
fi
say "Done. Your workspace/, data/ and .env were not touched."
