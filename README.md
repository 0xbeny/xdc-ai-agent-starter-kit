# xdc-ai-agent-starter-kit

An open-source, TypeScript-first agent template for people and companies who want to run their own
agentic system with sane defaults: a soul/identity workspace, layered memory, hybrid + graph knowledge,
durable workflows with human approvals, any LLM behind one config line, first-party connectors to
Slack and Google Workspace, a human dashboard with chat — and [xdcai.tech](https://xdcai.tech) wired in
as the default wallet and pay-per-call tool marketplace on XDC.

> Status: Phase 1 (agent core + xdcai default). See `docs/adr/` for decisions.

## Quick start

```bash
pnpm install
pnpm setup                    # interactive: pick a model provider, test it, connect your XDC AI wallet, set spend caps
pnpm db:up                    # Postgres 17 + pgvector, Redis — optional; with SQLite chosen in setup nothing else is needed
pnpm dev                      # Mastra dev server + Studio at http://localhost:4111
```

`pnpm setup` writes `.env` (git-ignored) and can be re-run any time; `pnpm login` repeats only the wallet step.

### Any model, one line

The agent never imports a vendor SDK. `MODEL_CHAT` is a `provider/model` string resolved through the AI SDK
provider layer and Mastra's model router; `MODEL_FAST` (summaries, background memory work) and `MODEL_EMBED`
are optional separate slots.

```
MODEL_CHAT=anthropic/claude-sonnet-4-6            # ANTHROPIC_API_KEY
MODEL_CHAT=openai/gpt-5.6                         # OPENAI_API_KEY
MODEL_CHAT=xai/grok-4.3                           # XAI_API_KEY
MODEL_CHAT=moonshot/kimi-k2.7                     # MOONSHOT_API_KEY (OpenAI-compatible endpoint)
MODEL_CHAT=google/gemini-2.5-pro                  # GOOGLE_GENERATIVE_AI_API_KEY
MODEL_CHAT=openrouter/deepseek/deepseek-v4        # OPENROUTER_API_KEY — one key, thousands of models
MODEL_CHAT=ollama/qwen3:8b                        # local, no key
MODEL_CHAT=custom/qwen3-32b@http://gpu-box:8000/v1 # any OpenAI-compatible server (vLLM, LM Studio, LiteLLM)
```

### Use your coding-agent subscription instead of an API key

```
MODEL_CHAT=claude-code/sonnet     # routes through the locally installed `claude` CLI and its login
MODEL_CHAT=codex/gpt-5.5          # routes through the `codex` CLI login
```

These "harness" providers load optional packages (`ai-sdk-provider-claude-code`, `ai-sdk-provider-codex-cli`)
and need the CLI installed and logged in (`claude auth login`, `codex login`). They are meant for personal use
of your own subscription on your own machine; Anthropic's and OpenAI's consumer terms govern that use, and
companies should run on API keys or a gateway.

### Payments are policy-checked before they happen

xdcai's wallet and marketplace tools arrive over MCP with OAuth (device-code login in `pnpm setup`). Every
money tool is wrapped: calls priced below `PAY_AUTO_APPROVE_BELOW_USDC` run on their own; anything at or above
it, every transfer and every DeFi action pauses for human approval; anything above `PAY_PER_CALL_MAX_USDC` or
the `PAY_DAILY_CAP_USDC` is refused; a repeat of an already-paid request is refused with the earlier tx hash.
An append-only ledger (`data/ledger.jsonl`) records every attempt. XDC mainnet only — there is no test mode.

### The agent is a folder

`workspace/` holds `SOUL.md` (identity, injected first), `IDENTITY.md`, `USER.md`, `AGENTS.md` (procedures),
`MEMORY.md` (curated facts the agent edits only through its `memory` tool, size-capped), `memory/YYYY-MM-DD.md`
daily logs and `skills/`. Each file has a character budget so nothing can crowd out the identity.

## Layout

```
apps/agent          Mastra server: the assistant, memory, tools
apps/cli            `pnpm setup` / `pnpm login` wizard
packages/models     provider-agnostic model slots (chat / fast / embed), harness providers
packages/workspace  SOUL/IDENTITY/USER/AGENTS/MEMORY loader with budgets, memory tool, skills
packages/xdcai      XDC chain constants, OAuth + device login, payment policy, ledger, guarded MCP tools
packages/config     shared tsconfig / lint presets
workspace/          the agent itself
deploy/compose      Postgres + pgvector + Redis
docs/adr            architecture decisions
```

## Development

```bash
pnpm check        # format, lint, typecheck, test
```

Conventional commits on feature branches; never commit secrets (`.env` is ignored, gitleaks runs in CI).

## License

MIT
