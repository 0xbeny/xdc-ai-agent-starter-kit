# 0001 — Agent runtime: Mastra

Status: accepted · 2026-09-01

## Context

The kit must be TypeScript-first, self-hostable, and offer memory, RAG, durable/branching workflows with human-in-the-loop, and MCP client + server. Candidates: Mastra, LangGraph.js, Vercel AI SDK alone, OpenAI Agents SDK, Google ADK (TS), Claude Agent SDK.

## Decision

Mastra 1.x (`@mastra/core`, Apache-2.0; `ee/` directories excluded) is the runtime. The Vercel AI SDK is used underneath as the provider layer.

## Consequences

- Memory (working / semantic / observational), `@mastra/rag`, `suspend()/resume()` workflows and `@mastra/mcp` come from one framework.
- Node ≥ 22.13 required. Versions are pinned exactly; a weekly dependency PR runs the full test suite.
- LangGraph.js remains the documented alternative; its JS long-term store lacks a Postgres implementation and its server is Elastic-licensed with Enterprise-only self-hosting.
