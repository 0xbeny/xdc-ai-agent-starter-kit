# 0008 — Approval protocol lives in the kit, not in the UI framework

Status: accepted · 2026-09-01

## Context

Mastra offers per-tool `requireApproval` that suspends a run until `approveToolCall()` is called. That works inside one UI session but gives no inbox, no Telegram path, and no audit of what was approved. The maintainer wants approvals visible in a dashboard and later on phones.

## Decision

Approvals are a first-class store (`JsonlApprovalStore`, later Postgres). A tool that needs a human returns `approval_required` with an `approvalId`; the human decides in the dashboard (or any other channel); the agent re-calls the same tool with the same arguments plus `approvalId`. An approval is single-use, bound to the exact arguments, and expires after 24 h. The same gate serves money tools (`@xdc-ai/xdcai`) and connector write/send tools (`@xdc-ai/connectors`).

## Consequences

- Works with any chat UI, CLI or channel; the Approvals page is a plain list.
- The agent must ask and wait — its instructions say so; the dashboard shows pending approvals inside the chat view.
- Trade-off: an approved action runs on the agent's next call rather than instantly on click.
