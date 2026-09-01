# 0007 — Coding-agent CLIs as model providers ("harness" providers)

Status: accepted · 2026-09-01

## Context

The maintainer wants to run the agent on a personal Claude Code (Pro/Max) or ChatGPT (Codex) subscription rather than an API key. Community AI SDK v7 providers exist for both (`ai-sdk-provider-claude-code`, `ai-sdk-provider-codex-cli`); Mastra accepts AI SDK `LanguageModelV4` instances directly.

## Decision

`@xdc-ai/models` treats `claude-code` and `codex` as keyless _harness_ providers: `MODEL_CHAT=claude-code/sonnet` lazily imports the optional provider package and hands Mastra the resulting model instance. Everything else stays a router string. The wizard offers them as choices and checks the CLI is on PATH.

## Tools under a harness (added 2026-09-01)

Coding-CLI harnesses run their own tool loop and ignore per-call AI SDK tools. The kit therefore **bridges the agent's tools into the harness**: for `claude-code` the tool map is exposed as an in-process MCP server (`createAiSdkMcpServer`, server name `kit`) and allow-listed as `mcp__kit__<tool>`; the model is rebuilt whenever the tool set changes (e.g. after wallet login). Only Zod-object input schemas cross the bridge. The harness runs with `settingSources: []` and `cwd` = the kit's data dir, so it never inherits the human's own Claude Code settings, MCP servers or skills (observed before this fix: the subprocess could see the user's claude.ai connectors). Sub-agents (`agent-researcher`, `agent-treasurer`) are Mastra-internal and are not available under a harness. `codex` has no bridge yet and is chat-only.

## Consequences

- Verified 2026-09-01: `claude-code/sonnet` answered through Mastra in ~6 s with the `claude.ai` login and no API key.
- The provider packages are optional dependencies; a missing package produces an actionable error.
- Terms: this is for personal use of one's own subscription on one's own machine. The README says so; companies are pointed to API keys or gateways. The kit never bundles or proxies subscription credentials.
