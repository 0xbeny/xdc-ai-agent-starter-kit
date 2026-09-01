# Vercel (dashboard only)

The dashboard is a normal Next.js app: root directory `apps/dashboard`, framework Next.js, env
`AGENT_URL`, `KIT_API_TOKEN`, `DASHBOARD_PASSWORD`. The agent itself needs a long-running host
(compose, Fly, Railway, a Mac mini) — Vercel functions are not suitable for the agent loop.
