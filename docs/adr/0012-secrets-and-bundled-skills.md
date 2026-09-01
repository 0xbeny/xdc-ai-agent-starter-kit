# 0012 — Secrets hydration and bundled skills

Status: accepted · 2026-09-01

## Secrets

Following Hermes' model without making a vault a prerequisite: `.env` may hold references (`op://…` → 1Password CLI, `bws://…` → Bitwarden Secrets Manager CLI) or a `SECRETS_COMMAND` whose `KEY=VALUE` output fills empty keys (`.env` wins unless `SECRETS_OVERRIDE=1`). Resolution happens once at boot (`@xdc-ai/secrets`); every known secret value is masked in console output. Token files under `data/` are written `0600`. The dashboard never renders secret values.

## Bundled skills

Hermes Agent's bundled skills (MIT, 58 `SKILL.md`) are vendored into `templates/workspace/skills/` by `scripts/import-hermes-skills.sh` with attribution and per-skill LICENSE files, excluded from our lint/format. They rely on the sandboxed `run_command`, so `SANDBOX=local` is the default. `pnpm update:kit` syncs new skills per `skills/<category>/<name>` directory and never overwrites a skill the user edited.
