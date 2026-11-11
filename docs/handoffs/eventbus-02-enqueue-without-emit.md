# Stop `queue.enqueue` from waiting on job execution through the bus

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (queue, executor, core, admin, sync)

## Context
`InMemoryQueue.enqueue` ends with `await this.eventBus.emit(JOB_AVAILABLE, …)` (`packages/reactor/src/queue/queue.ts:200-245`, emit at :244). `EventBus.emit` awaits every subscriber in order and throws `EventBusAggregateError` after all ran (`src/events/event-bus.ts:41-60`); `IEventBus` documents that wait as its contract (`src/events/interfaces.ts:22-30`). Both executor managers subscribe to `JOB_AVAILABLE` and run jobs inside the subscriber. So "enqueue" in practice can mean "enqueue and run". A networked bus (or a broker-backed queue) returns at publish, which silently changes every caller below.

## Problem
Verified on main:
- `SimpleJobExecutorManager`'s subscriber awaits `processNextJob` when it has capacity (`src/executor/simple-job-executor-manager.ts:95-103`). `processNextJob` dequeues the head of any eligible queue (not necessarily the job just enqueued), awaits execution and `handleResult`, then `await checkForMoreJobs()` (:282-288), which loops while the queue has jobs (:291-306).
- `WorkerPoolJobExecutorManager`'s subscriber awaits `tryDispatchAll` (`worker-pool-job-executor-manager.ts:145-150`, :238-245), which awaits each worker's job and then `tryDispatchFor` again (:351-357).
- Net effect: `await queue.enqueue(job)` returns immediately when executors are busy, but otherwise may return only after this job, other documents' jobs, and the rest of the backlog ran. A subscriber throw may surface to the enqueuer as `EventBusAggregateError` (open question: not verified which errors escape `processNextJob`).

Callers that await enqueue:
- `core/reactor.ts`: `create` :688, `deleteDocument` :748, `execute` :804, `load` :867, `executeBatch` :941 (serial loop; on a throw it `remove`s already enqueued jobs and marks all failed, :942-958, even though they may already have run), `loadBatch` :1035 (same pattern).
- `core/group-reevaluation-trigger.ts:199` (serial per document).
- `executor/deferred-jobs.ts:96` (flush, inside `handleResult`) and `queue.ts:647` (`retryJob` re-enqueue, inside result handling): both re-enter the dispatch loop from within a job's handling.
- `admin/document-purge-service.ts:81-86` already races enqueue against `Promise.resolve()` because "enqueue settles only after the job runs".
- Sync: `sync/sync-manager.ts:2949` (`reactor.load`) and :3150 (`reactor.loadBatch`) await those; inbox pacing may rely on the wait (not verified).

## Goal
`enqueue` resolves once the job is accepted (queued or refused), independent of execution, on any `IQueue`/`IEventBus`; callers that need completion wait on job status explicitly.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) answering the questions below; stop for review.
- After approval: the wake-up no longer runs jobs inside `emit` (or `enqueue` no longer awaits it); every caller above reviewed and adjusted; the purge-service race removed if no longer needed.
- Tests: `enqueue` resolves before a slow job finishes (both managers); `executeBatch` partial-enqueue failure no longer "removes" jobs that ran; existing `test/core/batch-error-cleanup.test.ts`, `test/queue/`, `test/executor/`, `test/sync/` green.
- Note any test that relied on "await enqueue means done" and how it now waits.

## Constraints and invariants
- `enqueue` still settles a CREATE's model refusal before it returns (it fails the job, it does not throw; `queue.ts:224-233`).
- `JOB_PENDING` before execution; tracker registration before enqueue (`reactor.ts:685-688`).
- One job per document; head-only per `document:scope:branch`; retry keeps its position (`queue.ts:208-210`).
- Managers must still wake on enqueue, on job end (`checkForMoreJobs`, `tryDispatchFor`) and on `resume` (`queue.ts:707-722`). A lost wake must not strand a job.
- Do not change `WRITE_READY`/`READ_READY` emission; neither executor awaits `JOB_WRITE_READY` (`executor/simple-job-executor.ts:710`, `worker-pool-job-executor-manager.ts:340`).

## Suggested approach
ADR questions and options:
1. Where to break the chain: (a) managers schedule work (`queueMicrotask`/`setImmediate`, or a non-awaited loop) instead of awaiting it in the subscriber; (b) queue emits `JOB_AVAILABLE` without awaiting; (c) replace the bus wake with a direct `IQueue` notification API. (a) keeps the bus contract and fixes every queue.
2. Backpressure: today the wait throttles producers (sync inbox, batch loops). What replaces it (`queue.totalSize` is already read in `sync/channels/interval-poll-timer.ts:209`)?
3. `executeBatch`/`loadBatch` rollback semantics once enqueue no longer implies execution.
4. Should `IEventBus` keep "emit waits for all subscribers" as contract, given a remote bus cannot honour it?
Start from `simple-job-executor-manager.ts:95`, `worker-pool-job-executor-manager.ts:145`, `queue.ts:244`.

## Verify
In `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. Then `pnpm build` in `packages/reactor` and run `pnpm test` in `packages/reactor-privacy` (reads reactor from dist). `packages/reactor-api` and `apps/switchboard` alias reactor to source (`reactor-api/vitest.config.ts:19-24`, `apps/switchboard/vitest.config.ts:16`); run `pnpm test` in both.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
