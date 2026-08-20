# `updateOutbox` orders a document's scopes alphabetically, so `auth` is served before `document`

**Status:** open. Pre-existing on `main`; not introduced by the auth-scope work.
**Symptom:** explained (see [The deadlock](#the-deadlock)) and mitigated by #2918
(`db6136341`), which bounds it at 30s and raises a dead letter. The ordering
defect itself is unfixed.
**Reproduces with:** an empty held set, so it is independent of the stage-8 serving gate.
**Found:** while writing the stage-8 exit test (`packages/reactor-api/test/sync-serving-policy.integration.test.ts`).
**Repro:** `packages/reactor/test/sync/sync-manager/scope-ordering.test.ts` — 2 of 3 cases fail.

## Summary

When a replica backfills a document it does not yet hold, the outbox emits that
document's `auth` run before its `document` run and makes the second depend on
the first. The receiver is therefore asked to apply an auth operation for a
document it has not created yet.

## Mechanics (verified)

1. The operation index returns rows in global insertion order — `ORDER BY ordinal ASC`
   (`packages/reactor/src/cache/kysely-operation-index.ts:406`). That order is
   causally safe by construction: a document's creation is written before
   anything that follows it.

2. `updateOutbox` then **re-sorts each page** by `(documentId, scope, ordinal)`
   (`packages/reactor/src/sync/sync-manager.ts:1150-1158`), discarding that
   order.

3. `scope` is compared as a raw string, so the ordering is lexicographic
   (`auth < document < global < local`). For any one document the `auth` run
   sorts ahead of the `document` run that creates it.

4. `emitBatches` chains `dependsOn` per document through `lastJobByDoc`
   (`sync-manager.ts:1064`, `:1078`, `:1102`), so emission order becomes a hard
   dependency: the `document` batch depends on the `auth` batch.

5. The sort is per page, so the grouping it buys only holds within a page.

Mechanics 1, 3 and 4 are asserted directly by the repro test.

## The deadlock

Why nothing was dispatched, and why no dead letter was raised. The answer is a
mutual wait between the sync dependency chain and the executor's deferral path,
each of which is individually reasonable:

1. The receiver applies the `auth` run first (mechanic 3). Its document does not
   exist, so the load job is **deferred**. Deferral was silent by design: it
   emitted no event and moved no job status, so the job sat at `RUNNING`.
2. A deferred job was released only when a job carrying `CREATE_DOCUMENT` for
   that document id completed.
3. That create job is blocked behind the deferred auth job by the inverted
   `dependsOn` (mechanic 4), so it never runs, so nothing ever releases the hold.

Neither side times out and neither side reports, which is exactly "no runs
dispatched, no dead letter, indefinitely". Both dead-letter paths
(`sync-manager.ts:793`, `:816`) are downstream of dispatch and cannot fire.

This is inferred from #2918's `df5bc377d` plus the code paths above; it has not
yet been demonstrated by a test.

Note the reported status reading is a separate detail:
`SyncOperationStatus.Unknown` is the constructor state
(`packages/reactor/src/sync/sync-operation.ts:57`) whose only exit is
`started()` at transport hand-off, and an inbox item can never be `Unknown`
because `receive()` calls `transported()`. So whichever list the reactor-api test
observed was sender-side, which the deadlock above does not by itself explain.

### What #2918 changed

`df5bc377d` bounds the silence: a hold outliving `deferredJobTtlMs` (30s) fails
the job **through the queue**, which releases anything that declared a dependency
on it. The deadlock therefore resolves after 30s, the create proceeds, and the
auth operation fails visibly and must be re-delivered.

That removes the hang, not the defect. Every fresh backfill of a policied
document still costs a 30s stall and a dead-lettered auth run per document.

## The barrier this violates

Nothing except `dependsOn` orders a document's scopes against each other. The
queue's sub-queue key is `(documentId, scope, branch)`
(`packages/reactor/src/queue/queue.ts:158`, invariant documented at `:122-128`),
so per-scope FIFO is all it guarantees; `queueHint`, fed from `dependsOn`, is the
only cross-scope mechanism on the inbox path.

That chain is load-bearing, because document-scope operations write **other**
scopes' rows — three of them:

- `CREATE_DOCUMENT` seeds `header`, `document` and `auth` snapshots
  (`src/read-models/document-view.ts:158`).
- `UPGRADE_DOCUMENT` reindexes **every** scope in `resultingState` when the
  operation vouches for its siblings, via `initialState` or `__migrated`
  (`document-view.ts:180`). `createDocument` emits a seed upgrade carrying
  `initialState: document.state` in the same document-scope job as the create
  (`src/core/reactor.ts:475-485`). A real migration (`fromVersion > 0`) fetches
  every sibling scope fresh and migrates it
  (`src/executor/document-action-handler.ts:731-757`).
- `DELETE_DOCUMENT` updates `DocumentSnapshot` filtered on `documentId` and
  `branch` with **no scope predicate** (`document-view.ts:117-131`), stamping its
  index and hash onto every scope's row.

### The barrier only holds within a page

`emitBatches` calls `outbox.add` once per page, and `pushSyncOperations` resolves
`dependsOn` against a `jobIdToKeys` map built incrementally **within one push
array** (`src/sync/channels/gql-req-channel.ts:909-929`). A dependency whose job
was in an earlier push resolves to `undefined` and is **dropped, not stalled**.
Demonstrated with a 522-op history straddling the 500-row page limit.

So on a multi-page backfill the cross-scope ordering guarantee does not exist at
all, and the silent divergence the barrier is there to prevent is already
reachable. The receiver has the machinery for cross-batch dependencies
(`planKeyToJobUuid` → `externalDeps`, `sync-manager.ts:846-860`) that the
sender's encoder can never feed. Related: envelope `key`/`dependsOn` are per-push
array indices (`String(i)`) used verbatim as `jobId`/`jobDependencies`, so
`planKeyToJobUuid` keys alias across pushes — latent only because the encoder
drops those dependencies.

## Candidate fixes

1. **Rank scopes causally instead of lexicographically** — `document`, then
   `auth`, then domain scopes.

   Prototyped green (all 3 repro cases, plus `packages/reactor/test/sync/`,
   507 tests) and reverted. But it removes the *inversion* without restoring
   *order*: the sort still groups by scope, so a later `UPGRADE_DOCUMENT` is
   still delivered ahead of the auth and domain operations it causally follows.
   With history `document@1, auth@2, global@3, document@4, auth@5, global@6` it
   emits `document@1, document@4, auth@2, auth@5, global@3, global@6`. Given that
   an upgrade migrates and reindexes every sibling scope, that is the same hazard
   class the fix is meant to remove.

   It also hardcodes a precedence table in a comparator — see
   [Where precedence belongs](#where-precedence-belongs).

2. **Do not chain `dependsOn` across scopes of one document.** Rejected.
   Since the queue only serializes within a scope, dropping the chain removes the
   sole ordering between a document's creation and its other scopes.

   The narrowed version — keep `document` as a barrier, relax chaining only
   between non-document scopes — is also **not worth doing**: the dispatcher
   refuses to dequeue any job for a document that already has one executing
   (`isDocumentExecuting`, `queue/queue.ts:270`, `:330`), so execution is already
   serialized per document across all scopes and the relaxation buys no
   parallelism at all.

3. **Drop the sort and keep the index's ordinal order.** The only candidate that
   preserves cross-scope interleaving, and therefore the only one that fixes
   candidate 1's residual hazard. Costs whatever batching efficiency the sort
   buys: `batchOperationsByDocument` (`src/sync/utils.ts:141`) only groups
   contiguous runs, so unsorted input produces more, smaller batches. That cost
   is measurable and should be measured before choosing.

Current lean: candidate 3, plus fixing the cross-page dependency encoder.

### Where precedence belongs

There is no canonical scope enum; `scope` is an open `string` (Zod `z.string()`,
`text notNull`, no check constraint). Two homes already encode the distinction —
`ALWAYS_READABLE_SCOPES` (`src/decision/read-gate.ts:22-32`), copy-pasted twice
in `reactor-browser` as `NON_DOMAIN_SCOPES`; and the executor's declared
cross-scope evaluation order, documented as load-bearing and derived from the
decision model's `staticReadSet` (`src/executor/simple-job-executor.ts:1076-1085`).

A hardcoded table in a sync comparator would be a second source of truth that can
silently disagree with those. Derive the rank; do not restate it. Note also that
`comparePositions` (`src/decision/merged-order.ts:44-52`) gives `auth` the
cross-stream timestamp tie — auth *first* — which is a deliberate spec rule in a
different context (state derivation, not emission grouping), but means a reader
already finds two answers to "what is the scope precedence".

Unranked but real: `header` is a scope every operation's snapshot writes. It
appears to carry no cross-scope causality, but that should be a decision rather
than a default.

## Adjacent defects found while investigating

Independent of this bug and of each other. None are needed to fix the ordering.

1. **Re-evaluation writes are discarded.** `reevaluateIfCriteriaMet` returns only
   `outcome.error` and drops `outcome.operationsWithContext`
   (`src/executor/simple-job-executor.ts:1214-1215`), so re-appended operations
   never reach `JOB_WRITE_READY`. The log and sync converge — the outbox is
   index-driven — but **read models do not**, so projections keep serving
   pre-revocation state until a restart catch-up. Those re-appends are also
   absent from `touchedCacheEntries`, so a later rollback leaves
   post-reevaluation snapshots cached. Security-shaped: a revocation that does
   not reach reads.

2. **`externalDeps` is unvalidated and can wedge a sub-queue permanently.** It is
   spread straight into `queueHint` (`src/core/reactor.ts:846-849`) while
   `validateBatchStructure` only checks `dependsOn` against in-batch keys, and
   `areDependenciesMet` requires every hint to be in `completedJobs`. A hint
   naming a job that never enqueues blocks the sub-queue head forever — nothing
   dispatched, no dead letter. Distinguishing "never existed" from "already
   completed and forgotten" is the hard half, since `completedJobs` is a `Set`
   that gets cleared (`queue/queue.ts:450`).

3. **The outbox cursor writer that lacks a clamp.** Two of three cursor writers
   clamp against unserved/emitted state with docstrings naming the skip hazard;
   `gql-req-channel.ts:177-195` does a bare `max(getLatestAppliedOrdinal)` →
   `upsert` with neither. Cross-document parallelism alone lets a higher-ordinal
   document ack first, so this is a restart-skips-operations risk independent of
   scope. Not demonstrated end-to-end.

4. **Projection races across scopes.** `ReadModelCoordinator` parallelizes across
   `(documentId, scope, branch)` keys (`src/read-models/coordinator.ts:18-24`)
   and the executor's per-document mutex does not extend to the projection stage,
   so the shared `header` row and the `SlugMapping` upsert
   (`document-view.ts:186-188`, `:240-257`) already race across a document's
   scopes. Separately, `BaseReadModel.saveState` sets `ViewState.lastOrdinal` with
   `set` rather than a max (`src/read-models/base-read-model.ts:161-179`), so
   parallel chains can walk the watermark backwards.

5. **`replayDocument` orders cross-scope replay by raw `Object.keys`**
   (`packages/shared/document-model/documents.ts:536`), fed by a `getRevisions()`
   query with no `ORDER BY` (`src/storage/kysely/store.ts:585-611`). Same missing
   rank concept, different subsystem. Uninvestigated.

### Not a defect

`failJob` adds a failed job to `completedJobs` "so dependent jobs are unblocked"
(`queue/queue.ts:506-508`). This looks wrong against the barrier — a failed
create would let an auth op proceed — but #2918's deferral fix deliberately
relies on it, and in the backfill case releasing is *correct*: when the deferred
auth job fails, the create should proceed, not cascade-fail. Release-vs-cascade
depends on the direction of the causal dependency, which is a design question,
not a bug to fix.

## Sequencing

1. ~~Merge #2918 as-is~~ — done (`db6136341`), and #2919 (`b6f069fb8`).
2. Confirm the deadlock with a test, now that #2918 bounds it.
3. Fix the ordering (candidate 3, or candidate 1 with a derived rank), measuring
   the batching cost first.
4. Separate PR: the `externalDeps` guard (adjacent defect 2).
5. Separate PR: discarded re-evaluation writes (adjacent defect 1).
6. Needs a decision before implementation: the cross-page dependency encoder, and
   whether `dependsOn` should cascade or release on failure.
