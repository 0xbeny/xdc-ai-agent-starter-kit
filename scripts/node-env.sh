#!/usr/bin/env bash
# Sourced by serve.sh and update.sh: put a usable node + pnpm on PATH without assuming a login shell.
# Accept the pinned version first, else anything the toolchain supports (^22.18 || >=24.11).
REQ=$(tr -d '[:space:]' < .node-version)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

node_ok() {
  v="${1#v}"
  maj=${v%%.*}; rest=${v#*.}; min=${rest%%.*}
  case "$maj" in ''|*[!0-9]*) return 1;; esac
  case "$min" in ''|*[!0-9]*) return 1;; esac
  if [ "$maj" -eq 22 ] && [ "$min" -ge 18 ]; then return 0; fi
  if [ "$maj" -eq 24 ] && [ "$min" -ge 11 ]; then return 0; fi
  if [ "$maj" -ge 25 ]; then return 0; fi
  return 1
}

# 1) nvm shell function (may not work under launchd)  2) pinned dir  3) newest acceptable nvm install  4) node already on PATH
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use "$REQ" >/dev/null 2>&1 || true
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null)" != "v$REQ" ]; then
  if [ -x "$NVM_DIR/versions/node/v$REQ/bin/node" ]; then
    PATH="$NVM_DIR/versions/node/v$REQ/bin:$PATH"
  else
    best=""
    for d in "$NVM_DIR"/versions/node/v*/bin; do
      [ -x "$d/node" ] || continue
      ver=${d%/bin}; ver=${ver##*/v}
      if node_ok "$ver"; then best=$(printf '%s\n%s\n' "$best" "$ver" | grep -v '^$' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1); fi
    done
    [ -n "$best" ] && PATH="$NVM_DIR/versions/node/v$best/bin:$PATH"
  fi
fi
PATH="$HOME/.local/share/pnpm:$PATH"
export PATH

if command -v node >/dev/null 2>&1 && ! node_ok "$(node -v)"; then
  echo "✗ node $(node -v) on PATH is outside the supported range (22.18+ or >=24.11) and no usable install was found under $NVM_DIR." >&2
  echo "  Re-run the installer: curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash" >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { echo "✗ no node found (PATH or $NVM_DIR/versions/node). Re-run the installer: curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash" >&2; exit 1; }

# pnpm is installed per node version (corepack/npm -g), so a fallback node may lack it — corepack can fix that.
command -v pnpm >/dev/null 2>&1 || corepack enable pnpm >/dev/null 2>&1 || true
command -v pnpm >/dev/null 2>&1 || { echo "✗ pnpm not found for node $(node -v). Re-run the installer (it sets pnpm up via corepack or npm)." >&2; exit 1; }
[ "$(node -v)" = "v$REQ" ] || echo "▸ using node $(node -v) (pinned v$REQ not installed — still in the supported range)"
