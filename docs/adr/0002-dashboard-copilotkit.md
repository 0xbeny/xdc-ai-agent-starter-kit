# 0002 — Dashboard: Next.js + CopilotKit over AG-UI

Status: accepted · 2026-09-01

## Context

Two viable paths: own every component (assistant-ui + AI Elements) or adopt CopilotKit (MIT core) for chat, shared state, generative UI and interrupts. The maintainer chose speed.

## Decision

Next.js dashboard using CopilotKit's React components and self-hosted runtime, speaking AG-UI to the Mastra server (`@ag-ui/mastra`). Non-chat screens (runs, approvals, memory, wallet, connections) are ordinary Next.js pages over the kit's REST API.

## Consequences

- Fastest route to a working chat + live tool calls + approvals UI.
- CopilotKit Cloud features are not used; the runtime stays self-hosted.
- If CopilotKit's opinions become limiting, AG-UI keeps the wire format stable so the UI layer can be swapped.
