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

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | `>=24` | see `engines.node` |
| pnpm | Match the workflow being reproduced | `.github/workflows/e2e-tests.yml` pins 12.10.1; other jobs may select a different version |
| bun | Match the workflow being reproduced | E2E CI pins 1.4.2. The `postbuild` steps of `ph-cli`, `ph-cmd` and `registry` require Bun |
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
  used by project references. Runtime resolution depends on the package's runner
  configuration and export conditions; some suites require built sibling packages.

`scripts/new-worktree.sh` automates all of the above for isolated git
worktrees: `./scripts/new-worktree.sh <name>` creates a prepared worktree
under `~/.worktrees/powerhouse/` (branch `fix/<name>` from `main` by default).
For work based on another branch, pass an explicit base:
`./scripts/new-worktree.sh <name> <branch> <base-commit>`. This helper runs setup
immediately. When source validation must precede setup, create an unprepared
checkout with `git worktree add --no-track -b <branch> <path> <base-commit>`.
Verify its `git rev-parse HEAD` and transferred inputs with the
[context checker](docs/development/verification.md#capture-and-transfer)
before installing or building.

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
pnpm test                                  # the curated CI set in package.json
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

### Package prerequisites

The TypeScript `source` export condition does not control every Node subprocess
or Vitest project. Inspect the owning runner configuration before skipping builds.

| Check                                           | Resolution and prerequisites                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/document-model` definition unit tests | Its Vitest configuration selects source conditions and aliases the local compiler. Packed-consumer tests additionally check rebuilt package output.                                                       |
| `clis/ph-cli` loader and built-CLI tests        | Node imports externalized `document-model` and emitted modules. Build `ph-cli` and its workspace dependencies before runtime checks. Start with `loader-node.test.ts` and `built-cli.test.ts`.      |
| `packages/reactor-api` tests                    | Its Vitest configuration does not select the workspace `source` condition. Rebuild changed producers such as `document-model` before testing consumers of their `dist` exports.                           |
| Reactor PostgreSQL tests                        | Provide a reachable database using `REACTOR_TEST_PG_URL`. The default is `postgres://postgres:postgres@localhost:5433/reactor`. Tests create and drop databases, so the test role needs those privileges. |
| `packages/reactor-browser` browser tests        | Install Chromium as described above. A missing browser is not a successful browser verification.                                                                                                          |
| Registry-backed E2E tests                       | Use their existing harness and services. `test/e2e-utils` workspace publishing changes local registry state and is reserved for these explicit scenarios.                                                 |

Finish producer builds before consumer tests against the same outputs. Run heavy
suites sequentially within a verification task. Keep source reviews parallel on a
stable checkout. A timeout that passes alone warrants investigating concurrent
work; it does not establish that a product failure is harmless.

Use [the verification guide](docs/development/verification.md) for portable
deadlines, source snapshots and retained rerun evidence. Store evidence outside
checkouts that will be deleted or cleaned. `pnpm simulate-ci-workflow` begins with
`pnpm clean`, which deletes ignored files.

## Lint and formatting

```bash
pnpm lint       # oxlint across all packages, then oxfmt --check
pnpm lint:fix   # oxlint --fix, then oxfmt
```

- `lint-staged` runs `oxlint --fix` and `oxfmt` on staged files during `git commit`.
- Lint rules live in `.oxlintrc.json`; custom rules are in `lint-plugins/`.
- `.oxfmtrc.json` defines formatting for code, JSON, YAML, CSS, GraphQL and HTML;
  Markdown/MDX stay on Prettier (`.prettierrc.json`), which oxfmt mangles.
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
   - **Check Commit** — tsconfig references, build, typecheck, oxlint and
     oxfmt on changed files, the tests related to your changes, circular-import check
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

Read [AGENTS.md](AGENTS.md) for source ownership and task-specific reference
routing. Local preferences may live in ignored `AGENTS.local.md` and
`CLAUDE.local.md`; a fresh clone does not require those files.
