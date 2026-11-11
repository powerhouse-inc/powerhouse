# Make job lifecycle event payloads plain data

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (events, executor, queue, job-tracker), packages/opentelemetry-instrumentation-reactor, packages/reactor-privacy

This task also covers the queue slide's "Bus events carry Error and Job objects" bullet; it is the same work.

**Deck correction:** only the reactor-level `JOB_FAILED` (10005) carries an `Error`. The executor-level `JOB_FAILED` (30002) already carries `error: string`; it, `JOB_STARTED` and `JOB_COMPLETED` all carry the whole `Job`.

## Context
`ReactorBuilder.withEventBus` takes any `IEventBus` (`packages/reactor/src/core/reactor-builder.ts:623`), but some job events carry class instances and whole jobs, so they cannot cross a process or network boundary as-is. The worker and RPC hops already encode errors as `ErrorInfo` (`src/executor/worker/error-info.ts:14-62`, `src/rpc/error-info.ts`), keeping `name` because consumers classify by it. Payload types are public (`packages/reactor/index.ts:255`, :299-301).

## Problem
Verified on main:
- `ReactorEventTypes.JOB_FAILED` (10005): `{ jobId; error: Error; job?: Job }` (`src/events/types.ts:163-167`). Emitted by `queue.failJob`, which passes the typed instance from `ErrorInfo.source` on purpose (`src/queue/queue.ts:572-592`), and by deferred-job expiry with a `new DocumentNotFoundError` (`src/executor/deferred-jobs.ts:170-181`). `test/queue/unit.test.ts:1309` asserts `toBeInstanceOf(DocumentNotFoundError)`.
- `JobExecutorEventTypes.JOB_COMPLETED` (30001): `{ job: Job; result: JobResult; workerId? }` (`src/executor/types.ts:282-287`). `JobResult` has `error?: Error` and `operationsWithContext` with ephemeral `resultingState` (:109-136).
- `JOB_STARTED` (30000) carries `job: Job` (`executor/types.ts:270-272`); executor `JOB_FAILED` (30002) carries `job: Job` and `error: string` (:289-296).
- `Job.lastError` / `errorHistory` hold `ErrorInfo`, whose optional `source: Error` is an in-memory instance (`src/shared/types.ts:19-32`).

What subscribers read (all on the host bus):
- tracker: `error.name/message/stack`, `job` (`src/job-tracker/in-memory-job-tracker.ts:112-121`);
- sync `BatchAggregator`: `job?.meta.batchId/batchJobIds` (`src/sync/batch-aggregator.ts`, `handleFailed`);
- `reactor.ts` logger: `error.message`, `job?.documentId` (`src/core/reactor.ts:157-166`);
- awaiter, erasure scheduler and OTel: `jobId` only (`src/shared/awaiter.ts:129`, `packages/reactor-privacy/src/erasure/scheduler.ts:200-212`, `packages/opentelemetry-instrumentation-reactor/src/instrumentation.ts:176-190`);
- OTel on JOB_COMPLETED / executor JOB_FAILED: `job.id`, `workerId` (`instrumentation.ts:198-248`).

## Goal
Every job lifecycle event payload is structured-clone and JSON safe, carrying `ErrorInfo` instead of `Error` and job identity/meta instead of the whole `Job`, without changing in-process behaviour.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) with the decisions below; stop for review.
- After approval: payload types changed, emitters and subscribers in reactor, reactor-privacy and OTel updated; `test/queue/unit.test.ts:1309` rewritten to assert `error.name`.
- A test that runs `JSON.parse(JSON.stringify(payload))` (or `structuredClone`) over each job event type and gets an equal value.
- One shared `ErrorInfo` encoder/decoder used by events, worker and RPC, if the ADR agrees.

## Constraints and invariants
- Classification by `name`; `name`, `message`, `stack`, `documentId` must survive (`shared/types.ts:19-24`). Worker `ErrorInfo` also keeps `cause`, `documentType`, `requestedVersion` (`executor/worker/error-info.ts:29-45`) for model recovery (`job-result-handler.ts:110-114`).
- New terminal errors still join `JobResultHandler`'s `isError` allow-list.
- One `JOB_FAILED` per failure (`queue.ts:575-578`, `job-result-handler.ts:268-276`).
- `JobMeta` may carry the `CURSOR_PROTECTED` symbol, which by design must not survive serialization (`shared/types.ts:91-103`). Do not "fix" that.
- The sync batch aggregator needs `batchId` and `batchJobIds` on failure, including for jobs the tracker never saw.
- These are exported public types; say in the PR that the change is breaking.

## Suggested approach
ADR questions:
1. `JOB_FAILED`: `{ jobId; error: ErrorInfo; jobMeta; documentId? }` (match `JobPendingEvent`, `events/types.ts:102-105`) vs keep `job?` as plain data. Who needs the full `Job` (tracker stores it for debugging, `in-memory-job-tracker.ts:215-220`)? Could the tracker take it from `markFailed` callers instead?
2. `JOB_COMPLETED`/`JOB_STARTED`: drop `job` and `result` for ids, meta, `duration`, `completedAt`, op count?
3. Keep a typed-instance field for in-process subscribers (non-serialized side channel) or drop it?
4. Unify `executor/worker/error-info.ts` and `rpc/error-info.ts` (near duplicates; the RPC one drops `documentId`).
Start from `src/events/types.ts:163`, `src/executor/types.ts:259-296`, `src/queue/queue.ts:586`, `src/executor/deferred-jobs.ts:175`.

## Verify
In `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. Then `pnpm build` in `packages/reactor` (OTel and reactor-privacy read it from dist), then `pnpm tsc`, `pnpm test`, `pnpm lint` in `packages/opentelemetry-instrumentation-reactor` and `packages/reactor-privacy`. reactor-api aliases reactor to source; run its `pnpm test`.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
