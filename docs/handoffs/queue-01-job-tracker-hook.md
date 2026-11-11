# Make the job tracker replaceable and readable from another host

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (job-tracker, core, executor), packages/reactor-privacy

## Context
Every job's public status (`JobInfo`) lives in `InMemoryJobTracker`, a `Map` on the host (`packages/reactor/src/job-tracker/in-memory-job-tracker.ts:37-38`). `ReactorBuilder` always constructs it (`src/core/reactor-builder.ts:1125`); there is no `withJobTracker`, while the queue, executor and bus each have a hook (`withQueue` :699, `withExecutor` :536, `withEventBus` :623). `reactor.getJobStatus` reads it (`src/core/reactor.ts:1167-1187`), and so do `JobAwaiter` (`src/core/reactor-client-builder.ts:313-314`), GraphQL `jobStatus`/`jobChanges`, and the erasure scheduler. Any plan to move the queue or executors off host, or to run several Switchboards behind one load balancer, needs status readable where the client asks.

## Problem
- `IJobTracker.getJobStatus(jobId): JobInfo | null` is synchronous (`src/job-tracker/interfaces.ts:38`), as are `registerJob`, `markRunning`, `markFailed` (:14-30). A Postgres- or Redis-backed tracker cannot implement it.
- One caller outside the package depends on the sync shape: `reactor-privacy` takes `Pick<IJobTracker, "getJobStatus">` (`packages/reactor-privacy/src/erasure/scheduler.ts:65`) and calls it inline (:705), wired from `module.jobTracker` (`src/erasure/module.ts:43`).
- `withExecutor(manager)` takes a prebuilt manager (`reactor-builder.ts:536-538`), but the tracker is created later inside `build` (:1125), so a custom manager cannot reach it. `markRunning` is a direct call from the managers (`executor/simple-job-executor-manager.ts:166`, `executor/worker-pool-job-executor-manager.ts:271`), and `handleWriteReady` moves a job only from RUNNING (`in-memory-job-tracker.ts:81`). From reading the code: a custom manager's jobs stay PENDING in the reactor's tracker forever.
- The tracker never evicts: `put` only sets (`in-memory-job-tracker.ts:204-222`); there is no delete. A shared store needs a retention rule.
- After a restart `getJobStatus` reports every earlier job as FAILED with `JOB_NOT_FOUND_ERROR_NAME` (`reactor.ts:1174-1186`).

## Goal
An approved ADR that fixes the tracker's interface (sync vs async), how a builder accepts a custom tracker, and what a cross-host tracker must guarantee; then the interface change and hook, with InMemoryJobTracker still the default.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) answering the questions below; stop for review.
- After approval: `IJobTracker` updated, all callers in reactor and reactor-privacy migrated, `ReactorBuilder.withJobTracker` (or chosen shape) added, custom executor managers can receive the built tracker.
- Tests: a builder test with a custom tracker; a test that a `withExecutor` manager's jobs reach READ_READY; existing `test/job-tracker/` and `test/awaiter/` suites green.
- `docs/TROUBLESHOOTING.md` or package docs updated if status semantics change.

## Constraints and invariants
- Transitions only from the expected state: RUNNING→WRITE_READY, WRITE_READY→READ_READY (`in-memory-job-tracker.ts:81`, :104). A repeated event is a no-op.
- `JobAwaiter` re-reads status when it hears WRITE_READY/READ_READY/FAILED and assumes the tracker already applied that event (tracker subscribes in `buildModule`, before the awaiter is built in `reactor-client-builder.ts:313`). An async or remote tracker breaks that order unless the ADR replaces it.
- Only `READ_READY` and `FAILED` are terminal (`src/shared/types.ts:184-195`).
- Error classification is by `name`; only `name`, `message`, `stack`, `documentId` survive hops (`src/shared/types.ts:19-32`).
- `markFailed` stores the failed `Job` for debugging and counts its bytes (`in-memory-job-tracker.ts:215-220`); a remote store must decide whether to keep payloads.
- `reactor.getJobStatus` is already `Promise<JobInfo>` (`core/types.ts:556`); keep the public client API unchanged.

## Suggested approach
ADR questions:
1. Make `getJobStatus` (and writes) async, or keep a sync local cache fed by a remote store? Compare cost to the awaiter ordering.
2. Hook shape: `withJobTracker(tracker)` vs `withJobTrackerFactory(eventBus => tracker)`; how `withExecutor` managers get it (factory taking the tracker, or `IJobExecutorManager` init method).
3. Who writes status in a split deployment: the host that runs the job, or a subscriber to an external event stream?
4. Retention: TTL or count for finished jobs, in memory and remote.
5. Restart: should status for pre-restart jobs survive?
Start from `src/job-tracker/interfaces.ts`, `reactor-builder.ts:1123-1125`, `reactor.ts:1167`, `reactor-privacy/src/erasure/scheduler.ts:705`. Open question: whether any test helper (`test/factories.ts:594`) relies on sync reads.

## Verify
In `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. Then `pnpm build` in `packages/reactor` (reactor-privacy reads it from dist), and in `packages/reactor-privacy`: `pnpm tsc`, `pnpm test`, `pnpm lint`. reactor-api aliases reactor to source (`packages/reactor-api/vitest.config.ts:19-24`); run its `pnpm test` too.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
