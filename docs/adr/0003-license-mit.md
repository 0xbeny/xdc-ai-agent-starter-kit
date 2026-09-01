# 0003 — License: MIT

Status: accepted · 2026-09-01

## Decision

The kit is MIT-licensed, matching the `xdcai` CLI, Hermes Agent and OpenClaw.

## Consequences

- Dependencies must be MIT/Apache-2.0/BSD/PostgreSQL-licensed by default. Not defaults: FalkorDB (SSPL), Inngest (SSPL), Open WebUI (branding clause), LangGraph server (ELv2), Phoenix (ELv2). Nango (ELv2) is an optional self-host profile, never bundled.
- CI runs a license check on the dependency tree.
