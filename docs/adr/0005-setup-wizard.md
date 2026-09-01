# 0005 — Interactive setup wizard, Hermes-style

Status: accepted · 2026-09-01

## Context

The kit should not assume a model provider. Hermes Agent's `hermes setup` walks the user through provider, model, keys and integrations and writes the config.

## Decision

`pnpm setup` (and later `npx create-xdc-agent`) runs an interactive wizard (`@clack/prompts`) that:

1. asks which provider to use — OpenAI, Anthropic, xAI (Grok), Moonshot (Kimi), Google, OpenRouter, Ollama/local, or a custom OpenAI-compatible URL — then the model and the API key, and smoke-tests it;
2. optionally sets `fast` and `embed` slots;
3. runs `npx xdcai login` to create/link the smart wallet, then asks for the daily cap and auto-approve threshold;
4. offers connectors (Slack, Google Workspace, Notion, GitHub) and channels (Telegram) to enable now or later;
5. writes `.env` (secrets) and `agent.config.ts` (non-secrets), seeds `workspace/` if empty.
   Re-running is idempotent and shows current values.

## Consequences

- No provider is privileged in code; `MODEL_CHAT` is the only required model setting.
- The wizard is the same code path the dashboard's Settings screen uses, so both stay in sync.
