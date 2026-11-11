# Decide where deferred load jobs live when the queue is not in-process

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (executor, queue)

## Context
A load job whose document does not exist yet (operations from a peer arrived before the CREATE) is held, not failed. `JobResultHandler` defers it on `DocumentNotFoundError` for `kind === "load"` (`packages/reactor/src/executor/job-result-handler.ts:186-195`). The held jobs live in a `DeferredJobs` map owned by each executor manager (`src/executor/deferred-jobs.ts:32-34`; `simple-job-executor-manager.ts:62`, `worker-pool-job-executor-manager.ts:110`), with a TTL of 30 s by default (`src/executor/types.ts:183`). This only matters once the queue is shared or persisted (the Postgres-backed `IQueue` option); with today's `InMemoryQueue` on one host it works.

## Problem
Verified on main:
- Deferring removes the job from the queue entirely. `handle.defer()` calls `InMemoryQueue.deferJob`, which releases the document lock and deletes the job from `jobIndex` (`src/queue/queue.ts:600-605`). `deferJob` is not on `IQueue` (`src/queue/interfaces.ts:14-148`); it is reached through the handle's `onDefer` callback (`queue.ts:295`, :349, :416). The job then exists only in the manager's map.
- Release happens only when a job carrying `CREATE_DOCUMENT` completes through the same manager: `handleResult` calls `flushDeferredFor` (`job-result-handler.ts:103-105`, detection at :315-327), which re-enqueues (`deferred-jobs.ts:86-104`).
- Expiry fails the job through the queue and tracker and emits `JOB_FAILED` locally (`deferred-jobs.ts:124-181`). Until then the tracker shows RUNNING.
- Shutdown fails all deferred jobs without telling the queue (`deferred-jobs.ts:109-118`); nothing persists them.

What breaks with a shared or durable queue: a CREATE executed by host A never flushes a load deferred on host B, so B's job waits for the TTL and fails with `DocumentNotFoundError`. A restart loses every deferred job, and a durable queue would not know they existed. Open question: whether the sync inbox redelivers a load whose job was lost this way (not verified).

## Goal
An approved design for where deferred jobs are stored and what releases them when the queue is out of process, then the change behind the existing `IQueue`/manager seams with `InMemoryQueue` behaviour unchanged.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) answering the questions below; stop for review.
- After approval: deferral expressed on the queue contract (or an explicit separate store), with tests for: flush by a CREATE completing elsewhere (simulated second manager), TTL expiry releasing dependents, and restart behaviour as decided.
- Existing deferral tests stay green, notably `test/executor/executor-manager/deferred-job-ttl.test.ts`, `deferred-dependent-deadlock.test.ts`, `test/executor/job-result-handler/unit.test.ts`, `test/queue/unit.test.ts`.

## Constraints and invariants
- A deferred job must still be released by a CREATE for the id the error names, not the job's own id (comment at `job-result-handler.ts:176-180`; relationships read their source).
- Mutations are never deferred (`job-result-handler.ts:182-185`); purged documents are not deferred (:189).
- Expiry must resolve the job in the queue so dependents (queueHint) are released (`deferred-jobs.ts:26-29`), and must emit exactly one `JOB_FAILED` (`queue.ts:575-578` explains the duplicate this avoided).
- A flushed job returns to its original queue position (`queue.ts:208-210`, `jobIdToSeq`).
- One job per document at a time: the queue blocks a second job on a document whatever its scope (`isDocumentExecuting`, keyed by documentId, `queue.ts:103`).
- New terminal errors must join `JobResultHandler`'s `isError` allow-list or they retry; classify by `name`.

## Suggested approach
ADR questions and options:
1. Move deferral into `IQueue` (a DEFERRED job state keyed by awaited document id, released by `completeJob` of a CREATE) vs keep a separate `IDeferredJobStore` shared by hosts.
2. Release signal: queue-side on `completeJob` (no event needed), a durable event, or the operation index (a CREATE row for the id appears).
3. TTL clock: per host timer vs stored deadline swept by any host.
4. Restart: persist deferred jobs with the queue, or rely on sync redelivery (verify first).
5. What the tracker shows while deferred (today RUNNING).
Start from `src/executor/deferred-jobs.ts`, `src/queue/queue.ts:600`, `src/executor/job-result-handler.ts:96-106` and `:186-195`, and the archived design `packages/reactor/docs/archive/planning-v1/Queue/journal.md` (never built).

## Verify
In `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. If @powerhousedao/shared or document-model change, `pnpm build` there first.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
