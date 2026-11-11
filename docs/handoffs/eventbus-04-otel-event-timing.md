# Time job lifecycle metrics at the source, not on event receipt

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** S   **Area:** packages/opentelemetry-instrumentation-reactor, packages/reactor (events, executor, read-models)

## Context
`ReactorInstrumentation` (`packages/opentelemetry-instrumentation-reactor/src/instrumentation.ts`) derives job durations by stamping `performance.now()` when each bus event arrives and subtracting later. Switchboard starts it after the module is built (`apps/switchboard/src/server.mts:815-818`). This works only while every event is delivered in the same process, promptly. Other reactor events already carry durations measured where the work ran: `READMODEL_BATCH_COMPLETED` (stage times, `instrumentation.ts:254-270`), `READMODEL_INDEXED.durationMs` (:288), `CATCHUP_SWEPT.durationMs` (:308). Event payload types are public exports of `@powerhousedao/reactor` (`packages/reactor/index.ts:255`, :299-301), so a payload change is a cross-package contract change.

## Problem
Verified on main:
- Per-job maps `pendingTimestamps`, `runningTimestamps`, `writeReadyTimestamps` (`instrumentation.ts:38-40`) are set on receipt of `JOB_PENDING` (:106), `JOB_RUNNING` (:122), `JOB_WRITE_READY` (:138).
- `readmodelIndexDuration` = receipt(READ_READY) - receipt(WRITE_READY); `jobTotalDuration` = receipt(READ_READY or JOB_FAILED) - receipt(PENDING) (:150-161, :180-186); `executorJobDuration` = receipt(executor JOB_COMPLETED/FAILED) - receipt(RUNNING) (:204-210, :232-238).
- Receipt already lags the work today: `WRITE_READY` is emitted fire-and-forget after durability (`packages/reactor/src/executor/simple-job-executor.ts:710`), and in the worker pool from a detached promise after a collection-membership lookup (`worker-pool-job-executor-manager.ts:340`, :377-406). With the projection worker, `READ_READY` is emitted on the host from the worker's reply (`projection/projection-shard-manager.ts:361-363`).
- `EventBus.emit` calls subscribers in registration order and awaits each (`packages/reactor/src/events/event-bus.ts:41-60`). From reading the code, the instrumentation subscribes last, so its receipt time includes any awaited work by earlier subscribers (e.g. the sync manager's `enqueueWriteReady`, `sync/sync-manager.ts:609-612`). Not measured.
- `performance.now()` is per process; a remote or replayed delivery cannot be compared against it at all. A lost event leaves an entry in the maps until `cleanup` (:510-514) is reached by a later terminal event, which for a lost terminal event never happens.

## Goal
Lifecycle durations are measured where the work happens and carried in payloads (or derived from existing payload fields), so the instrumentation records correct values whether events arrive late, out of process, or not at all.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) answering the questions below; stop for review.
- After approval: emitters add the chosen timing fields; `instrumentation.ts` records from payloads; the receipt maps are removed or bounded.
- Tests in `packages/opentelemetry-instrumentation-reactor/test/` (beside `catch-up-metrics.test.ts`) that deliver events late or out of order and assert recorded durations come from the payload.
- Metric names and units unchanged, or the change listed in the PR.

## Constraints and invariants
- Payloads must stay plain data (see the serializable-payloads task, `eventbus-01-serializable-payloads.md`); coordinate if both land.
- Do not make emitters await anything new; neither executor awaits `JOB_WRITE_READY`.
- Only `READ_READY` and `FAILED` end a job (`packages/reactor/src/shared/types.ts:184-195`).
- Register OTel gauges after the global meter provider, or they bind to a no-op meter (`apps/switchboard/src/observability.mts`).

## Suggested approach
ADR questions:
1. Durations vs timestamps: carry measured durations (no clock skew; precedent above) or epoch timestamps (needs synchronised clocks across hosts)?
2. Which fields, where: `createdAtUtcIso` already exists on `JobInfo`; `JobStartedEvent.startedAt` (`packages/reactor/src/executor/types.ts:270-272`); `JobResult.duration`/`completedAt` (:128-132). Put job-level timing in `JobMeta` so every event carries it, or add fields per event?
3. `readmodelIndexDuration`: the coordinator already measures chain wait and stages; can `READ_READY` carry `durationMs` from `read-models/coordinator.ts` and the projection reply?
4. What to do with the receipt maps: delete, or keep as a fallback with a size cap.

## Verify
`pnpm build` in `packages/reactor` first (the instrumentation reads reactor from dist). Then in `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`; in `packages/opentelemetry-instrumentation-reactor`: `pnpm tsc`, `pnpm test`, `pnpm lint`. Run `pnpm test` in `apps/switchboard` if its observability wiring changes.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
