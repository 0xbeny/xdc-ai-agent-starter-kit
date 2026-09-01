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

Same repo. Today: run `pnpm db:up`, `pnpm dev` and `pnpm dev:dashboard` under `tmux`/`launchd`, set
`DASHBOARD_PASSWORD` and `KIT_API_TOKEN` in `.env`, and put the dashboard behind your reverse proxy.
Coming next (Phase 4): production images in `deploy/compose`, `launchd`/`systemd` units, a one-line
installer, Coolify/Dokploy templates, Vercel + Fly recipes. Everything the agent is lives in three
paths — `workspace/`, `data/`, and the database — so backup and migration are a copy.

## Security defaults worth knowing

- Money is policy-checked _before_ any paid call; caps are enforced locally in code, not by the model.
- A repeat of an already-paid request is refused with the earlier tx hash.
- Content read from email, docs, channels and paid APIs is treated as data; it can never trigger a
  send or a payment without a human decision.
- Secrets live only in `.env` and `data/` (both git-ignored); `gitleaks` runs in CI.
- XDC **mainnet only** — there is no test mode; start with small caps.
