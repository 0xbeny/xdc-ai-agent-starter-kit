# Contributing to xdc-ai-agent-starter-kit

Thanks for your interest! This project is MIT-licensed and developed in the open. The maintainer
([@0xbeny](https://github.com/0xbeny)) actively builds on `main`, and community work happens through
GitHub issues and pull requests — this guide explains how the two coexist smoothly.

## Ways to contribute

- **Report a bug** — open an issue with the bug template. Include your OS, Node version, and the
  command that failed.
- **Propose a feature** — open an issue with the feature template *before* writing code, so we can
  agree on the approach. Significant design changes get an ADR (see below).
- **Fix or build something** — pick an issue labeled `good first issue` or `help wanted`, comment
  that you're taking it, then send a PR.
- **Improve docs** — typo fixes and doc PRs are always welcome, no issue needed.

## Development setup

```bash
# Node version comes from .node-version (use nvm, fnm, or mise)
nvm install && nvm use

corepack enable                  # provides the pinned pnpm from package.json
pnpm install
pnpm setup                       # interactive: model provider, wallet, spend caps
pnpm dev                         # Mastra dev server + Studio at http://localhost:4111
```

`pnpm db:up` starts Postgres + pgvector and Redis via Docker if you didn't choose SQLite in setup.
Full walkthrough: [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

### Repository layout

- `apps/agent` — the Mastra agent runtime
- `apps/dashboard` — the human dashboard (CopilotKit)
- `apps/cli` — the `xdc-agent` CLI (setup wizard, chat, login)
- `packages/*` — shared config, connectors, gateway, models, secrets, workspace, xdcai
- `docs/adr/` — architecture decision records; read these before proposing design changes
- `deploy/` — compose, systemd/launchd, fly, vercel, coolify deployment configs

## Before you push

Run the full check locally — it's exactly what CI runs on your PR:

```bash
pnpm check    # ignored-files check, prettier, eslint, typecheck, vitest
```

Or individually: `pnpm format` (write mode), `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Pull requests

1. **Fork** the repo and create a branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Keep each PR to **one concern** — small PRs get reviewed fast, mixed ones stall.
3. Follow **Conventional Commits** for commit messages and the PR title, with a scope where it
   helps: `feat(cli): ...`, `fix(gateway): ...`, `docs(adr): ...`, `chore(deps): ...`.
4. Add or update **tests** for behavior changes (vitest, colocated with the code).
5. Make sure **CI is green**. Every PR runs the full `pnpm check` suite plus a
   [gitleaks](https://github.com/gitleaks/gitleaks) secrets scan — never commit `.env`, keys, or
   tokens, even in fixtures.
6. Link the issue your PR addresses (`Closes #123`).

Because the maintainer also develops directly on `main`, rebase your branch if it falls behind —
`git fetch origin && git rebase origin/main` — rather than merging `main` into your branch.

### Design changes need an ADR

Anything that changes architecture — a new runtime dependency, a storage format, a protocol, a
security boundary — should start as an issue and, once agreed, land with a new numbered ADR in
[docs/adr/](docs/adr/) following the existing format. Small features and fixes don't need one.

## Issues

- Use the **bug** or **feature** template; blank issues are fine for questions.
- Issues labeled `triage` haven't been reviewed yet; `confirmed` means reproduced/accepted;
  `good first issue` and `help wanted` are up for grabs.
- Security problems must **not** be filed as public issues — see below.

## Releases

Releases are cut from `main` by tagging:

- Versions follow **semver** with a `v` prefix: `v0.1.0`, `v0.2.0`, `v0.2.1`.
- Pushing a `v*` tag triggers the release workflow, which creates a **GitHub Release** with
  auto-generated notes from the merged PRs since the previous tag — one more reason PR titles
  follow Conventional Commits.
- While the project is `0.x`, minor versions may contain breaking changes; they're called out in
  the release notes.

Maintainer flow:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Reporting security issues

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/0xbeny/xdc-ai-agent-starter-kit/security/advisories/new)
— not in public issues. This project moves real money through wallet tooling, so responsible
disclosure matters here more than most.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
