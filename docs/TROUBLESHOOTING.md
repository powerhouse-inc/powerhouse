# Troubleshooting

Repo traps that cost maintainers time. Each entry: symptom, cause, fix.

## Build & dists

- **Tests pass or fail against code you didn't write.** Unless a `vitest.config.ts` sets a `source` condition or source aliases, workspace deps resolve to `dist/` (e.g. `packages/reactor` reads `@powerhousedao/shared` from dist; `apps/switchboard` aliases only reactor, reactor-api and reactor-drive to source). After a merge or an edit in a dependency, that dist is stale. Run `pnpm build` in each dep whose `dist/` predates its last `src` commit before trusting a red or a green.
- **Edits to `@powerhousedao/shared` have no effect downstream.** `pnpm tsc --build` there is `emitDeclarationOnly` into `.tsbuild`; the runtime dist comes only from `pnpm build` (`tsx ./bundle.ts`). Rebuild it before running other packages' tests. A new export shows up as "X is not a function".
- **Pre-commit rewrites your staged files.** lint-staged runs `oxlint --fix` and `oxfmt` on staged files. Re-stage only your own paths.

## Tests

- **reactor-browser test "passes" in milliseconds.** Its vitest config has a `browser` project (Playwright Chromium) and a `node` project (`*.node.test.ts`). Run `pnpm test`, or `pnpm exec vitest run --project browser <file>`. A run with no `browser (chromium)` label didn't use the browser.
- **A second Postgres from a compose override fails to bind 5433.** Compose merges `ports` lists. Use `ports: !override` in the override file and point tests at it with `REACTOR_TEST_PG_URL`.

## CI

- **Codegen breaks on main after a green PR, Windows only.** `do-codegen-tests-windows` in `.github/workflows/codegen-tests.yml` skips pull requests. Check the first red main run after a green one; it's usually the PR that just merged (backslash paths from `path.join`, EBUSY on a dir the test chdir'd into).
- **"Workflow Piece E2E" green on a PR, red on main.** In `e2e-tests.yml` the workflow UI step runs on PRs only when the diff touches `packages/workflow`, `reactor-workflow`, `pieces-framework` or `apps/switchboard/src/workflow`; it always runs on main. Check the "Run workflow UI tests" step's conclusion, not the job's.
- **Recipes E2E red on `semantic-search :: start` with `Error (429)`.** The HuggingFace Hub rate-limits runner IPs when the model cache (`e2e-tests.yml`, "Cache the semantic-search embedding model") misses. It isn't your diff. Re-run the job.

## Reactor runtime

- **Event subscriber assertions race in tests.** `SimpleJobExecutor` emits `JOB_WRITE_READY` without awaiting it (`simple-job-executor.ts`). `WorkerPoolJobExecutorManager` awaits it. `EventBus.emit` awaits subscribers one at a time over a snapshot. Resolve a promise from the subscriber and await it instead of checking a flag.
- **Waiting for `WRITE_READY` hangs or ends early.** It isn't terminal. Only `READ_READY` and `FAILED` are.
- **A new terminal job error retries until the limit.** `JobResultHandler` (`packages/reactor/src/executor/job-result-handler.ts`) retries any error missing from its `isError` allow-list. Add yours there. Only `name`, `message`, `stack` and `documentId` survive the queue and worker hops, so classify by `name`.

## Release/deploy

- **A new public package publishes without `dist/`.** `pnpm pack` honours the root `.gitignore`, which ignores `dist`. Give every non-private package a `files` allowlist (or an `.npmignore`, as `apps/switchboard` has).
- **Academy deploy red or timing out.** Pushes to `cr.vetra.io` vary widely in speed (`deploy-academy.yml` allows 40 minutes). Read the build step's first error before blaming the registry; an MDX error can hide behind it. The image pins `node:24` because Node 25+ dropped corepack.
