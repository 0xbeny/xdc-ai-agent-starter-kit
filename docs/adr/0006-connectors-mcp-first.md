# 0006 — Workplace connectors: MCP-first with per-user OAuth

Status: accepted · 2026-09-01

## Decision

Integrations are remote MCP servers first (Slack `mcp.slack.com`; Google Workspace per-product servers; Notion, GitHub, Linear, Atlassian, HubSpot…), reached through one connector registry with an OAuth 2.1 client (RFC 9728 discovery, PKCE). Long-tail APIs go through an optional self-hosted Nango profile. Hand-written API wrappers are a last resort.

## Consequences

- Each tool carries an approval class: read → automatic, write → approval, send/external → approval with preview.
- Tokens are stored encrypted per user in Postgres and never leave the deployment.
- Google's servers are Developer Preview; the MIT community server is the fallback behind the same interface.
