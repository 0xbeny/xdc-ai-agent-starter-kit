# Getting started

Ten minutes from clone to a working agent you can talk to, that can pay for tools on XDC, and that
asks you before it spends or sends anything.

## 0. What you need

- **Node 22.18+** (`nvm install 22`) and **pnpm 10** (`corepack enable`)
- **Docker** (for Postgres + Redis) — or skip it and pick SQLite in setup
- One of:
  - an API key for any provider (Anthropic, OpenAI, xAI/Grok, Moonshot/Kimi, Google, OpenRouter, Groq, DeepSeek…), **or**
  - a local model via Ollama / vLLM / LM Studio, **or**
  - a **Claude Code** or **Codex CLI** login (uses your own subscription; personal use)
- An email address for the XDC AI wallet (created for you at login; fund it with USDC on XDC mainnet when you want paid tools)

## 1. Install

```bash
git clone https://github.com/0xbeny/xdc-ai-agent-starter-kit
cd xdc-ai-agent-starter-kit
pnpm install
```

## 2. Set up (interactive)

```bash
pnpm setup
```

The wizard asks, in order:

1. **Chat model** — provider → model id → API key (skipped for keyless providers). It sends one test
   message so you know it works before anything is written.
2. **Fast model** (optional) — a cheap model for summaries and background memory work.
3. **Storage** — Postgres from `docker compose` (recommended) or a local SQLite file.
4. **XDC AI wallet** — shows a code and opens `xdcai.tech`; approve the device there. This links a
   Safe smart wallet to the agent (non-custodial, gas sponsored, USDC settled).
5. **Payment policy** — auto-approve threshold, per-call max, daily cap (defaults 0.05 / 1 / 2 USDC).
6. **Connectors & channels** — Slack, Google Workspace, Notion, GitHub, Telegram (OAuth happens later in
   the dashboard).

It writes `.env` (git-ignored) and can be re-run any time. `pnpm login` repeats only the wallet step.

## 3. Run

```bash
pnpm db:up            # Postgres 17 + pgvector, Redis (skip if you chose SQLite)
pnpm dev              # agent API + Mastra Studio → http://localhost:4111
pnpm dev:dashboard    # human dashboard          → http://localhost:3000
```

Open **http://localhost:3000**. The first conversation runs `workspace/BOOTSTRAP.md`: the agent
introduces itself, asks who you are and what you want it to be, writes `IDENTITY.md` and `USER.md`,
and deletes the bootstrap file.

## 4. Use it

**Delegate in chat.** "Watch XDC gas and tell me when it drops below 0.3 gwei." "Screen this address
before we onboard them." "Summarise what changed in the masternode set this week." The agent finds
paid tools in the xdcai marketplace by capability, pays per call from its wallet, and cites results.

**Approve what matters.** Calls priced at or above your threshold, every transfer and DeFi action,
every _write_ to a connected tool, and every _send_ (email, Slack message, calendar invite) stop in
**Approvals** with the exact arguments. Approve once → the agent runs that exact call once. Deny → it
tells you why it wanted to.

**Shape the agent.** **Memory** shows the files that _are_ the agent: `SOUL.md` (identity, injected
first), `AGENTS.md` (procedures), `USER.md` (you), `MEMORY.md` (facts it curated). Edit any of them;
the next turn uses the new text.

**Connect your tools.** **Connections** → Connect Slack / Notion / GitHub (works out of the box) or
Google Workspace (needs your own Google OAuth client: set `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` in `.env`, redirect URI `http://localhost:4111/kit/connectors/<id>/callback`).
Reads are automatic; writes and sends go through Approvals.

**Watch the money.** **Wallet** shows balances, the ledger (every attempt, with tx links to xdcscan),
today's spend against the cap, and a searchable marketplace of 100+ pay-per-call APIs.

## 4b. Talk to it from Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and put the token in `.env` as `TELEGRAM_BOT_TOKEN`.
2. `pnpm gateway` — the log prints a 6-digit **pairing code**.
3. In Telegram, open your bot and send `/pair 123456`. The first person to pair becomes admin.
4. Delegate tasks by message. Admins receive every approval request with **Approve / Deny** buttons
   and can list them with `/approvals`. Decisions made in Telegram and in the dashboard are the same
   record.

Access is default-deny; `/whoami` shows your id, `TELEGRAM_ADMIN_IDS` / `TELEGRAM_USER_IDS` pre-allow ids.

## 4c. Skills, sandbox, routines and delegation

**Skills.** 58 bundled skills (vendored from Hermes Agent, MIT — `docx`, `pdf`, `xlsx`, `powerpoint`,
research, devops, email, note-taking, social media, …) live in `workspace/skills/<category>/<name>/SKILL.md`.
The agent lists them on demand and reads one when a task matches; their scripts run in the sandbox. Add your
own the same way; `pnpm update:kit` delivers new bundled skills without touching yours. The installer offers
the Python libraries the document skills use (`python-docx pypdf pdfplumber openpyxl python-pptx reportlab`).

**Sandbox.** `SANDBOX=local` (default) gives the agent `run_command`: commands run in an isolated scratch
directory under `data/sandbox` with the strongest native isolation on the host — **Seatbelt on macOS,
Bubblewrap on Linux** — no network unless `SANDBOX_ALLOW_NETWORK=1`, and a deny list for destructive or
exfiltrating commands (`sudo`, `rm -rf /`, `curl | sh`, force-push, reverse shells…). Set `SANDBOX=off` to
remove the tool entirely.

**Routines** (cron, Hermes-style). Dashboard → Routines: a cron expression + a prompt the assistant runs on
schedule (pause / resume / run now / delete). Results are logged, shown on the page and pushed to Telegram
admins. Anything a routine tries to pay or send still stops in Approvals.

**Delegation.** The assistant can hand work to two sub-agents: `researcher` (read-only tools, may run in the
background while you keep chatting) and `treasurer` (wallet and marketplace work under the same payment
policy and the same approvals inbox). Ask for "research X in the background" or "have the treasurer price
this" — or let the assistant decide.

## 4d. Secrets

Secrets live only in `.env` and `data/` (both git-ignored; token files are written `0600`), are entered
through masked prompts in `pnpm setup`, never appear in the dashboard, and every known secret value is
masked in the agent's logs. If you keep keys in a vault, reference them instead of pasting them:

```
ANTHROPIC_API_KEY=op://Private/Anthropic/credential   # 1Password CLI (`op`)
OPENAI_API_KEY=bws://5b3f…                             # Bitwarden Secrets Manager CLI (`bws`)
SECRETS_COMMAND=my-vault export                        # any CLI printing KEY=VALUE lines; fills empty keys
```

`.env` always wins over the helper unless `SECRETS_OVERRIDE=1`. `gitleaks` runs in CI.

## 5. Change the model later

Edit `.env` and restart, or re-run `pnpm setup`:

```
MODEL_CHAT=claude-code/sonnet                       # your Claude subscription via the local CLI
MODEL_CHAT=xai/grok-4.3                             # + XAI_API_KEY
MODEL_CHAT=moonshot/kimi-k2.7                       # + MOONSHOT_API_KEY
MODEL_CHAT=openrouter/deepseek/deepseek-v4          # + OPENROUTER_API_KEY
MODEL_CHAT=ollama/qwen3:8b                          # local, no key
MODEL_CHAT=custom/qwen3-32b@http://gpu-box:8000/v1  # any OpenAI-compatible server
```

## 6. Run it on a Mac mini or a server

One-line install on a fresh machine (installs Node 22 + pnpm if missing, clones, runs setup):

```bash
curl -fsSL https://raw.githubusercontent.com/0xbeny/xdc-ai-agent-starter-kit/main/scripts/install.sh | bash
```

**Mac mini / any always-on machine, no Docker.** Choose SQLite in setup (or point `DATABASE_URL` at any
Postgres). `scripts/serve.sh` builds once and runs agent + dashboard + Telegram gateway as plain Node
processes; the installer offers to register it with `launchd` so it starts at login and restarts itself:

```bash
bash scripts/serve.sh                      # foreground
# or as a login service:
sed "s|__REPO__|$PWD|g" deploy/launchd/tech.xdcai.agent.plist > ~/Library/LaunchAgents/tech.xdcai.agent.plist
launchctl load -w ~/Library/LaunchAgents/tech.xdcai.agent.plist
```

Linux without Docker: `deploy/systemd/xdc-ai-agent-native.service`.

**Servers with Docker** (agent + dashboard + Postgres + Redis, optional Telegram gateway and Ollama):

```bash
cp .env.example .env   # set MODEL_CHAT + key, POSTGRES_PASSWORD, KIT_API_TOKEN, DASHBOARD_PASSWORD, DASHBOARD_URL, AGENT_URL
docker compose -f deploy/compose/docker-compose.prod.yml --env-file .env --profile telegram up -d --build
```

- **Linux server**: `deploy/systemd/xdc-ai-agent.service` wraps the compose stack.
- **Coolify / Dokploy**: point them at `deploy/compose/docker-compose.prod.yml` — see `deploy/coolify/README.md`.
- **Cloud**: agent on Fly.io (`deploy/fly`), dashboard on Vercel (`deploy/vercel`).

Everything the agent is lives in three paths — `workspace/`, `data/` (the `agent-data` volume), and the
database — so backup and migration are a copy.

## 7. Update the kit without touching your agent

```bash
pnpm update:kit        # fast-forwards from the original repo, reinstalls, rebuilds, restarts the service
```

Your agent's identity and state are never tracked by git — `workspace/` (SOUL.md, memory, skills), `data/`
(wallet tokens, ledger, approvals, connector tokens), `.env` and the database — so an update can only change
kit code. New template files (e.g. a new default skill) are added if missing; anything you edited is left
alone. The update refuses to run if you modified kit files yourself (commit or stash first), and it never
force-pulls.

## Security defaults worth knowing

- Money is policy-checked _before_ any paid call; caps are enforced locally in code, not by the model.
- A repeat of an already-paid request is refused with the earlier tx hash.
- Content read from email, docs, channels and paid APIs is treated as data; it can never trigger a
  send or a payment without a human decision.
- Secrets live only in `.env` and `data/` (both git-ignored); `gitleaks` runs in CI.
- XDC **mainnet only** — there is no test mode; start with small caps.
