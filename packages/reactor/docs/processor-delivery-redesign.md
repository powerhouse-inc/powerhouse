# Processor delivery redesign

Status: proposed. Branch `fix/processor-concurrent-delivery` holds two rounds of patches to `ProcessorManager`; two adversarial reviews found that each round's locking mechanism created the surface for the next round's defects. This plan replaces the concurrency model rather than patching it a third time.

The `IProcessor` interface does not change. No processor in the monorepo or in any published package needs to be rewritten. See "Migration" for what does change and for whom.

## 1. Problem

`ReadModelCoordinator` projects each `documentId:scope:branch` key on its own chain and runs different keys in parallel (`read-models/coordinator.ts:106-116`). `ProcessorManager` is one instance shared by every key, so its passes overlap. The manager has three kinds of state and today they all live under the same locking regime:

| state | mutated by | speed |
|---|---|---|
| routing tables (`knownDrives`, `processorsByDrive`, `factoryRegistry`, filters) | drive create/delete, register/unregister | microseconds, in-memory |
| per-processor cursor (`lastOrdinal`, `status`) | every delivery, every failure, retry | one DB write |
| delivery (`onOperations`, backfill pages, `onDisconnect`, factories) | routing | unbounded — user code, I/O |

Round 1 put all three under one global promise chain: correct, but a slow `onOperations` or a hot-reload backfill stalled every document's `READ_READY`. Round 2 keyed the chain per document and moved backfill outside it with a hold buffer: fast, but per-document keys re-opened the cross-document race (drive creation and child-document creation are different keys), and the hold buffer alone produced five loss windows and one deadlock.

The defect list from both reviews, by the mechanism that caused it:

- **Overlapping passes mutate shared cursors** — F1 (cursor regressed to older batch), R-concurrent-success-overrides-park (`route()` success on doc B raises a cursor doc A just parked).
- **Routing decision interleaves with registration** — F2 (edit routed to nobody), round-2 finding 1 (child doc routed to nobody, creation pass declines to backfill).
- **Slow work under a lock** — round-1 HoL blocking, round-2 finding 10 (`exclusive()` drains behind one slow processor), round-2 finding 4 (`retire()` awaits a backfill whose `onOperations` awaits `unregisterFactory` → deadlock), R5 reentrancy.
- **Hold buffer between backfill and live** — round-2 findings 2, 3, 6, 8 (DB rejection drops held batches; `retry()` during drain reuses a failed promise; `.finally` microtask window; unhandled rejection).
- **Ordinal comparison as the dedupe** — F3 (out-of-ordinal drop), round-2 finding 7 (Postgres serial visibility gap turns a duplicate into a loss).
- **Backfill awaited in the pass's `finally`** — round-2 finding 9 (a pass reports failure after its cursor persisted).
- **Table mutation on a different key than delivery** — cut finding: `cleanupDriveProcessors` under the drive's key while another doc's pass upserts the deleted cursor row.

## 2. Design

Three rules, each of which removes a whole class above.

### Rule 1 — routing is synchronous

Every read or write of the routing tables happens in synchronous JavaScript with no `await` between reading the tables and acting on them. On a single thread that is atomic; there is no lock because there is nothing to lock.

Concretely, `commitOperations(items)` becomes:

```ts
protected override async commitOperations(items: OperationWithContext[]): Promise<void> {
  // Synchronous section: no await until the enqueue loop is done.
  const created = this.detectNewDrives(items);        // reserves slots, returns pending factory runs
  this.detectDeletedDrives(items);                     // removes tables entries, enqueues disconnects
  const deliveries = this.enqueueRouted(items);        // filter + push onto each processor's queue
  // End synchronous section.

  await Promise.all([...created.map(run => run()), ...deliveries]);
}
```

`enqueueRouted` iterates every tracked processor, applies `matchesFilter` synchronously, and pushes matching ops onto that processor's queue (§Rule 2). Nothing slow runs in the section.

Drive creation cannot call the factory inside the section — factories are user code and often run `initAndUpgrade`. Instead the section **reserves a slot**:

```ts
type PendingSlot = { factoryId; driveId; lowestRoutedOrdinal: number | undefined };
```

A pending slot is not a processor and has no filter, so routing does not deliver to it; it records the lowest ordinal of any batch routed while it was pending. When the factory resolves (off-section), `bind()` runs a second synchronous section: it creates the `TrackedProcessor`s, sets each one's start cursor to `min(startCursor, lowestRoutedOrdinal - 1)`, and inserts them into the tables. Anything routed while the slot was pending is then covered by the processor's own backfill from the operation index. This is exactly what backfill exists for; there is no buffer of held operations anywhere.

Both `ReadModelCoordinator` and `HybridProjectionCoordinator` call the same instance, so this covers both.

### Rule 2 — one delivery queue per processor

Each `TrackedProcessor` owns a serial task queue. Every interaction with the processor object goes through it, in order:

```ts
type Task =
  | { kind: "live"; ops: OperationWithContext[] }
  | { kind: "backfill"; fromOrdinal: number }
  | { kind: "retry" }
  | { kind: "disconnect" };
```

- One task runs at a time per processor. A processor never has two `onOperations` calls in flight, so there is no concurrent-success-overrides-park, no hold buffer, no drain loop, no `.finally` window.
- The queue is independent of every other processor's queue and of routing. A slow processor blocks only its own queue. `registerFactory` never waits on a delivery.
- **Cursor persistence is a step inside the task**, after a successful delivery, so it is serialized with the deliveries it describes. `disconnect` deletes the cursor row as its last step; a late upsert cannot resurrect it because it would have been an earlier task on the same queue.
- **Failure**: a `live` task whose `onOperations` throws marks the processor `errored`, sets `lastOrdinal = min(lastOrdinal, min(ops) - 1)`, persists, and logs. While `errored`, later `live` tasks do not deliver; each lowers the cursor the same way and completes. `retry` flips status to `active` and enqueues `backfill` from the cursor. Because these are all on one queue, "retry while a failed backfill is still draining" cannot happen — there is no draining, and a `retry` task runs after whatever failed.
- **Backfill task**: pages `getSinceOrdinal(fromOrdinal)` and delivers each page; advances the cursor per page. If a page read rejects, the task marks `errored` with that error (not silently `active`) and stops. Nothing is dropped: live tasks enqueued behind it are still in the queue and run next; if the processor is `errored`, they park the cursor, which is what a later `retry` replays from.
- **Disconnect task**: the terminal task; the queue accepts nothing after it. Called by `unregisterFactory` and drive deletion.

Dedupe between backfill and live (the F3 problem) uses **identity over an overlap window, not ordinal comparison**:

```ts
type Overlap = { delivered: Set<number> } | undefined;  // ordinals delivered by backfill while live tasks were queued behind it
```

When a `backfill` task starts and there are `live` tasks queued behind it (or arrive while it runs), it records each ordinal it delivers into `overlap.delivered`. Each `live` task that runs while an overlap window is open drops ops whose ordinal is in the set and delivers the rest — regardless of their ordinal relative to anything. When the queue drains to empty the window closes and the set is released. Outside a window, live ops are delivered unconditionally: routing already guarantees each WRITE_READY batch reaches the manager once, and a lower ordinal arriving later is simply delivered later. This removes the `ordinal > backfilledThrough` filter and with it F3 and the Postgres visibility loss for live delivery.

### Rule 3 — the pass awaits deliveries it caused, and nothing else

`commitOperations` awaits the `live` tasks it enqueued and the factory runs it started (including their `bind()` and the resulting `backfill` tasks). This preserves today's semantics for the coordinator and the PM's consistency tracker: when the pass resolves, matching processors have been offered the batch. It does not await unrelated work on any queue.

Because nothing is locked, a processor that calls `registerFactory` or `unregisterFactory` from inside `onOperations` cannot deadlock the manager. There is one remaining self-wait: `await manager.unregisterFactory(myOwnFactory)` from inside my own `onOperations`, if `unregisterFactory` waits for my `disconnect` task, which is behind my current `live` task. This is resolved by the API semantics in §3, not by detection.

Implications for the coordinator: PM pass latency is now "slowest matching processor for this batch", the same as before the branch, and never "any registration in progress" or "any other document's processor". Round-1's bench (busy-wait processor) could not observe this; the round-2 bench (`setTimeout` processor, direct `indexOperations`, concurrent re-register case) can and should be re-run against this design.

## 3. Public API and contract

`IProcessor` is unchanged: `onOperations(ops)`, `onDisconnect()`.

`IProcessorManager` signatures are unchanged. Two documented semantics change:

- **`registerFactory(id, factory)`** resolves once every factory run for existing drives has completed and their processors are bound. It does **not** wait for the resulting backfills — those run on the processors' queues. Callers who need "backfill done" wait on the consistency tracker or on `getAll()` cursors, as tests already do. Today's contract says "resolves once their backfills have run"; that clause goes.
- **`unregisterFactory(id)`** resolves once the factory is removed from the registry and its processors are removed from the routing tables — no new deliveries will reach them. In-flight deliveries finish on their own queues and `onDisconnect` runs after them. This is what makes unregister-from-inside-`onOperations` safe, and it removes the reentrancy precondition added in round 2 (`reentrantCall`, `inCallback`, the `IProcessorManager` doc block about the lock) entirely. reactor-api's hot-reload sequence (`server.ts:592-611`, unregister then register) is unaffected: the old processors are out of the tables before the new factory is registered, so no batch reaches both.

`TrackedProcessor.retry()` enqueues a `retry` task and resolves when the resulting backfill task completes. It is safe from anywhere, including a callback (it waits on the queue behind the caller only if the caller is that same processor's `onOperations`, which is a self-wait — document it as such, same as today's `unregisterFactory` case).

Delivery contract on `IProcessor.onOperations` (replaces the round-2 wording):

> Delivery is at-least-once: a processor may see an operation again after a restart or a retry. Within one document's scope and branch, operations arrive in ordinal order. Across documents there is no ordering guarantee. A processor receives one `onOperations` call at a time; the next call begins after the previous resolves.

The last sentence is new and strictly stronger than today. The crash-window caveat (a crash between two concurrently projected documents after the higher cursor persisted can leave lower ordinals unreplayed) is unchanged and is addressed in Phase 3.

## 4. What is kept from the branch

- All red-first tests from both rounds: U1/U2/U3, the R1/R2/R3/R5 tests, I1. Some assert mechanisms that no longer exist (`factoryCallCount === 0` mid-flight; the reentrancy rejection) and are rewritten to assert the outcome the mechanism protected: U2 becomes "child/edit ops routed during drive creation are delivered exactly once"; the reentrancy test becomes "`unregisterFactory` of my own factory from inside `onOperations` resolves, and `onDisconnect` runs after the current delivery".
- Monotonic cursors in `BaseReadModel.saveState` (F1's base-layer half). The `ProcessorManager` half is subsumed by Rule 2.
- `parkBelow` semantics (cursor to `min(batch) - 1` on failure), now a queue-local step.
- `startFrom: "current"` = `creationOrdinal - 1` unconditionally, with `creationOrdinal` a required parameter.
- The rewritten bench (`bench/processor-delivery.bench.ts`) and its `BENCH_TARGETS` registration.
- Academy and `types.ts` contract text, updated to §3.

What is deleted: `keyed`, `exclusive`, `tails`, `registry`, `spawned`, `awaitSpawned`, `inCallback`, `callback()`, `reentrantCall`, `DeliveryState.pending/backfill/backfilledThrough`, `runBackfill`, `backfillThenDrain`, `retire`, `isRetired`, `route(..., fromHold)`, `parkBelow` as a standalone method, `MIXED_KEY`/`keyOf`.

## 5. Implementation plan

Same worktree, same branch, new commits on top of `70cb7ca66f`. One commit per step; every correctness step has a test that is red before and green after. Full `pnpm test` in `packages/reactor` once, alone, before reporting.

1. **`ProcessorQueue`** (`src/processors/processor-queue.ts`): serial task runner with `enqueue(task): Promise<void>`, `close()` (accepts a terminal task, rejects later enqueues), the overlap window, and failure/park handling. Unit tests with a stub processor: ordering, one-at-a-time, failure parks and skips, retry replays from cursor, backfill page rejection marks errored and keeps queued lives, overlap dedupe by identity (including a lower ordinal arriving after a higher one — the F3 shape — delivered, and a Postgres-gap shape: backfill saw 200, live 150 arrives later, delivered), disconnect is terminal and deletes the cursor last. Cursor persistence injected as a function so the queue is testable without PGlite.
2. **Synchronous routing + pending slots**: rewrite `commitOperations`, `detectNewDrives` (reserve slot, return factory runner), `bind()`, `detectDeletedDrives`, `enqueueRouted`. Add a lint-style guard test: a test double that throws if any routing-table method is entered while another is suspended at an `await` (a simple re-entrancy counter around the synchronous section). Red test: round-2 finding 1 (drive D create at N+1 and child C create at N+2 on different keys, `["*"]` filter, C delivered exactly once).
3. **`registerFactory`/`unregisterFactory` per §3**: synchronous table mutation, factory runs off-section, `disconnect` tasks enqueued. Red tests: unregister-from-inside-own-`onOperations` resolves and disconnects after; deleted drive's cursor row is not resurrected by a concurrent pass (cut finding); `retry()` on a retired processor is a no-op (cut finding).
4. **Wire cursor persistence into the queue**; delete `saveProcessorCursor` calls from the manager body. Red test: concurrent success on a sibling document does not override a park (round-2 finding 5) — with one queue per processor this is structurally impossible, so the test is the sequential shape plus an assertion that the queue's in-flight count never exceeds 1 under a `["*"]` filter with two documents' batches.
5. **Delete the round-2 machinery** listed in §4. `pnpm tsc --build` must be clean; the reentrancy doc block on `IProcessorManager` goes.
6. **Contract text**: `packages/shared/processors/types.ts` and the academy Ordering/current/backfill/failure paragraphs to §3.
7. **Rewrite the tests that asserted mechanisms** (§4) to assert outcomes; keep every other test as is.
8. **Bench**: re-run `bench/processor-delivery.bench.ts` interleaved ×5 against `56215ed9d1` (fully unlocked), `797af742b9` (global lock), and `70cb7ca66f` (round 2). Expected: no-op and 2 ms cases at parity with unlocked; concurrent re-register case at parity with unlocked (registration no longer waits on passes). If the re-register case is not at parity, find out why before reporting.
9. **Review**: adversarial pass on the delta, as before.

Estimated size: `processor-manager.ts` shrinks (778 → roughly 450 lines) plus a ~200-line queue module and its tests.

## 6. Migration

### 6.1 Processor authors: nothing to rewrite

The redesign is internal to `ProcessorManager`. Every `IProcessor` implementation in the monorepo keeps compiling and behaving:

| implementer | location | affected |
|---|---|---|
| `DriveAnalyticsProcessor`, `DocumentAnalyticsProcessor` | `packages/shared/processors/drive-analytics/` | no |
| `RelationalDbProcessor` (abstract base) and every codegen'd relational processor | `packages/shared/processors/relational/types.ts`, `packages/codegen/src/templates/processors/relational-db/processor.ts` | no |
| analytics codegen template | `packages/codegen/src/templates/processors/analytics/processor.ts` | no |
| `VetraReadModelProcessor`, vetra codegen processor | `packages/vetra/processors/` | no |
| Connect OpenPanel processor | `apps/connect/src/services/openpanel/processor.ts` | no |
| every published Vetra package / recipe processor | external | no |

The new contract is stronger, not weaker, on the one axis a processor could depend on: one `onOperations` call at a time. The two axes the contract already denied (cross-document ordering, exactly-once) were never guaranteed by the pre-branch code either — round-1's review confirmed that cross-document out-of-order arrival happens today whenever two documents' batches race, and restart replay has always redelivered. A processor that has been correct in production is correct under this design. A processor that silently assumed cross-document ordinal order was already wrong intermittently; the academy text now says so and points at `context.ordinal` for authors who need to sort within a batch.

Codegen templates are not touched: they emit `onOperations`/`onDisconnect` stubs only.

### 6.2 Host callers: one behavioral change to check

| caller | call | change |
|---|---|---|
| `packages/reactor-api/src/server.ts:592-611, 1139` | `unregisterFactory` then `registerFactory` on package reload | `registerFactory` no longer waits for backfills. The reload handler does nothing with the resolved promise except continue, so no code change. Startup at `:1139` likewise. |
| `apps/connect/src/components/openpanel.tsx:99-138` | register on mount, unregister on teardown | none — the teardown guard already handles an in-flight register. |
| `apps/connect/src/store/reactor.ts:578` | `registerFactory` per package | none. |
| `apps/connect/src/reactor.worker.ts:522`, `InspectorModal/useProcessorsInspector.ts:51` | `tracked.retry()` | none — still resolves when the replay completes. |

Anyone who awaited `registerFactory` as a "backfill done" barrier must switch to the processor manager's consistency tracker (`ReactorModule.processorManagerConsistencyTracker`) or poll `getAll()` cursors. A repo-wide grep found no such caller outside tests; the tests that did are rewritten in step 7.

### 6.3 Persisted state: no schema migration

`ProcessorCursor` (migration 014) keeps its shape: `lastOrdinal`, `status`, `lastError`, `lastErrorTimestamp`. Semantics of `lastOrdinal` are unchanged (high-water mark a restart replays from; lowered on failure). `backfilledThrough` was never persisted. The overlap set is in-memory per queue. A reactor upgraded in place resumes each processor from its stored cursor exactly as today. No `down` needed.

### 6.4 Rollout

1. Land on `main` behind no flag — there is no coherent half-state between the two concurrency models, and the branch's tests are the guard.
2. Switchboard and Connect pick it up on their next `@powerhousedao/reactor` bump. Vetra packages need no republish.
3. Watch for two signals in the first deploys: `errored` processors whose `lastError` is a DB read error (new: backfill page rejection now surfaces as `errored` instead of silently continuing), and `READ_READY` latency on the coordinator (should drop relative to round 1/2, match pre-branch).

### 6.5 If a processor turns out to depend on cross-document ordering

Not expected (§6.1), but the escape hatch is cheap and does not require a rewrite: sort the batch by `context.ordinal` at the top of `onOperations`. Ordering *across* batches was never available. If such a processor also needs to see document B's creation before document A's reference to it, it needs a read model that can look B up (the relational store it already writes to), not an ordering guarantee — the academy "Processor best practices" page gets a paragraph on this in step 6.

## 7. Phase 3 (separate PR): the crash window and the Postgres visibility gap

Two findings survive any in-memory design and are out of scope here; recorded so they are not lost.

**Crash between concurrently projected documents.** Key A's batch [3] persists `ViewState=3` while key B's [1,2] is still queued; the process dies; `init()` replays from 3. This is the `BaseReadModel` high-water cursor, shared by every read model, and predates the branch. Fix: persist a low-water companion (`min` ordinal of any batch enqueued but not yet committed, minus one) alongside `lastOrdinal` in `ViewState` and in `ProcessorCursor`, and replay from it on `init()`. Needs a migration (add column, default = `lastOrdinal`) and the coordinator to tell read models what is in flight. At-least-once tolerates the resulting redelivery.

**Postgres serial visibility.** `ordinal` is a `serial` allocated inside the job transaction; worker A's 150 can become visible after worker B's 200. A backfill page that ends at 200 with the cursor persisted there never sees 150 on restart. Rule 2's identity dedupe fixes the *live* path (150 arriving later is delivered), but the restart path needs the operation index to expose a contiguity bound — "every ordinal ≤ X is committed and visible" — and read models to checkpoint against that instead of the max they observed. That is an `IOperationIndex` change (`reactor-attachments` already tracks a `contiguousEnd` for its own stream and is the model to follow). Not reachable on PGlite; needs a Postgres test.

## 8. Rejected

- **Third patch round on the round-2 design.** Two rounds of the same shape; the hold buffer is the problem, not any one window in it.
- **Global fast lock as an async mutex.** Once nothing slow is inside it, a synchronous section is the same thing with no primitive and no reentrancy question.
- **Buffering routed operations for pending slots.** Unbounded; the operation index already holds them and backfill already replays them.
- **Reorder buffer / contiguity wait for live delivery.** Ordinals have permanent gaps (rolled-back transactions); it stalls forever. Rejected in round 1, still rejected.
- **Moving the mutex into `BaseReadModel` or the coordinator.** The redesign needs no mutex, so there is nothing to hoist. The other read models with cross-pass state (attachments) keep their own approach until Phase 3 looks at the base class.
- **Changing the coordinator's key to `documentId:branch` or a global post-ready chain.** Same-document-only, or serializes every post-ready read model for one that no longer needs it.
- **A feature flag for the new manager.** Two managers cannot share cursor semantics safely, and the flag would double the test matrix for a component whose whole point is the invariant.
