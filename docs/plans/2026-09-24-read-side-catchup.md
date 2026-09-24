# Plan: Read-side catch-up for committed operations (follow-up to #3088)

Date: 2026-09-24
Status: proposal, not started

## Problem

Only the operation index write is durable. Every hop after commit is in
memory: the worker's result message, the host's fire-and-forget
`JOB_WRITE_READY`, the `ReadModelCoordinator` chains, and the projection
shard's queue. A crash in any of those windows leaves committed operations
invisible to read models, processors, sync and auth reevaluation.

Every consumer's cursor is a high-water mark, so a lost event stays lost even
after a restart once any later operation has been indexed:

- `BaseReadModel.saveState` writes `max(lastOrdinal, batchMax)`
  (`packages/reactor/src/read-models/base-read-model.ts:250`); boot replay is
  `getSinceOrdinal(lastOrdinal)` (:101-120).
- `ProcessorCursor.lastOrdinal` is raised to the highest delivered ordinal
  (`processors/processor-queue.ts:200-229`); `shared/processors/types.ts:68-76`
  already documents that lower ordinals can go unreplayed.
- Sync derives the outbox from `latestOrdinal`, an in-memory high-water mark
  (`sync/mailbox.ts:74-76`); a transient hole below it is skipped for good.
  In pool mode transactions overlap, so a higher ordinal can become visible
  before a lower one.
- `GroupReevaluationTrigger` (`core/group-reevaluation-trigger.ts:36-41`) has
  no cursor at all. A lost membership-change event means auth reevaluation
  never runs. This is auth-relevant.

Crash windows: worker commits then exits before `post`
(`executor/worker/run-worker.ts:241-255`; the committed retry returns
`operations: []`, `simple-job-executor.ts:451-467`); host emits WRITE_READY
after commit (`simple-job-executor.ts:308-320`,
`worker-pool-job-executor-manager.ts:347-401`); coordinator chains live in
memory (`read-models/coordinator.ts:99-205`); a projection shard drops
WRITE_READY while not ready and abandons in-flight jobs on exit
(`projection/projection-shard-manager.ts:458-510, 721-760`).

Prior art: `AttachmentReferenceReadModel` keeps a cursor that stops at the
first missing ordinal and replays the gap from the index
(`packages/reactor-attachments/src/read-models/attachment-reference/attachment-reference-read-model.ts:121-245`).

## Design

`operation_index_operations.ordinal` is a global serial primary key
(`storage/migrations/009:31`). It has permanent holes (rolled-back inserts)
and, in pool mode, transient holes (a lower ordinal committing after a higher
one is visible).

1. **Settled watermark.** One host component tracks `settledThrough`: the
   highest ordinal S such that every ordinal <= S is present in the index or
   has been missing for longer than T. T must exceed the longest transaction
   (`jobTimeoutMs` plus margin). Query:
   `select ordinal from operation_index_operations where ordinal > $S order by ordinal limit $n`.
2. **Contiguous cursors.** Each consumer persists `appliedThrough`, the end of
   the unbroken run of applied ordinals, capped at `settledThrough`, in place
   of the high-water mark. Lift `contiguousEnd`, `loadThroughOrdinal` and
   `replayedThrough` from the attachment read model into `BaseReadModel`. A
   live batch not contiguous with the cursor first loads the gap from the
   index and merges, so each stream still sees ordinal order. Same change for
   `ProcessorQueue`. Sync re-derives from the contiguous floor and dedupes
   queued outbox items by opId. `GroupReevaluationTrigger` gets a `ViewState`
   row and scans `(cursor, settledThrough]` for membership actions.
3. **Triggers.** Sweep at boot (existing `init` paths) and on a timer of a few
   seconds. A sweep is `getSinceOrdinal(appliedThrough)` pushed through the
   consumer's normal indexing path, with `rebuildStateForOperations` where
   `resultingState` is needed, and the consistency tracker updated so waiting
   tokens resolve.
4. **Workers.** Executor workers are unaffected. Projection shards sweep in
   their own worker; the host `ProcessorManager` sweeps on the host. With
   `shardCount > 1` shards share one `ViewState` row per read model, which
   cannot hold a per-shard contiguous cursor; switchboard runs `shardCount: 1`.

## Idempotency

Duplicates are normal: at boot everything in `(appliedThrough, oldHighWater]`
replays. The document view guards only the header row with
`lastOperationOrdinal <= ordinal` (`read-models/document-view.ts:338-341`);
extend the guard to every scope or an out-of-order duplicate rolls a snapshot
back. The indexer's REMOVE-then-ADD replayed out of order resurrects a
relationship; it relies on per-stream in-order merging. Processors are
at-least-once and dedupe backfill against live delivery
(`processor-queue.ts:271-283`). Reevaluation jobs are safe to repeat.

## Cost

Steady state: one primary-key range scan per tick. A long unsettled hole makes
each tick re-read everything above it until T passes. Rebuilding
`resultingState` is one write-cache `getState` per operation. No schema
migration: `ViewState` and `ProcessorCursor` keep their integer column; only
its meaning changes. Existing high-water values carry over, so gaps already
below them stay lost unless a one-time rescan is run.

Roughly 800-1200 lines with tests, in 4-5 commits: the watermark (new file),
`base-read-model.ts` (and simplify the attachment model onto it),
`document-view.ts` guard, `processor-queue.ts`, `sync-manager.ts` /
`mailbox.ts` / `batch-aggregator.ts`, `group-reevaluation-trigger.ts`, timer
and shutdown wiring in `reactor-builder.ts`,
`projection-worker/build-projection-stack.ts` for the shard cursor id.

## Not this

- Re-emitting from the executor on retry only. #3088 does this for the
  committed-retry path; it misses the host-crash windows.
- A host ledger of announced ordinals emitting synthetic WRITE_READY. Not
  durable across a host crash, leaves the high-water cursors in place, and
  awaiters and the batch aggregator would see unknown job ids.
- Buffering dropped shard events. Unbounded.
- Dropping delivery below the cursor on live paths. Loses transient-hole
  operations.

## Open questions

1. T for settling holes, or settle precisely with `pg_current_snapshot`.
   PGlite has no concurrency, so its holes are always permanent.
2. Whether a boot-time rescan recovers gaps already buried under today's
   high-water cursors, and from which ordinal.
3. Whether the document-view guard must ship before the sweep.
4. Whether the group-reevaluation gap ships ahead of the rest.
5. Whether `shardCount > 1` is supported; if so, per-shard cursor ids need a
   `ViewState` migration.
6. Whether the sync transient-hole loss in pool mode is in scope. It was
   inferred from the code, not reproduced; it needs a failing test first.
