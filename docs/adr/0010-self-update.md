# 0010 — Self-update that cannot touch user data

Status: accepted · 2026-09-01

## Context

The maintainer wants installed agents to update themselves from the original repository without risking the user's agent (identity files, memory, wallet tokens, ledger, approvals, settings).

## Decision

- Everything user-specific lives outside git: `workspace/` (seeded from tracked `templates/workspace/` on first run), `data/`, `.env`, and the database. All are git-ignored.
- `scripts/update.sh` (`pnpm update:kit`): refuses if tracked files are locally modified, `git pull --ff-only` from `origin/main`, `pnpm install --frozen-lockfile`, adds _missing_ template files only, rebuilds, restarts the launchd/systemd service if present.
- The agent seeds its workspace on boot (`ensureWorkspace`), so a fresh clone, a Docker volume or an update all converge without overwriting.

## Consequences

- Users can edit SOUL.md freely and still update forever.
- Schema migrations for `data/` files (JSONL) must stay backward compatible or ship a migration in the update script.
- A dashboard "update available" indicator and a scheduled update check are follow-ups.
