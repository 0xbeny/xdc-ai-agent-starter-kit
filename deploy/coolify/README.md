# Coolify / Dokploy

Both deploy a `docker-compose.yml` from a Git repo with TLS and an env editor.

1. New resource → Docker Compose → this repo, branch `main`, compose file `deploy/compose/docker-compose.prod.yml`.
2. Set environment: everything from `.env.example` you need — at minimum `MODEL_CHAT` + its key,
   `POSTGRES_PASSWORD`, `KIT_API_TOKEN` (random), `DASHBOARD_PASSWORD`, `DASHBOARD_URL` (your public dashboard
   URL), `AGENT_URL` (public agent URL — needed for connector OAuth callbacks).
3. Expose `dashboard` on your domain (port 3000); expose `agent` (port 4111) only if you want the OAuth
   callback / MCP endpoint reachable, otherwise keep it internal.
4. Volumes: `workspace/` is bind-mounted from the repo checkout; `agent-data` holds tokens, ledger, approvals —
   back it up.
5. First run: open the dashboard, then `docker compose exec agent node ../cli/src/bin.ts login`
   (or run `pnpm login` locally and copy `data/xdcai-auth.json` into the volume) to link the wallet.
