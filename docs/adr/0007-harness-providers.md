# 0007 — Coding-agent CLIs as model providers ("harness" providers)

Status: accepted · 2026-09-01

## Context

The maintainer wants to run the agent on a personal Claude Code (Pro/Max) or ChatGPT (Codex) subscription rather than an API key. Community AI SDK v7 providers exist for both (`ai-sdk-provider-claude-code`, `ai-sdk-provider-codex-cli`); Mastra accepts AI SDK `LanguageModelV4` instances directly.

## Decision

`@xdc-ai/models` treats `claude-code` and `codex` as keyless _harness_ providers: `MODEL_CHAT=claude-code/sonnet` lazily imports the optional provider package and hands Mastra the resulting model instance. Everything else stays a router string. The wizard offers them as choices and checks the CLI is on PATH.

## Consequences

- Verified 2026-09-01: `claude-code/sonnet` answered through Mastra in ~6 s with the `claude.ai` login and no API key.
- The provider packages are optional dependencies; a missing package produces an actionable error.
- Terms: this is for personal use of one's own subscription on one's own machine. The README says so; companies are pointed to API keys or gateways. The kit never bundles or proxies subscription credentials.
