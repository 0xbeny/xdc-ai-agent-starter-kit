# xdc-ai-agent-starter-kit

An open-source, TypeScript-first agent template for people and companies who want to run their own
agentic system with sane defaults: a soul/identity workspace, layered memory, hybrid + graph knowledge,
durable workflows with human approvals, any LLM behind one config line, first-party connectors to
Slack and Google Workspace, a human dashboard with chat — and [xdcai.tech](https://xdcai.tech) wired in
as the default wallet and pay-per-call tool marketplace on XDC.

> Status: Phase 0 (foundation). See `docs/adr/` for decisions and the plan for what's coming.

## Quick start

```bash
pnpm install
cp .env.example .env          # set MODEL_CHAT and the matching API key (or run `pnpm setup` once it lands)
pnpm db:up                    # Postgres 17 + pgvector, Redis — optional; without DATABASE_URL a local SQLite file is used
pnpm dev                      # Mastra dev server + Studio at http://localhost:4111
```

Pick any model:

```
MODEL_CHAT=anthropic/claude-sonnet-4-6
MODEL_CHAT=openai/gpt-5.6
MODEL_CHAT=xai/grok-4.3
MODEL_CHAT=moonshot/kimi-k2.7
MODEL_CHAT=openrouter/deepseek/deepseek-v4
MODEL_CHAT=ollama/qwen3:8b
MODEL_CHAT=custom/qwen3-32b@http://gpu-box:8000/v1
```

## Layout

```
apps/agent        Mastra server: agents, workflows, tools
packages/models   provider-agnostic model slots (chat / fast / embed)
packages/config   shared tsconfig / lint presets
workspace/        the agent itself: SOUL.md, AGENTS.md, BOOTSTRAP.md, skills/
deploy/compose    Postgres + pgvector + Redis
docs/adr          architecture decisions
```

## Development

```bash
pnpm check        # format, lint, typecheck, test
```

Conventional commits on feature branches; never commit secrets (`.env` is ignored, gitleaks runs in CI).

## License

MIT
