# Decide how executor workers get models registered live on the host

**Type:** Triage (confirm, recommend fix or wontfix, then stop)
**Size:** S (triage) / M-L (if supported)   **Area:** packages/reactor (registry, executor/worker), packages/reactor-api (packages), apps/switchboard

## Context

Repo: `/Users/benjaminjordan/projects/powerhouse/powerhouse`, checked at main b957b9e811. Paths below are relative to it.

A document model reaches the reactor as one of three sources (`DocumentModelSource`, `packages/reactor/src/core/model-sources.ts:14-22`): a live `DocumentModelModule`, a `{ filePath }`, or a `{ packageName }`. Only file and package sources produce a worker manifest entry (`resolveModelSources`, `:63-94`); a live module is recorded as `moduleOnlyKeys`. Executor workers (`REACTOR_WORKERS`) re-import models from manifest entries (`ModelManifestEntry`, `packages/reactor/src/executor/worker/protocol.ts:126-133`; `load-model`, `:283`).

At boot this is enforced: `withWorkerPool` refuses to build if any model is live-only (`packages/reactor/src/core/reactor-builder.ts:986-997`). Switchboard passes file sources for every package model when the pool is on (`apps/switchboard/src/server.mts:966-977`), refuses the pool in dev mode because Vite-loaded models cannot cross a thread boundary (`apps/switchboard/src/boot-preconditions.mts:51-55`).

After boot there is no such check. A job for a type the worker lacks fails with `ModuleNotFoundError`. `JobResultHandler` asks the resolver to recover (`packages/reactor/src/executor/job-result-handler.ts:110-141`). `DocumentModelResolver.recoverMissingModel` loads the type on the host, then re-sends its importable entries; with none it throws `ModelNotWorkerImportableError` (`packages/reactor/src/registry/document-model-resolver.ts:85-102`, error at `registry/errors.ts:23-43`), which fails the job terminally. The resolver's own comment: "live modules do not [carry manifest entries], so a module source registers host-side only and workers never hear of it" (`document-model-resolver.ts:163-164`). Covered by `packages/reactor/test/integration/worker-pool/integration.test.ts:512-513`.

## Problem

Verified paths on main b957b9e811 that register a live module on the host after boot:
1. `HttpDocumentModelLoader.load` returns `{ filePath }` only when the package entry was file-cached, otherwise the live module (`packages/reactor-api/src/packages/http-loader.ts:503-505`).
2. Switchboard's runtime package install (`PackageManagementService.install`, `packages/reactor-api/src/services/package-management.service.ts:72-95`, wired at `apps/switchboard/src/server.mts:1665-1671`) registers live modules straight into the host registry.
3. The package change listener unregisters and re-registers live modules on update (`packages/reactor-api/src/packages/package-listeners.ts:43-95`). Workers are never told to drop or replace a model, so an updated model can run in its old version in workers. Confirm this; it is a correctness question, not only availability.

In each case, jobs for those types fail in pooled mode with `ModelNotWorkerImportableError`, or (case 3) may run stale code.

Nobody has decided this must be supported. The current message tells the operator to register from a `filePath` or package name.

## Goal

A recommendation: document the limit (and make it fail early and clearly), or support live registration in pooled mode. If the latter, a short plan for review before code.

## Acceptance criteria

- Each of the three paths reproduced or ruled out, with file:line.
- Case 3 answered: can a worker run a different model version than the host after a package update?
- A recommendation with cost:
  - **Document the limit:** refuse runtime install and live loader results when the pool is on, at the call site, with a named error; state the rule in the switchboard and reactor docs.
  - **Support it:** give every runtime-registered model an importable source (for example the HTTP loader always writes the package to a cache file and returns `{ filePath }`), and add a worker message to unregister or replace a model.
  - **Route to host:** run jobs for live-only types on the host executor. Weigh against the worker pool's guarantees (one executor per document, write-cache stickiness, purge eviction broadcast).
- Stop after the recommendation.

## Constraints and invariants

- Error names cross the queue and worker hops; only `name`, `message`, `stack` and `documentId` survive (`docs/TROUBLESHOOTING.md`, "A new terminal job error retries until the limit"). Any new refusal must be classified by name in `JobResultHandler`.
- Host and workers must run the same reducer for a given `documentType@version`, or replicas diverge from their own host. A design that lets them differ even briefly needs to say how jobs in flight are handled.
- Boot behaviour stays: `withWorkerPool` still refuses live-only models at build.
- Workers get models, signer and trust policy only as module references (`FactorySpec`, `protocol.ts:103-106`). A live object cannot cross the boundary.

## Suggested approach

1. Read `model-sources.ts`, `document-model-resolver.ts`, `job-result-handler.ts:100-150`, `http-loader.ts:436-506`, `package-management.service.ts`, `package-listeners.ts`.
2. Check whether runtime install is reachable with `REACTOR_WORKERS` on (is `httpLoader` set in pooled deployments?).
3. Write a worker-pool test for case 3 if it is not obvious from the code.
4. Recommend. Open question: do any deployments use runtime package install together with the worker pool? If not, documenting and failing early is likely enough.

## Verify

- `pnpm vitest run test/integration/worker-pool/integration.test.ts` and `test/registry/document-model-resolver.unit.test.ts` in packages/reactor.
- Any new test runs under `pnpm test` in its package.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
