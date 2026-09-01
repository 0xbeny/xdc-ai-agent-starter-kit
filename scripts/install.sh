#!/usr/bin/env bash
# One-line installer:  curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash
# Installs prerequisites it can (nvm/node 22, pnpm), clones the kit into ~/xdc-ai-agent-starter-kit, runs setup.
set -euo pipefail
REPO_URL=${REPO_URL:-https://github.com/0xbeny/xdc-ai-agent-starter-kit}
DIR=${XDC_AGENT_DIR:-$HOME/xdc-ai-agent-starter-kit}
NODE_MAJOR=22

say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

say "Checking prerequisites: git (required) · Node/pnpm (installed for you if missing) · Docker, Python 3 (optional)"

ensure_node() { # pins Node to the version the kit is tested with (.node-version); Mastra's deps reject 24.1–24.10 and <22.22
  local want="$1"
  if command -v node >/dev/null && [ "$(node -v)" = "v$want" ]; then say "Node v$want"; return; fi
  say "Installing Node $want via nvm"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash >/dev/null
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$want" >/dev/null
  nvm use "$want" >/dev/null
  say "Node $(node -v)"
}
command -v git >/dev/null || die "git is required (macOS: xcode-select --install)"

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"; git -C "$DIR" pull --ff-only
else
  say "Cloning into $DIR"; git clone --depth 1 "$REPO_URL" "$DIR"
fi
cd "$DIR"
ensure_node "$(tr -d '[:space:]' < .node-version)"
ensure_pnpm() { # corepack when available (bundled with nvm/official Node), otherwise a global npm install; never assume it exists
  local want; want=$(node -p "require('./package.json').packageManager") # e.g. pnpm@10.18.2
  if command -v pnpm >/dev/null && [ "pnpm@$(pnpm -v)" = "$want" ]; then say "$want"; return; fi
  if command -v corepack >/dev/null; then
    say "Enabling $want via corepack"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "$want" --activate >/dev/null 2>&1 || true
    hash -r
  fi
  if ! command -v pnpm >/dev/null; then
    say "Installing $want with npm"
    npm install -g "$want" >/dev/null 2>&1 || die "Could not install pnpm. Install it manually (https://pnpm.io/installation) and re-run."
    hash -r
  fi
  command -v pnpm >/dev/null || die "pnpm is still not on PATH. Open a new terminal (or run: export PATH=\"\$HOME/.local/share/pnpm:\$PATH\") and re-run."
  say "pnpm $(pnpm -v)"
}
ensure_pnpm
say "Installing dependencies"; pnpm install --frozen-lockfile

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  say "Docker detected — Postgres + Redis are available in setup (optional)"
else
  say "No Docker — that's fine: choose SQLite in setup; nothing else is required"
fi

# `curl | bash` leaves stdin as the pipe; a real terminal is still reachable through /dev/tty (this is what Hermes does too)
INTERACTIVE=0
if [ -t 1 ] && { : </dev/tty; } 2>/dev/null; then INTERACTIVE=1; fi

install_shim() { # `xdc-agent` on PATH → chat / setup / login / serve / update
  local bin="$HOME/.local/bin"; mkdir -p "$bin"
  cat > "$bin/xdc-agent" <<EOS
#!/usr/bin/env bash
export NVM_DIR="\${NVM_DIR:-\$HOME/.nvm}"; [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh" && nvm use "\$(tr -d '[:space:]' < "$DIR/.node-version")" >/dev/null 2>&1
export PATH="\$HOME/.local/share/pnpm:\$PATH"
cd "$DIR" && exec pnpm --silent exec tsx apps/cli/src/bin.ts "\$@"
EOS
  chmod +x "$bin/xdc-agent"
  # Put ~/.local/bin on PATH for every shell flavour: zsh login (SSH) reads .zprofile, interactive reads .zshrc;
  # bash reads .bash_profile / .bashrc. Files are created if missing (fresh machines often have none).
  local line='export PATH="$HOME/.local/bin:$PATH"'
  local rcs="$HOME/.zprofile $HOME/.zshrc $HOME/.bash_profile $HOME/.bashrc"
  for rc in $rcs; do
    [ -f "$rc" ] || touch "$rc"
    grep -qF '.local/bin' "$rc" || printf '\n# xdc-ai-agent-starter-kit\n%s\n' "$line" >> "$rc"
  done
  case ":$PATH:" in *":$bin:"*) ;; *) say "PATH updated in .zprofile/.zshrc/.bash_profile/.bashrc — open a new terminal, or run now:  $line";; esac
  say "Installed the ${bin}/xdc-agent command"
}
install_shim

if [ "$INTERACTIVE" = 1 ]; then
  say "Starting setup"; pnpm setup </dev/tty
else
  say "No terminal attached: run  xdc-agent setup  to configure the agent"
fi

if [ "$INTERACTIVE" = 1 ] && command -v python3 >/dev/null; then
  read -r -p "Install Python libraries used by the bundled document skills (docx, pdf, xlsx, pptx)? [Y/n] " py </dev/tty || py=y
  case "${py:-y}" in n|N) ;; *) python3 -m pip install --quiet --user python-docx pypdf pdfplumber openpyxl python-pptx reportlab 2>/dev/null && say "Python document libraries installed" || say "Could not install Python libraries — the skills will tell you what to install when used";; esac
fi

if [ "$(uname)" = "Darwin" ] && [ "$INTERACTIVE" = 1 ]; then
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
say "Chat now:         xdc-agent        (if not found: export PATH=\"\$HOME/.local/bin:\$PATH\"  or  ~/.local/bin/xdc-agent)"
say "Dashboard:        xdc-agent serve   → http://localhost:3000   (or install the login service: see deploy/launchd)"
