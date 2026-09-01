# 0011 — Sandboxed execution and delegated sub-tasks

Status: accepted · 2026-09-01 (implemented: LocalSandbox `run_command` with Seatbelt/bwrap + command deny list; `researcher`/`treasurer` sub-agents with background tasks; routines via `mastra.schedules` with run log delivered to Telegram/dashboard)

## Context

The maintainer asked whether the agent can multiply tasks (parallel / background / delegated work) and whether tool execution is isolated. Today: many concurrent conversations, parallel tool calls within a turn, no sub-agents, no cron, and deliberately **no shell or code-execution tool**.

## Decision (to implement next)

- **Sandbox**: expose opt-in `run_code` / `shell` tools through Mastra `Workspace` + `Sandbox`. Defaults by host: `LocalSandbox` with native isolation (Seatbelt on macOS — Docker-free Mac mini; Bubblewrap on Linux), Docker where present, E2B/Cloudflare Sandbox in cloud. Per-run scratch filesystem, separate from `workspace/`; egress allowlist; destructive or network-writing commands go through the approval gate. Off unless enabled in setup.
- **Sub-agents**: a supervisor pattern — the assistant delegates to specialised agents (research, treasury, ops) exposed as tools, each with its own instructions but the _same_ payment policy and approval store. Background runs surface in the dashboard's Runs view; results post back into the originating thread.
- **Routines**: cron-style schedules ("every morning at 8 summarise…") stored with Mastra schedules, delivered to the dashboard/Telegram.

## Consequences

- Isolation is a property of the sandbox provider; the kit picks the strongest available for the host and says which in Settings.
- Every multiplied task remains bounded by one wallet policy and one approvals inbox.
