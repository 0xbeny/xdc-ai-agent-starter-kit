# Fly.io (agent) + Vercel (dashboard)

- Agent: `cd deploy/fly && fly launch --copy-config --no-deploy && fly volumes create agent_data --size 1 &&
fly secrets set MODEL_CHAT=… ANTHROPIC_API_KEY=… DATABASE_URL=… KIT_API_TOKEN=… DASHBOARD_URL=https://<vercel-app> AGENT_URL=https://<app>.fly.dev && fly deploy`.
  Use Fly Postgres or Neon for `DATABASE_URL`. Copy `workspace/` into the volume once (`fly ssh sftp`).
- Dashboard: import `apps/dashboard` in Vercel with env `AGENT_URL=https://<app>.fly.dev`, `KIT_API_TOKEN`, `DASHBOARD_PASSWORD`.
  The chat endpoint is proxied server-side, so the browser never talks to Fly directly.
