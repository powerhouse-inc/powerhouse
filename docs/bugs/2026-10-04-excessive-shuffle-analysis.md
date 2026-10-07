# W0.9: the 1612-operation reshuffle and the inbox head-of-line stall

Field evidence: `docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md`,
section "Regression run 4". Two symptoms on the live distyra Accounts drive
(~16.6k operations): one `EXCESSIVE_SHUFFLE` dead letter on the
`distyra/original-source-collection` document ("Dropbox files", ~1607 sources),
and a channel whose apply loop then froze at inbox cursor 16599 with 81
operations stuck, including rename operations for unrelated healthy documents.

Both are now root-caused. Both have a landed fix, with the residual design
question for A written up below rather than decided here.

## A. Why one operation demanded a 1612-operation reshuffle

### Where the machinery lives

| What | Where |
| --- | --- |
| the bound and its error | `packages/reactor/src/executor/simple-job-executor.ts` `executeLoadJob`, `MAX_SKIP_THRESHOLD = 1000` (line 123); `packages/reactor/src/shared/errors.ts` `ExcessiveReshuffleError` |
| what counts as conflicting | `simple-job-executor.ts` `selectLoadWrites`; `packages/reactor/src/storage/kysely/store.ts` `getConflicting` |
| the re-append itself | `packages/reactor/src/utils/reshuffle.ts` `reshuffleByTimestamp` |
| classification | `packages/reactor/src/sync/utils.ts` `classifyJobFailure` -> `EXCESSIVE_SHUFFLE`, which quarantines |

### The mechanism, in the order it fires

1. **The conflict window is opened by timestamp, not by causality.**
   `selectLoadWrites` takes the lowest `timestampUtcMs` in the incoming batch and
   asks the store for every local operation at or after it
   (`getConflicting` is `WHERE timestampUtcMs >= :minTimestamp ORDER BY index`).
   A single straggler in a 25-operation batch therefore sets the window for the
   whole batch. An automation that stamps an action when it enters its queue and
   delivers it after the queue has drained newer work produces exactly such
   stragglers, which is the shape the original-source-collection document has.

2. **`predecessorBound` decides how much of that window is treated as
   concurrent.** It starts at the incoming batch's lowest `index`, and every
   local operation below it with no matching `action.id` is dropped from the
   conflict set as history rather than conflict. This is why ordinary catch-up is
   free: operations arrive with indices at or above the local head, the bound
   sits at the head, and nothing moves.

3. **An operation whose index sits below the local head collapses the bound.**
   That is the whole difference between a free append and a whole-document
   reshuffle. Two ways to get there in the field:
   - a re-delivery (the run-4 gap re-pull after the hard kill) of operations the
     store already holds at low indices;
   - local index inflation, because every reshuffle re-appends operations at
     fresh indices, so the local index space runs ahead of the remote's.

4. **Everything live from the bound upward is charged.** `nonSupersededOps` keeps
   each live operation at or above the bound, and the `rewoundFrom` pass then
   adds every live operation from `min(index - skip)` upward -- a prior
   reshuffle's head carries the whole skip (`reshuffleByTimestamp` gives the
   first-sorted operation `startIndex.skip` and zeroes the rest), so one such row
   in the window reaches far back. The discount at
   `simple-job-executor.ts:2985` only forgives operations whose `action.id`
   appears twice in the window, i.e. genuine re-appends. On a follower history
   where each action was applied once, nothing is forgiven, and the charge equals
   the live tail.

5. **1612 is the tail.** ~1607 sources plus the document's own structural
   operations. The bound of 1000 refuses it, `classifyJobFailure` names it
   `EXCESSIVE_SHUFFLE`, and `quarantinesDocument` returns true for it -- after
   which every further inbox operation for that document is silently dropped at
   `handleInboxAdded`. The downstream `original-source-queue` document then
   accrued its 13 `MISSING_OPERATIONS` dead letters because its ancestors were
   behind the quarantined one.

### The defect inside that mechanism

The charge was taken **before** the load established that it had anything to
apply:

- `reshuffleCost` and the `ExcessiveReshuffleError` were computed first
  (`simple-job-executor.ts:2985`);
- the `incomingOpsToApply.length === 0` early return sat ~25 lines later.

So a load whose operations the store already holds -- which moves nothing, whose
correct outcome is a silent success with zero operations -- was charged the
entire live tail it *would* have had to re-append if there had been anything to
insert, and dead-lettered. A gap re-pull after a crash is precisely that load,
and on a document with a long history the charge exceeds any bound the limiter
could plausibly carry.

**Fixed**: the early return now precedes the cost check. Repro and assertion:
`packages/reactor/test/bugs/2026-10-04-excessive-shuffle.test.ts`, which
reproduces the field number (a 1612-operation follower history, one re-delivered
operation, default bound of 1000) and asserts it resolves to a no-op.

### What the limiter protects, and why raising it is not free

The reshuffle is not an index rewrite. Every moved operation is re-reduced:
`PreparedWrite` (`simple-job-executor.ts:196-207`) holds **two full `PHDocument`
snapshots and one serialized `resultingState` string per write**, the whole
`prepared[]` array is live at once, and `writeCache.putRun` is then handed one
document per moved operation (`simple-job-executor.ts:2038-2046`).

The peak memory of a reshuffle is therefore `O(N_moved x documentStateSize)` --
and on the documents that trigger this, `N_moved` *is* the document, so the cost
is quadratic in document size. For the original-source-collection document
(1607 sources) a 1612-operation reshuffle materialises on the order of a
gigabyte of state snapshots and JSON strings, inside a browser worker on a
memory-tight machine. That is the runaway the bound exists to refuse, and it is
a real one.

This also disqualifies the obvious mitigation. `test/test-connect/src/README.md`
reports `S_max = 10,000` as experimentally validated (N=4, M~20, 8s burst:
survives at 10,000, 4 dead letters at 1,000) and `burst-model.py` already models
that value, but those runs were on small synthetic document-model documents
where `documentStateSize` is negligible. The measurement does not transfer to a
1607-source document, and the default in code is still 1000.

### Ranked recommendation

1. **Dedup before costing.** Landed. Removes the run-4 failure outright: the
   dead-lettered operation was a re-delivery with nothing to apply.
2. **Decide concurrency by provenance instead of by timestamp.** A reactor with
   no local writes on a document is a pure follower, and a remote's linear log
   is never concurrent with itself; the correct cost for every operation it
   receives is 1. The operation index already records `sourceRemote` per
   operation. A load whose conflict window contains only operations from the same
   remote as the incoming batch, and no local-origin ones, can append. This is
   the only option that removes the class of failure rather than widening it, and
   it needs a convergence argument before it is written -- branch owner's call.
3. **Make the bound a memory budget, and stream the re-append.** The bound
   should be on bytes of materialised state, not on a count, and `applyRun`
   should re-append in chunks so peak memory is independent of `N_moved`. With
   that in place, raising the count bound becomes safe.
4. **Raise the default and expose the knob where it is missing.** Already
   configurable (`JobExecutorConfig.maxSkipThreshold`, `MAX_SKIP_THRESHOLD` env
   on switchboard), but `apps/connect/src/reactor.worker.ts` passes only
   `featureFlags`, so the browser is pinned at 1000. Do not raise it before 3:
   on this document shape a higher bound converts a dead letter into an
   out-of-memory worker, which is strictly worse.
5. **Doc-model fix.** Have the automation stamp operations when it applies them
   rather than when it enqueues them. Removes the stragglers at the source, but
   does nothing for histories already written.

**Not implemented here**: 2, 3, 4, 5. Only 1 was clearly safe and bounded.

### Residual, asserted as current behaviour

A genuinely new operation whose timestamp precedes a long history still opens a
window over that whole history and still dead-letters. The last case in
`2026-10-04-excessive-shuffle.test.ts` asserts that, so a later change to it is
a deliberate one.

## B. Why one document's failure froze the whole channel

### Three mechanisms, all in `packages/reactor/src/sync/sync-manager.ts`

1. **One global apply chain.** `processInboxChunks` chained every chunk of every
   document of every remote onto a single `inboxChunkChain` promise. Nothing
   downstream asks for that: the queue serialises execution per document on its
   own (`queue.ts` `createQueueKey`), and the inbox's ordering obligations are
   narrower than a total order.
2. **Serial awaits inside a chunk.** `applyInboxBatch` awaited each item's
   `waitForJob` in turn, so items sharing a chunk with a slow document waited for
   it. `chunkSyncOperations` bin-packs unrelated dependency components up to
   `maxInboxBatchSize` (32), so a chunk routinely mixes documents.
3. **Compounded by the deferral TTL.** A load that fails `DocumentNotFoundError`
   is deferred rather than failed (`executor/job-result-handler.ts:158-167`), and
   a deferred job's status stays `RUNNING`, which is not terminal
   (`executor/deferred-jobs.ts`). `waitForJob` has no timeout of its own, so each
   such operation held its await for the full `DEFAULT_DEFERRED_JOB_TTL_MS`
   (30_000). Thirteen of them, strictly serialised behind one global chain, is
   over six minutes during which no document on the channel applies anything --
   which is what run 4 saw.

A fourth contributor to the "81 operations stuck" count: operations for a
quarantined document fell off the end of the `handleInboxAdded` if-chain, so they
were neither applied, nor dead-lettered, nor removed. They accumulated in the
mailbox for the channel's life.

### The fix

- **Lanes instead of one chain.** `queueInboxChunk` runs a chunk after every
  chunk it shares a lane key with and beside every chunk it does not. Lane keys
  are the two orders the apply path actually owes: the documents the chunk writes
  (the FIFO `externalDeps` the plan injects reads the previous job enqueued for
  that document) and the plan keys its dependency edges name (a cross-chunk
  dependency only resolves once the chunk providing it has been enqueued and
  recorded in `planKeyToJobUuid`). Chunks sharing neither are provably
  independent.
- **Lanes settle at the enqueue, not at the apply.** The ordering obligation is
  on reaching the queue in order; the queue holds the dependency edges. Holding
  the lane through the apply would have left a mixed chunk blocking later chunks
  for every document in it.
- **Per-item resolution runs concurrently.** `applyInboxBatch` is split into
  `enqueueInboxBatch` (refusals, plan build, `loadBatch`, plan-key and FIFO
  recording) and `resolveInboxBatch`, which resolves the chunk's items with
  `Promise.all` over an extracted `resolveInboxItem`. Behaviour per item is
  unchanged, including the dead-letter, purge-drop and marker-retry branches.
- **Bounded, because the old chain was also the backpressure.**
  `maxConcurrentInboxChunks` (default 8, `withMaxConcurrentInboxChunks`) caps how
  many chunks are enqueued-but-unresolved. The slot is taken only after the lane
  wait, so no chunk holds a slot while waiting on a lane: no deadlock.
- **The cursor invariant is now enforced rather than incidental.** Concurrent
  resolution means the highest applied ordinal can pass an operation still inside
  its load, and the inbox cursor had no floor against that -- only the
  purge-marker hold. `Mailbox` gains `holdAckBelowUnapplied`, set on both
  inboxes: `ackOrdinal` is held below the lowest ordinal of any held item that is
  neither applied nor failed. Failed items do not hold it, which preserves
  today's behaviour (a dead letter has a durable record standing for it, and
  holding would re-pull the same failure forever). The floor is cached and each
  item's lowest ordinal is taken once at `add`, so a drain stays linear --
  `test/sync/mailbox/marker-hold-cost.test.ts` is the guard on that.
- **Quarantined operations are dropped.** They are deliberately never applied, so
  leaving them held would pin the new floor and freeze the channel's cursor
  permanently -- the very symptom being fixed. The quarantine is cleared by
  re-queuing the dead letter, which re-injects the operation itself, so nothing
  depended on re-pulling them.

### Invariants checked

| Invariant | Status |
| --- | --- |
| per-document enqueue order | preserved by the document lane key; `test/sync/sync-manager/unit.test.ts` FIFO and cross-batch plan-key tests pass unchanged |
| cross-chunk dependency order | preserved by the plan-key lane keys |
| cursor never passes a non-applied, non-dead-lettered operation | newly enforced (`holdAckBelowUnapplied`) |
| cursor may pass a dead-lettered operation | preserved, and now asserted |
| durability (cursor never outruns its data) | untouched; `cursorProtectedLoadMeta` and the flush barrier are unchanged |

### Regression test

`packages/reactor/test/bugs/2026-10-04-inbox-head-of-line.test.ts`: a rename for
an unrelated document applies from behind a stalled load in the same batch and
from a later batch; a document's own loads stay in enqueue order behind its
stalled one; the cursor is held below the stalled operation and does advance past
a dead-lettered one. Three of the four fail without the fix.

## Open for the branch owner

- Options A2 and A3 above, which are where the class of failure actually ends.
- `packages/reactor/src/sync/design.md` lines 86-101 and 161-176 describe a
  `JOB_LOAD_READY`-driven inbox trim that does not exist; the real trim is
  `inbox.remove` inside the apply path. The document should not be read as the
  spec for these invariants until it is corrected.
- `lastEnqueuedJobIdByKey` is never cleared on failure, so a document's FIFO
  chain keeps extending from a job that failed. Harmless today (`failJob` adds to
  `completedJobs`, so dependents are released) but it is a dangling-hint shape,
  related to backlog item 10.
