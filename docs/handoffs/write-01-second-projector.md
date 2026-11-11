# Decide whether and how to partition projection across workers

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (catch-up, read-models, projection, core), apps/switchboard

## Context
The projection worker (`REACTOR_PROJECTION_WORKER`) indexes `document-view` and `document-indexer` off the host thread. `ProjectionShardManager` routes each `JOB_WRITE_READY` to one shard by `bucketFor(documentId, shardCount)` (`packages/reactor/src/projection/projection-shard-manager.ts:452-488`, `src/executor/worker-pool-router.ts:30`). Since read-side catch-up (`ae88591311`), the builder accepts only one shard: `validateShardCount` (`src/core/reactor-builder.ts:312-318`) runs in `buildModule` (:973) and in the coordinator-factory path (:1861). Switchboard hardcodes `shardCount: 1` (`apps/switchboard/src/server.mts:1037`), and the bench host refuses `N_PROJECTION_SHARDS` other than 0 or 1 (`packages/reactor/bench/host/src/main.ts:62-69`).

## Problem
- Each `BaseReadModel` owns one in-memory `ContiguousCursor` (`src/read-models/base-read-model.ts:201`, :232, :583-589; class in `src/catch-up/contiguous-cursor.ts`) and persists it in one `ViewState` row keyed by `readModelId` (`src/storage/migrations/008_create_view_state_table.ts`; reads/writes at `base-read-model.ts:528-551`, :944-968, :1115). `ProcessorCursor` (`migrations/014_create_processor_cursor_table.ts`) has the same one-row-per-consumer shape.
- The catch-up scheduler feeds `sweep(bound, present)` with every ordinal in range from the operation index (`src/catch-up/scheduler.ts:231`, :302-311). `sweep` treats every present ordinal above the cursor that it has not seen as missing and replays it (`base-read-model.ts:352-415`). A shard that receives only its bucket's documents would replay every other shard's operations, and N shards would race on one `ViewState` row.
- So the projector cannot be split by document today; the error message in `validateShardCount` states this.
- Evidence that partitioning helps is weak. Run 11 (pre-catch-up, `packages/reactor/bench/test/integration/BASELINE.md:543-552`): 64 drives, 1 shard 1246 jobs/s; 2 shards 1222; 4 shards 1097; 8 shards 1065. There is no 256-drive, 1-shard row. The hybrid projection worker (#2988) was never benchmarked against Run 11 (`docs/HANDOFF.md:32`).

## Goal
An approved ADR that first decides whether a second projector is worth building (with bench evidence), and if so fixes the partition key, the cursor model and the migration from today's single `ViewState` row.

## Acceptance criteria
- A bench record (via `/bench-record` or the Run 11 harness) comparing 1 shard against the saturated host, including the missing 256-drive, 1-shard row. If one projector is not the bottleneck, the ADR says so and recommends closing this item.
- ADR in `docs/adr/` (use the `adr` skill; next number is 0009) answering the questions below. Stop for review before code.
- If approved and implemented: `validateShardCount` relaxed only for the chosen model; tests show N shards index every operation exactly once under concurrent writes, restart and `rescan`; `ph` catch-up admin (`src/admin/catch-up-admin.ts`, `run-catchup.ts`) reports per-partition lag.

## Constraints and invariants
- A read model's cursor means "every present ordinal at or below it is applied" (`base-read-model.ts:432`); catch-up must still never skip a row (the reason contiguous cursors exist).
- The settled watermark comes from `pg_current_snapshot` (`src/catch-up/settled-watermark.ts:30-50`); sweeps must stay at or below it.
- Built-in kinds must be indexed exactly once across `preReadyKinds`/`postReadyKinds` (`reactor-builder.ts:284-296`, `validateBuiltInKindCoverage` at :342).
- Host consistency trackers advance from shard `readmodel-indexed` and `readmodel-swept` messages (`projection-shard-manager.ts:546-556`, :580-590, :613-633); a partitioned design must keep `ConsistencyToken` waits correct.
- Per-document order: operations for one document stay on one shard (`bucketFor` by documentId).
- A dead shard is not respawned; its jobs are dropped loudly (`projection-shard-manager.ts:490-527`) and Switchboard exits (`apps/switchboard/src/server.mts:746-757`).

## Suggested approach
Questions the ADR must answer:
1. Is projection the bottleneck once executors run in workers? Measure before designing.
2. Partition key: documentId bucket (today's router) or something coarser (drive/collection)? Rebucketing when N changes?
3. Cursor model. Options: (a) per-partition `ViewState` rows (`readModelId` + partition) with the scheduler reading `present` filtered to the partition's buckets (needs an index query by bucket; today `IOperationIndex.getOrdinalsInRange`, `src/cache/operation-index-types.ts:101`, has no partition filter); (b) one cursor owner that sweeps, with shards doing live indexing only; (c) split by read model kind instead of by document (one worker per kind, no shared rows).
4. Migration from one row to N rows, and back to 1, without a full rescan.
5. What `catchUpStatuses()` and the inspector report per partition.
Open question: whether `document-indexer` relationships (cross-document) allow document partitioning at all.

## Verify
- Bench: `packages/reactor/bench` (Docker harness, `bench/test/integration/run11.sh`, results in `BASELINE.md`); record through `/bench-record`, not ad-hoc timing.
- After code: in `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. Rebuild with `pnpm build` in packages/reactor before running `apps/switchboard` tests (`pnpm test` there).

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
