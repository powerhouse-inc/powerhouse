# Contributing to Powerhouse

This repository is the home of the Powerhouse platform — a pnpm workspaces + Nx
monorepo. This guide covers everything a first-time contributor needs: setup,
running the apps, testing, and the commit/PR/release flow.

- **License:** [GNU Affero GPL v3](./LICENSE)
- **Code of conduct:** [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — please read
  it before you start
- **Developer documentation:** https://academy.vetra.io (source: `apps/academy`)

## Repository layout

| Directory | What lives there |
| --- | --- |
| `apps/` | Applications: `connect` (web UI), `switchboard` (API), `academy` (docs site), `switchboard-lb` (load balancer) |
| `clis/` | Command-line tools: `ph-cli`, `ph-cmd` |
| `packages/` | Reusable, published packages (`reactor*`, `shared`, `registry`, `vetra`, `builder-tools`, `analytics-engine/*`, …) |
| `test/` | Integration and e2e test projects (not published) |
| `scripts/` | Utility scripts and helpers (including `new-worktree.sh`) |
| `docs/adr/` | Architecture decision records |
| `docs/superpowers/` | The spec → plan → evidence workflow used for agent-driven work |

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | `>=24` | see `engines.node` |
| pnpm | `latest` (11.x or 12.x) | CI installs `latest` via `pnpm/action-setup` |
| bun | 1.3.x | **Required to build.** The `postbuild` steps of `ph-cli`, `ph-cmd` and `registry` shell out to it, so `pnpm build` cannot finish without it |
| playwright chromium | — | only needed for `packages/reactor-browser` tests (see Testing) |

## Setup

```bash
git clone https://github.com/powerhouse-inc/powerhouse
cd powerhouse
pnpm install
pnpm build
pnpm tsc
```

> `bin` warnings on the first `pnpm install` (`Failed to create bin …
> dist/cli.mjs`) are expected — the targets do not exist until the packages
> are built. They clear after `pnpm build`.

- `pnpm build` builds the curated set of workspace packages in dependency
  order — the same list CI builds.
- `pnpm tsc` (`tsc --build`) produces the `.tsbuild` project-reference outputs
  that dependent packages' type checking and test suites resolve against.
  Without it, most test runs fail to find sibling packages.

`scripts/new-worktree.sh` automates all of the above for isolated git
worktrees: `./scripts/new-worktree.sh <name>` creates a prepared worktree
under `~/.worktrees/powerhouse/` (branch `fix/<name>` from `main` by default).

## Running the apps

```bash
npx nx start @powerhousedao/switchboard   # API (runs the built dist)
npx nx dev   @powerhousedao/switchboard   # API (watch mode)
npx nx dev   @powerhousedao/connect       # web UI (Vite dev server)
```

Or skip local builds entirely and run the full stack from pre-built images
(pulled from the `cr.vetra.io` registry — nothing is built locally):

```bash
docker compose -f docker-compose.dev.yml up -d
# Connect: http://localhost:3000   Switchboard: http://localhost:4000
```

See the README for the other compose files (`test`, `staging`, `pglite`).

## Testing

```bash
pnpm --filter=@powerhousedao/<pkg> test   # a single package
pnpm test                                  # the curated CI set (~20 packages)
pnpm simulate-ci-workflow                  # full local CI: clean, build, typecheck, lint, every test suite
```

Notes:

- `reactor-browser` runs half of its suite in a real chromium. Run
  `pnpm exec playwright install chromium` inside `packages/reactor-browser`
  first; without it most of those test files are skipped.
- E2E suites: `pnpm test:e2e:vetra`, `pnpm test:e2e:package`,
  `pnpm test:e2e:switchboard`, `pnpm test:e2e:recipes`.
- CI runs the test suites related to the changed files (vitest related mode),
  so the fastest local check for a small change is the owning package's
  suite.

## Lint and formatting

```bash
pnpm lint   # eslint across all packages
```

- `lint-staged` runs `eslint --fix` on staged files during `git commit`.
- The root Prettier config (`.prettierrc.json`) defines shared formatting.
- CI lints the changed files of each PR and fails on errors.

## Branches and commits

- Development happens on `main` (npm dist-tag `dev`). Staging and production
  release branches live under `release/` — see [RELEASE.md](./RELEASE.md).
- Branch from `main`. Use `feat/<topic>` for features and `fix/<topic>` for
  fixes.
- Write [Conventional Commits](https://www.conventionalcommits.org/):
  - lowercase subject, max 200 characters
  - scope each commit to the package it touches (`feat(reactor): …`,
    `fix(connect): …`)
  - one logical change per commit — do not mix files from multiple packages
- `husky` runs `commitlint` on every commit; CI re-checks on every push.

## Pull requests

1. Push your branch and open a PR against `main`. Link the related issue —
   use one of the templates in `.github/ISSUE_TEMPLATE` when filing issues
   (blank issues are disabled).
2. Wait for the required checks:
   - **Check Commit** — tsconfig references, build, typecheck, eslint on
     changed files, the tests related to your changes, circular-import check
   - **E2E Tests**, **Codegen Tests**, **Check Windows** — depending on what
     you touched (the Windows job catches POSIX-only breakage before users do)
3. Address review feedback on the same branch.
4. After merge, the release pipeline handles versioning and publishing:
   `main` auto-releases every night (02:00 UTC) as `X.Y.Z-dev.N`. You never
   edit `package.json` versions or `CHANGELOG.md` by hand — see
   [RELEASE.md](./RELEASE.md) for the staging and production flows.

## Finding work

- ["good first issue"](https://github.com/powerhouse-inc/powerhouse/issues?q=is:open+label:%22good+first+issue%22)
  and ["help wanted"](https://github.com/powerhouse-inc/powerhouse/issues?q=is:open+label:%22help+wanted%22)
  labels mark the easiest entry points.
- File new issues with the templates in `.github/ISSUE_TEMPLATE`.
- Discuss large or cross-cutting changes in an issue before starting;
  architectural decisions get recorded as ADRs in `docs/adr/`.

## Working with agents

Agent-driven work in this repo follows the `docs/superpowers` workflow: a
design spec in `docs/superpowers/specs/`, a step-by-step plan in
`docs/superpowers/plans/`, and evidence of execution in
`docs/superpowers/evidence/`. Land the spec and the plan before making code
changes.
