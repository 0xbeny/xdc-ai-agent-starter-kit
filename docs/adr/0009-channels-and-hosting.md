# 0009 — Channels and hosting shape

Status: accepted · 2026-09-01

## Decisions

- **Telegram first** (`@xdc-ai/gateway`, grammY, MIT): default-deny access with env allowlists and a single-use pairing code (Hermes model); one memory thread per chat; admins receive approval requests with inline Approve/Deny and can `/approvals`. The gateway is a separate process sharing the agent's data dir, so approvals are one record across dashboard and Telegram. Discord and others follow the same `AgentLike` seam.
- **Compose is the production unit**: `deploy/compose/docker-compose.prod.yml` runs Postgres, Redis, agent, dashboard, optional `telegram` and `ollama` profiles from two Dockerfiles. launchd (Mac mini) and systemd (Linux) units wrap it; Coolify/Dokploy consume it directly; Fly (agent) + Vercel (dashboard) are the cloud recipe.
- **Installer**: `scripts/install.sh` installs Node 22/pnpm if missing, clones, installs, runs `pnpm setup`.

## Consequences

- A hosted offering later runs the same two images per customer with their own volumes and database.
- Cron routines and the agent's own MCP server are still to come.
