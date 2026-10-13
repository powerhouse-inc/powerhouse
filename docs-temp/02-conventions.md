# Monorepo conventions

The patterns shared across packages, collected here so the per-package pages do not
repeat them.

---

## 1. Tooling baseline

| Tool | Version / note |
|---|---|
| Node | `>=24` (`engines.node`) |
| pnpm | 11.x locally; CI installs `latest` via `pnpm/action-setup` |
| **bun** | 1.3.x — **required to build.** `ph-cli`, `ph-cmd` and `registry` have `postbuild` steps that shell out to it, so `pnpm build` cannot finish without it. `test/codegen` also runs on `bun test` |
| Nx | 22.7.1 — used for release versioning/changelogs and task graph |
| TypeScript | 6.0.3 (pinned in the `catalog:`) |
| Playwright | `playwright install chromium` is needed before `pnpm --filter=@powerhousedao/reactor-browser run test`, otherwise most of that package's test files are **silently skipped** |

Versions are pinned centrally in `pnpm-workspace.yaml`'s `catalog:` block.
`minimumReleaseAge: 10080` (7 days) delays adoption of fresh upstream releases.

---

## 2. The `source` export condition

The single most load-bearing convention in the repo.

Every package's `exports` map carries a `source` condition pointing at the `.ts`
entry:

```json
"exports": { ".": { "source": "./index.ts", "import": "./dist/index.js" } }
```

`tsconfig.options.json` then sets:

```jsonc
// Resolve workspace package imports to their .ts source via the "source"
// export condition. This bypasses dist/*.d.ts so `tsc --build` can typecheck
// cross-package without anything being built first.
"customConditions": ["source"],
"allowImportingTsExtensions": true,
```

**Consequence:** `tsc --build` and the test suites work against workspace *source*,
not `dist/`. Nothing has to be built before you can typecheck or test.

Vite and Vitest configs mirror it where needed, e.g. `apps/connect`:

```ts
resolve: { conditions: ["source", "import", "module", "browser", "default"] }
```

and `packages/powerhouse-vetra-packages`, which additionally needs
`server.deps.inline: ["document-model"]` because `document-model`'s `./test` export
exists only as source.

Other `tsconfig.options.json` settings worth knowing: `module: "NodeNext"`,
`emitDeclarationOnly: true`, `composite` + `incremental` (project references),
`strict`, `verbatimModuleSyntax`, `isolatedModules`, `jsx: "react-jsx"`.
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are deliberately **off** —
a comment in the file records that enabling them produces 1839 errors and the team
decided against.

---

## 3. Project references

TypeScript project references are kept in sync mechanically:

```bash
pnpm check-ts-references      # update-ts-references --check  (CI)
pnpm postinstall              # update-ts-references          (automatic)
```

Adding a `workspace:*` dependency means adding a `references` entry in
`tsconfig.json`; `update-ts-references` does it for you, and CI fails if they drift.

---

## 4. Build

| Tool | Used by |
|---|---|
| **tsdown** | Most packages (`tsdown.config.ts`) |
| Hand-written `tsx` scripts | `shared` (`bundle.ts`), `document-model` (`build.ts`), `powerhouse-vetra-packages` (`build.ts` — dual browser/node targets + `tsc --build` for dts) |
| Vite | `switchboard-gui`, `test-consumer-project` |
| Next.js | `test/test-fusion` |
| Docusaurus | `apps/academy` |
| `ph-cli build` | The fixture packages (`test/versioned-documents`, `test/test-consumer-project`) |

`pnpm build` hard-codes an ordered `--filter` list; see
[dependency map §4](01-dependency-map.md).

A note recorded in the root README: bin warnings on a first install
(`Failed to create bin … dist/cli.mjs`) are expected — the targets do not exist
until built. They clear after `pnpm build` + `pnpm rebuild --recursive`.

---

## 5. Testing

### Runners

| Runner | Where |
|---|---|
| **Vitest** | Almost everywhere. Root `vitest.config.ts` aggregates `packages/*`, `apps/*`, `clis/*`, `test/*` via `projects` |
| **bun test** | `test/codegen` only |
| **Playwright** | `test/vetra-e2e`, `test/package-e2e`, `test/test-fusion`, and inside `packages/reactor-browser`'s browser project |
| **busted (Lua)** | `apps/switchboard-lb` |
| **Cypress** | `apps/connect` (`cy:open`, not in CI) |

Coverage uses `vitest-monocart-coverage` as a custom provider (`mcr.config.js`),
merged by `tools/scripts/merge-coverage.js`.

### Naming conventions

- `*.test.ts` — the default.
- `*.integration.test.ts` — real dependencies rather than mocks
  (`packages/reactor/test/CLAUDE.md` defines this: `<component>/unit.test.ts` vs
  `<component>/integration.test.ts`, with a top-level `integration/` folder for
  cross-subsystem tests).
- `*.node.test.ts` — in `reactor-browser` and `renown`, opts a file **out** of the
  browser runner into a Node project.
- `*.spec.ts` — Playwright specs, and the analytics sub-tree (which came from
  another repo).
- `__tests__/` directories — only `ph-cmd` and `vetra/processors/codegen`.
- Document-model packages get scaffolded suites at
  `document-models/<model>/v<n>/tests/`.

### Raised timeouts — always the same cause

PGlite WASM cold boot plus migrations, per test, often under coverage
instrumentation:

| Package | Setting |
|---|---|
| `pglite-fs` | `testTimeout: 120_000` (measured ~36 s on the Windows runner vs ~7 s on Ubuntu) |
| `reactor` | `hookTimeout: 120_000`, `testTimeout: 30_000`, `maxWorkers: 4` |
| `reactor-api` | both `30_000` |
| `reactor-browser` | both `30_000` (plus P-256 keypair generation in the renown suite) |
| `registry` | `30_000` (it starts real servers) |
| `apps/switchboard` | no raised timeout, but `pool: "forks"`, `isolate: true`, **`maxWorkers: 1`** |

If you see a long timeout with a comment, it is one of these.

### Opt-in suites

Several suites are excluded from the default run and must be asked for:

| Suite | How to run | Needs |
|---|---|---|
| `reactor-api` hub-spoke | `RUN_HUB_SPOKE_INTEGRATION=1`, `pnpm test:integration` | — |
| `analytics-engine-pg` | `pnpm test:pg` | Postgres on :5555 (`docker-compose.test.yml`) |
| `analytics-engine-browser` | `pnpm test:integration:analytics` | — |
| `test/switchboard` | `pnpm test:e2e:switchboard` | a live Switchboard (spawned by `global-setup.ts`) |
| `test/package-e2e` | `pnpm test:e2e:package` | Docker |
| `test/vetra-e2e` | `pnpm test:e2e:vetra` | Playwright browsers |
| `test/recipes-e2e` | `pnpm test:e2e:recipes` | the external recipes repo. Its entry point is named `recipes`, **not** `test`, precisely so sweeps cannot pick it up |
| `test/lb-loadtest` | `pnpm --filter @powerhousedao/lb-loadtest verify` | the LB Docker stack |

### Packages with a `test` script but no test files

`analytics-engine-knex`, `analytics-engine-graphql`, `test/test-client`,
`test/test-connect`. They pass vacuously in `pnpm test:ci`. Real coverage lives in
`analytics-engine-pg` and the integration entry points.

### Packages with no tests at all

`config`, `common`, `opentelemetry-instrumentation-reactor`, `switchboard-gui`,
`apps/academy`, `test/e2e-utils`, `test/test-sync-queue`, `test/lb-loadtest`,
`test/test-consumer-project`, `test/recipes-e2e`. Each page explains where its
behaviour is verified instead.

---

## 6. Lint and static checks

| Command | Does |
|---|---|
| `pnpm lint` | `pnpm -r --workspace-concurrency=1 lint` — ESLint 10 (flat config, 25 KB `eslint.config.js`) |
| `pnpm check-circular-imports` | `dpdm` with `--exit-code circular:1` |
| `pnpm knip` | Unused exports/dependencies (`knip.json`) |
| `static-x.json` | Comment linting on **changed lines only** — `ts/comments/long` (max 1 line / 83 chars) and `ts/comments/llm-tells`, enabled in `reactor`, `reactor-drive`, `reactor-group` with `static-x-baseline.json` files |
| Prettier | `.prettierrc.json`; `lint-staged` runs `eslint --fix` on staged JS/TS |
| commitlint | Conventional commits; header max 200 chars; subject case restricted |

`LINT-WARNINGS.md` (54 KB) is the tracked backlog of existing warnings.

---

## 7. CI workflows

| Workflow | Purpose |
|---|---|
| `check-commit.yml` | The main gate — push/PR on `main` and `release/**`. Node 24, pnpm latest, bun 1.3.8, frozen lockfile, changed-files filtering |
| `check-pr-reactor.yml` | The reactor suite, separately |
| `check-windows.yml` | **Windows portability.** Its header explains it: every other job runs on ubuntu, yet `release-branch.yml` ships a `ph-windows-x64.exe`. This job catches POSIX-only scripts, `path.join` used to build URL paths or module specifiers, and permission bits that do not exist on NTFS. Deliberately narrower: install, build, unit tests, CLI smoke test |
| `codegen-tests.yml` | `test/codegen` |
| `e2e-tests.yml` | `vetra-e2e`, `package-e2e`, `recipes-e2e`; failures notify Discord |
| `test-package-managers.yml` | The CLIs under npm, yarn and pnpm |
| `academy.yml`, `deploy-academy.yml` | Docs build and deploy |
| `publish-docker-images.yml` | Container images per channel |
| `release-branch.yml` | Release branches and binaries |
| `trigger-downstream-packages.yml` | Notifies dependent repos |
| `ph-lora-tier2.yml` | (see `test/ph-lora`) |

Local equivalents:

```bash
pnpm simulate-ci-workflow           # clean → install → refs → build → typecheck →
                                    # rebuild → lint → test:ci → codegen → e2e →
                                    # storybook → circular imports
pnpm simulate-ci-workflow-reactor   # the above + test:reactor + test:integration
```

---

## 8. Windows notes

The repo is developed on Windows as well as Linux, and this shows up in conventions:

- **`cross-env`** is used for environment variables in scripts. The catalog comment
  says why: *"Windows: scripts cannot use the POSIX `VAR=value cmd` prefix (cmd.exe
  has no such syntax), and `spawn` refuses to run the `.cmd` shims that
  npm/pnpm/yarn install as unless it goes through a shell."*
  (`test/vetra-e2e`'s `test:worker` script is an exception and needs a POSIX shell.)
- `check-windows.yml` guards portability.
- `pglite-fs`'s 120 s timeout is calibrated for the Windows runner.

---

## 9. Release

- **Nx release** — `nx.json`'s `release` block covers `packages/*`,
  `packages/analytics-engine/*`, `clis/*`, `apps/*`, with
  `projectsRelationship: "managed"`, `conventionalCommits: true`,
  `updateDependents: "auto"`, and `skipLockFileUpdate: true`.
- **Branching:** `main` → tag `dev`; `Release/staging/v.x.x` → `staging`;
  `Release/production/v.x.x` → `latest` / `prod`.
- **Commands:** `pnpm release-wizard` (interactive), `pnpm run-release`,
  `pnpm run-release-safe` (dry run).
- **Docs:** `RELEASE.md` + `release-flow.png`, `RELEASE-NOTES.md`, `CHANGELOG.md`
  (581 KB), plus per-package `CHANGELOG.md` files.
- The `/release-notes` skill in `.claude/` drafts release-note entries and a Discord
  announcement.

---

## 10. In-repo documentation you should know about

| Path | Contents |
|---|---|
| `docs/adr/` | `0001-lazy-drive-sync.md`, `0002-reactor-browser-client-interface.md`. The `/adr` skill writes new ones |
| `docs/specs/` | `auth-scope.md` (the auth-scope design — long and authoritative), `gql-gen.md`, `relational-db-processor.md`, `migrate-codegen-fixes.md`, `template.md` |
| `docs/plans/`, `docs/superpowers/` | Design plans and captured evidence |
| `packages/reactor/CLAUDE.md`, `docs/ARCHITECTURE.md`, `src/sync/design.md` | The reactor, from short to long |
| `packages/reactor-api/ARCHITECTURE.md` | The HTTP/gateway adapter split |
| `apps/connect/RUNTIME-CONFIG.md` | The Connect config precedence ladder — read before changing a config field |
| `apps/switchboard/Auth.md` | The authentication tutorial |
| `apps/switchboard-lb/ARCHITECTURE.md` | The LB design spec, including rejected alternatives |
| `WARP.md`, `CONTRIBUTING.md`, `RELEASE.md` | Working practices |

Several packages carry a `CLAUDE.md` with package-specific rules: `shared`,
`builder-tools`, `reactor`, `reactor/test`, `apps/connect`, `test/vetra-e2e`.

---

## 11. Generated files — never hand-edit

| File | Generated by |
|---|---|
| `packages/shared/clis/source-config.schema.json` | `pnpm tsx scripts/emit-schemas.ts` |
| `packages/builder-tools/connect-utils/runtime-config.schema.json` | the same |
| `clis/ph-cli/COMMANDS.md`, `COMMANDS-LEGACY.md` | `postbuild` → `bun generate-docs` |
| `clis/ph-cmd/COMMANDS.md`, `COMMANDS-LEGACY.md` | the same |
| `apps/academy/ACADEMY_LLM_COMPLETE.md` | `generate:llm-docs`, plus a pre-commit hook |
| `packages/reactor-api/src/graphql/reactor/gen/*` | `pnpm codegen` (graphql-codegen) |
| `packages/reactor-browser/src/graphql/gen/*` | the same |
| `document-models/**/gen/*` in every model package | `ph-cli generate` |
| `tsconfig.json` `references` arrays | `update-ts-references` |
