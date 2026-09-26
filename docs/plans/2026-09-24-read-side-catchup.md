# Plan: Read-side catch-up for committed operations

Date: 2026-09-24
Status: implemented on feat/read-side-catchup (stages 1 to 7); bench records before and after not taken
Runs alongside: [Peer protocol agreement](2026-09-25-peer-protocol-agreement.md)
Lands before: [Document erasure](2026-09-24-document-erasure.md)

## Overview

A job's operations become durable when its transaction commits the operation
index rows. Everything that tells the read side about them afterwards is in
memory: the worker's result message, the host's `JOB_WRITE_READY`, the read
model coordinator's chains, the projection shard's routing, the group
re-evaluation trigger and the sync outbox. When a hop loses an event, the
operations are stored but a consumer never applies them.

Every consumer's cursor is a high-water mark over the global ordinal. Once a
later ordinal is applied, the lost one sits below the cursor and is never
replayed, not even after a restart. Concurrent transactions cause the same
loss with no event lost: a lower ordinal can commit after a higher one, and
the sync outbox steps over it for good.

From a high level, we propose a settled watermark that asks Postgres which
transactions are open and so knows when an ordinal gap is final, a
`ContiguousCursor` that advances only to the watermark and only over ordinals
the consumer applied, a periodic sweep that applies what the live path missed
together with the later operations of its stream, the same cursor for
processors and the group re-evaluation trigger, a sync outbox derived only up
to the watermark, and an operator command to rescan from an ordinal.

## Current behaviour

Two numbers are called an index. `Operation.index` is the dense position in a
stream `(documentId, scope, branch)`; reducers and evaluation depend on it and
this plan does not touch it. `operation_index_operations.ordinal` is a `serial`
primary key (`storage/migrations/009_create_operation_index_tables.ts:31`)
assigned by the sequence at INSERT inside the job's transaction
(`executor/execution-scope.ts:70-76`, `cache/kysely-operation-index.ts:270-281`).
It is the global order that read models, processors and sync use as their
cursor, and it is not dense:

```
permanent gap   a transaction took an ordinal and rolled back; sequences do not roll back
transient gap   a transaction took an ordinal and has not committed; a higher ordinal is visible
per stream      ordinals commit in order: the queue never runs two jobs of one document at once
                (queue/queue.ts:79-82, 267, 326)
```

Transient gaps need concurrent write transactions: executor workers, or
`executorConfig.maxConcurrency > 1` in process (`core/reactor-builder.ts:747,
785`). The PGlite driver hands out one connection at a time
(`kysely-pglite-dialect` 1.2.0, `acquireConnection`), so PGlite has permanent
gaps only.

| Hop after commit | Where | Lost when |
|---|---|---|
| Worker result | `executor/worker/run-worker.ts:229-255` | The worker exits before `post`. The retry reloads the committed writes and emits them (`simple-job-executor.ts:453-482, 557-653`, PR #3088). |
| Host `JOB_WRITE_READY` | `simple-job-executor.ts:308-320`; `worker-pool-job-executor-manager.ts:347-401` | Fire-and-forget; lost with the process. |
| Coordinator chains | `read-models/coordinator.ts:99-205` | In memory, parallel per `documentId:scope:branch` (`:253-256`). A model that throws is logged (`:156-162, 188-194`), not retried. |
| Projection shard | `projection/projection-shard-manager.ts:442-510, 721-760` | Dropped while not ready; in-flight jobs abandoned on exit. |
| Group trigger | `core/group-reevaluation-trigger.ts:36-127` | No cursor. Referencer and enqueue failures are logged and dropped (`:79-85, 119-124`). |

| Cursor | Stored | Advanced to |
|---|---|---|
| `BaseReadModel` | `ViewState.lastOrdinal` (migration 008) | `max(lastOrdinal, batch max)` (`read-models/base-read-model.ts:242-261`); `init` replays `getSinceOrdinal(lastOrdinal)` (`:101-120`) |
| Processors | `ProcessorCursor.lastOrdinal` (014) | highest delivered, or the `through` of a batch with nothing for it (`processors/processor-queue.ts:200-229, 319-325`; `processor-manager.ts:258`) |
| Sync, in memory | `Mailbox.latestOrdinal` | highest ordinal derived (`sync/mailbox.ts:74-76, 94-100`; `sync-manager.ts:1445`) |
| Sync, stored (client) | `sync_cursors` outbox row | highest applied ordinal of removed items (`sync/channels/gql-req-channel.ts:175-194`); re-derived at startup only when above 0 (`sync-manager.ts:263-287`) |
| Group trigger | none | |

Parallel chains let a higher batch be indexed while a lower one waits in
another chain; a crash in between loses the lower one, as
`shared/processors/types.ts:73-75` documents. `BaseReadModel` parks its stored
cursor below a chunk it failed to commit (`base-read-model.ts:78-83, 313-356`),
but only a later pass that commits the same ordinal lifts the park, and only
the boot replay makes one. The response channel already holds its stored
cursor below the lowest unserved item (`gql-res-channel.ts:192-248`); the
request channel does not.

The event bus calls every subscriber even when one throws
(`events/event-bus.ts:41-62`), so sync loses operations only through
concurrency and restarts.
The transient gap, through `processCompleteBatch` (`sync-manager.ts:818-822`)
and `deriveOutbox` (`:1290-1446`):

```
worker 1   job A (doc X, collection C) takes ordinal 10, still open
worker 2   job B (doc Y, collection C) takes ordinal 11, commits
host       B's batch: deriveOutbox from latestOrdinal 9; find(C, 9) sees 11 only -> latestOrdinal 11
worker 1   A commits 10
host       A's batch: deriveOutbox from 11; find(C, 11) is empty -> 10 is never sent
```

`AttachmentReferenceReadModel` keeps a contiguous cursor: it serialises
batches, loads the gap from the index when a batch is not contiguous, and saves
the end of the contiguous run (`reactor-attachments/src/read-models/attachment-reference/attachment-reference-read-model.ts:122-211, 248-268`).
It cannot tell a permanent gap from a transient one, so a rolled-back ordinal
parks it for good; `replayedThrough` only bounds each replay (`:34-42, 231-246`).

## Design

### The settled watermark

```ts
export interface ISettledWatermark {
  /** Every ordinal at or below this is visible in the index or will never exist. */
  readonly settledThrough: number;
  /** Takes a probe, coalesced with one in flight; resolves with settledThrough after it. */
  refresh(signal?: AbortSignal): Promise<number>;
  onAdvance(listener: (settledThrough: number) => void): Unsubscribe;
  status(): { head: number; settledThrough: number; waitingOn: string[]; stalledSinceUtcMs?: number };
}
```

A gap has no row, so nothing stored names the transaction that made it. The
rule relates allocated ordinals to a snapshot by fixing the order in which a
transaction takes its xid and its ordinals.

```ts
// KyselyOperationIndex.executeCommit, before the first insert into operation_index_operations
if (operations.length > 0) await sql`select pg_current_xact_id()`.execute(trx);
```

```sql
-- A probe: two statements through the reactor's own Kysely instance, in this order.
select coalesce(pg_sequence_last_value($1::regclass), 0) as head;
select pg_current_snapshot()::text as snapshot,
       pg_current_xact_id_if_assigned() is null as outside_write;
-- $1 = pg_get_serial_sequence('reactor.operation_index_operations', 'ordinal'), resolved at start
```

```
T takes ordinal g        xid(T) assigned before nextval returns g
probe reads head >= g    nextval(g) happened before statement 1
statement 2 after 1      xid(T) < snapshot.xmax: T has ended, or T is in snapshot.xip
=> once no xid in that xip is open, T committed (g visible to any later read) or aborted
   (g never exists), for every g <= head
```

```ts
type Probe = { head: number; openMax: bigint | null };   // highest xid in xip; null when empty

// After each probe, with its snapshot's xmin: every pending probe P with
//   P.openMax === null || xmin > P.openMax
// settles, and settledThrough = max(settledThrough, P.head). A probe with an empty xip settles
// itself. At most 64 probes pend; dropping one only delays settlement.
```

`xmin > openMax` holds exactly when no transaction listed at the probe is still
open: an open xid below the probe's `xmax` was open at the probe, so it is
listed. Only transactions holding an xid, those that have written, hold the
watermark. A probe with `outside_write` false ran inside another session's
write transaction on a shared connection; it is discarded and logged once.

```
server_version_num >= 130000   pg_current_snapshot, pg_current_xact_id, pg_current_xact_id_if_assigned
100000 .. 129999               txid_current_snapshot, txid_current, txid_current_if_assigned
< 100000                       refused at start (pg_sequence_last_value needs 10)
pinned                         postgres 16.1 (docker-compose*.yml), 16-alpine and 17-alpine (CI);
                               PGlite 0.3.15 is PostgreSQL 17.5 (server_version_num 170005)
```

There is no PGlite branch. The probe goes through the reactor's Kysely
instance, whose PGlite driver serialises connections, so it never runs while an
executor transaction is open; its `xip` is empty and it settles its own head.
A rolled-back ordinal passes on the next probe. The watermark is not persisted;
it reaches the head on the first probe that settles.

### Contiguous cursors

`appliedThrough` replaces the high-water mark: everything at or below it that
is present in the index has been applied. It never exceeds `settledThrough`.

```ts
/** In memory, per consumer; tracks ordinals above appliedThrough only. */
export interface ContiguousCursor {
  appliedThrough: number;
  /** Ordinals the caller must apply. At or below the cursor, or held by another path: dropped. */
  claim(ordinals: Iterable<number>): Set<number>;
  /** Releases claims; committed ones join the applied set. Past `limit` entries the set is
   *  cleared and the next sweep re-applies its whole range once. */
  settle(ordinals: Iterable<number>, committed: boolean): void;
  /** Present ordinals in (appliedThrough, settled] no path has claimed or applied. */
  missing(present: readonly number[]): number[];
  /** settled, held below the lowest claimed and the lowest unapplied present ordinal. */
  target(settled: number, present: readonly number[]): number;
  advance(to: number): void;   // prunes the sets
}
```

- **Live.** A batch is claimed, applied, settled. The live path never writes
  the cursor.
- **Sweep.** Each tick, the present ordinals in `(appliedThrough,
  settledThrough]` that no path applied are late; they are fetched and applied,
  and the cursor moves to `target`.
- **Boot.** `init` replays `getSinceOrdinal(appliedThrough)` in order, as
  today. After each page the cursor moves to `min(settledAtBoot, page max)`,
  with `settledAtBoot` refreshed before the first page: the replay saw every
  visible row, and an ordinal at or below `settledAtBoot` that is not visible
  never will be. Rows above it are claimed like live ones. A chunk that throws
  ends the replay; the cursor stays below it and sweeps continue from there.

A late operation can arrive after later operations of its stream were applied
live. For consumers whose writes do not commute, the sweep applies it with
every later visible operation of the stream, in order, in one commit.

```ts
// BaseReadModel.sweep
const range = present.filter((o) => o > cursor.appliedThrough && o <= settled);
const mine = cursor.claim(cursor.missing(range));
const late = await index.getByOrdinals([...mine]);             // rows gone since the scan are absent
cursor.settle(absentFrom(mine, late), true);
for (const group of groupByStream(late)) {                      // one commit per stream, never chunked
  if (config.replayStreamSuffix ?? true) group.add(await index.getStreamAfter(group.stream, group.lowest));
  const owned = group.ordinals.filter((o) => mine.has(o));
  try {
    const items = config.rebuildStateOnInit ? await this.rebuildStateForOperations(group.items) : group.items;
    await this.commitOperations(items);
    cursor.settle(owned, true);
    this.updateConsistencyTracker(items);
  } catch (error) {
    cursor.settle(owned, false);                                // retried next tick
    blockedAt ??= describe(group.items[0], error);
  }
}
const to = cursor.target(settled, range);
if (to > cursor.appliedThrough) await this.writeCursor(to);
```

`rebuildStateForOperations` is the existing write-cache `getState` per
operation (`base-read-model.ts:182-208`); a `DocumentNotFoundError`
(`kysely-write-cache.ts:725`) drops the operation as absent with a warning.

```sql
-- writeCursor: compare-and-set against the value this process last wrote
update "ViewState" set "lastOrdinal" = $to, "lastOperationTimestamp" = now()
where "readModelId" = $id and "lastOrdinal" = $expected;
-- 0 rows: reload; if lower, start a fresh cursor there with its applied set cleared
```

```ts
interface IOperationIndex {
  /** Ordinals in (after, through], ascending, at most `limit`: an index-only primary key scan. */
  getOrdinalsInRange(after: number, through: number, limit: number, signal?: AbortSignal): Promise<number[]>;
  /** Rows for these ordinals; an ordinal whose row is gone is left out. */
  getByOrdinals(ordinals: readonly number[], signal?: AbortSignal): Promise<OperationWithContext[]>;
  /** A stream's rows above an ordinal, ascending, through idx_operation_index_operations_document. */
  getStreamAfter(stream: StreamKey, after: number, signal?: AbortSignal): Promise<OperationWithContext[]>;
}
interface ViewFilter { throughOrdinal?: number }   // find: oi.ordinal and dc."joinedOrdinal" <= it
```

### Read models

```ts
export type BaseReadModelConfig = {
  readModelId: string;
  rebuildStateOnInit: boolean;              // now also governs sweeps
  indexing?: ReadModelIndexingConfig;
  startFrom?: "beginning" | "head";         // a first registration; default "beginning"
  replayStreamSuffix?: boolean;             // default true
};

export interface ICatchUpConsumer {
  readonly consumerId: string;
  readonly appliedThrough: number;
  sweep(settledThrough: number, present: readonly number[], signal?: AbortSignal): Promise<SweepResult>;
}

export type SweepResult = {
  consumerId: string; from: number; to: number; durationMs: number;
  replayed: number;            // late operations applied
  reapplied: number;           // later operations of their streams applied again
  blockedAt?: { ordinal: number; documentId: string; scope: string; branch: string; type: string; error: string };
};
```

`BaseReadModel` implements `ICatchUpConsumer`. `saveState`, `persistCursor`,
the park and `recordCommittedPrefix` are removed: a failed chunk releases its
claims and the next sweep retries it. `lastOrdinal` stays as a protected getter
for `appliedThrough`. A `startFrom: "head"` registration with no row inserts
one at `await watermark.refresh()` and replays nothing.

| Model | `replayStreamSuffix` | Why |
|---|---|---|
| `KyselyDocumentView` | false | every scope row is guarded by ordinal |
| `KyselyDocumentIndexer` | true | ADD and REMOVE do not commute |
| `ProcessorManager` | true | processors see streams in order |
| `NodeProcessor` (reactor-drive) | true | folder and relationship writes do not commute |
| `AttachmentReferenceReadModel` | false | insert-or-do-nothing rows (`:22-30`); its ordering, gap and `saveState` overrides go |
| `WorkflowTriggersReadModel` | true | `startFrom: "head"` replaces `freshRegistration` and its `saveState` override |

The document view guards every scope row, not only the header
(`read-models/document-view.ts:257-265, 338-341`), and both `DELETE_DOCUMENT`
updates (`:155-166, 175-180`):

```ts
if (existingSnapshot !== undefined && existingSnapshot.lastOperationOrdinal > ordinal) continue;  // any scope
.where("lastOperationOrdinal", "<=", ordinal)                                                     // every update
```

A scope row holds the whole scope state at its operation, and a document's
ordinals commit in order, so an older operation applied after a newer one
carries stale state; skipping it is exact.

The indexer's hazard, and the suffix as its guard:

```
stream D/document:  5 ADD_RELATIONSHIP(D, X)    7 REMOVE_RELATIONSHIP(D, X)
live    7 applied; 5's WRITE_READY lost          no edge (right at 7)
sweep   5 applied alone                          edge D -> X, resurrected
sweep   [5, 7] in one transaction                no edge
```

### Processors

`ProcessorCursor.lastOrdinal` becomes the processor's `appliedThrough`: every
matching operation at or below it has been delivered. The queue never raises
it past the manager's cursor, and the manager raises every queue after it
advances.

```ts
// ProcessorQueueOptions
confirmedThrough: () => number;                             // the manager's appliedThrough

// ProcessorQueue.raiseCursor (processor-queue.ts:319-325)
const capped = Math.min(through, this.options.confirmedThrough());
if (cursor.status !== "active" || capped <= cursor.lastOrdinal) return;

// ProcessorManager, after its cursor advances
for (const { queue } of this.allBound()) void queue.advance(appliedThrough);
```

Routing is synchronous (`processor-manager.ts:226-261`), so an `advance`
queued after a sweep's routing runs after its deliveries. Cursor writes use the
same compare-and-set; a lowered row resets the cursor and queues a backfill.

```
stream S:   live [7]   ...   sweep [5, 7]         the processor's calls: [7], [5, 7]
```

`dedupeQueued` (`processor-queue.ts:270-283`) still stops a backfill and a live
batch from delivering one ordinal twice in a process; the suffix is delivered
again on purpose. The contract in `shared/processors/types.ts:68-76` becomes:

```ts
/**
 * Delivery is at-least-once. Within a document's scope and branch, each call is in
 * ordinal order, and an operation delivered late comes with every later operation of its
 * stream this processor was already given. Across documents there is no ordering guarantee.
 */
```

### Group re-evaluation

The trigger keeps a `ViewState` row, `group-reevaluation-trigger`, and a
`ContiguousCursor` over membership operations. The live path is today's
`onWriteReady` (`group-reevaluation-trigger.ts:48-127`); it claims the
membership ordinals it sees and settles them committed only when every job for
them was enqueued. A failed referencer lookup or enqueue releases them.

```sql
select ordinal, "documentId", "timestampUtcMs" from reactor.operation_index_operations
where ordinal > $applied and ordinal <= $settled
  and "documentType" = 'powerhouse/reactor-group' and scope = 'global'
  and action->>'type' in ('ADD_MEMBER', 'REMOVE_MEMBER')
order by ordinal;
```

Unapplied rows are grouped as an event is: earliest timestamp per group,
referencers through `getGroupReferencers`, earliest timestamp per referencing
document, and the live path's job (`:99-116`): `kind: "reevaluation"`,
`scope: "global"`, `branch: "main"`, `meta.triggerTimestampUtcMs`. The job is
safe to repeat: it writes only where an evaluation differs from what is stored
(`simple-job-executor.ts:1849-1851`) and returns early when nothing is stored
or all history sorts before the trigger (`:1959-1989`). A first start inserts
the row at `settledThrough`. The trigger runs with `authGroups`
(`reactor-builder.ts:1024-1033`).

### Sync outbox

The outbox is derived only up to the watermark, so `latestOrdinal` never
passes a gap that may still fill. A batch refreshes the watermark first, so
with no other write open its own operations go out in the same pass.

```ts
// deriveOutbox: the find call's view argument
{ excludeSourceRemote: remote.meta.name, throughOrdinal: this.watermark.settledThrough }

// processCompleteBatch: before the remote loop, and after each remote's updateOutbox
const through = await this.watermark.refresh();
if (batchMax > through) this.owed.set(name, Math.max(this.owed.get(name) ?? 0, batchMax));

// startup: every remote is owed up to the head; derivation follows the watermark
this.settledUnsubscribe = this.watermark.onAdvance(() => void this.batchAggregator.enqueueSettled());

// on the aggregator's serial queue, between write-ready events
private async deriveSettled(): Promise<void> {
  const through = this.watermark.settledThrough;
  for (const [name, upTo] of this.owed) {
    const remote = this.remotes.get(name);
    if (!remote || this.removing.has(name)) { this.owed.delete(name); continue; }
    await this.updateOutbox(remote, remote.channel.outbox.latestOrdinal, OutboxMode.BatchTriggered);
    if (through >= upTo) this.owed.delete(name);
  }
  await this.drainPrunes();
}
```

The request channel's stored cursor stays below the lowest item the remote has
not applied, as the response channel's does:

```ts
// GqlRequestChannel, outbox.onRemoved (gql-req-channel.ts:175-194)
const ordinal = Math.min(getLatestAppliedOrdinal(syncOps), this.unappliedFloor() - 1);
private unappliedFloor(): number;   // as GqlResponseChannel.unservedFloor, gql-res-channel.ts:238-248
```

### Scheduling and placement

```ts
export type CatchUpConfig = {
  intervalMs: number;             // default 2000
  stuckWarnMs: number;            // default 60000
  maxTrackedAboveCursor: number;  // default 100000
  sweepPageSize: number;          // present ordinals read per tick; default 10000
};
```

A `CatchUpScheduler` tick refreshes the watermark, reads one page of present
ordinals from the lowest cursor (a consumer beyond that page reads its own),
and sweeps each consumer in turn; one failing does not stop the others. A tick
is skipped while the previous one runs. `ReactorBuilder.withCatchUp(config)`
configures it, the module exposes `catchUp: { status(), sweepNow() }`, the
timer runs only while there are consumers, and shutdown stops it before the
database closes.

```
thread                      watermark   swept here
host, in-process            yes         document view, indexer, caller models, processor manager, group trigger
host, hybrid (switchboard)  yes         caller models, processor manager, group trigger; bounds the outbox
projection worker           yes         its document view and indexer
executor workers            no          nothing; executeCommit takes the xid first
Connect SharedWorker        yes         as in-process, on PGlite
```

The host learns what it indexes from an optional
`IReadModelCoordinator.indexedReadModels(): readonly IReadModel[]`:
`ReadModelCoordinator` returns its pre- and post-ready models,
`HybridProjectionCoordinator` the same without `lookupOnly`,
`ProjectionShardManager` none. A custom coordinator without it gets no host
sweep, logged once.

`createProjectionShardManager` (`reactor-builder.ts:1120`) refuses
`shardCount !== 1` before `validateBuiltInKindCoverage`, with "shardCount N is
not supported: read-side catch-up keeps one cursor per read model, so
projection runs in exactly one worker (shardCount: 1)". Switchboard runs one
(`apps/switchboard/src/server.mts:728-733`); the bench host's
`N_PROJECTION_SHARDS` (`bench/host/src/main.ts:62-65, 120-121`) must be 0 or 1.

A sweep updates the consumer's consistency tracker, so a caller waiting on a
token for a late operation resolves. Host trackers for the worker's models
advance today only for jobs the host routed (`projection-shard-manager.ts:588-603`),
so the worker posts what it swept:

```ts
// host: trackersByReadModelName.get(readModelName)?.update(coordinates)
type ProjectionReadModelSweptMessage = { type: "readmodel-swept"; shardId: string; readModelName: string;
                                         coordinates: ConsistencyCoordinate[]; result: SweepResult };
// every chainDepthReportIntervalMs, for status() and metrics
type ProjectionCatchUpStatusMessage = { type: "catchup-status"; shardId: string; status: CatchUpStatus };
```

### Failures and observability

A consumer whose sweep throws holds its cursor below the first operation it
could not apply and retries it every tick; its other streams still apply.

```ts
ReactorEventTypes.CATCHUP_SWEPT = 10010;   // SweepResult, when a sweep moved, replayed or failed

type CatchUpStatus = {
  watermark: ReturnType<ISettledWatermark["status"]>;
  consumers: Array<{ consumerId: string; thread: "host" | "projection"; appliedThrough: number;
                     trackedAbove: number; blockedAt?: SweepResult["blockedAt"]; lastAdvanceUtcMs: number }>;
};
```

```
metric                              kind       unit         attributes / value
reactor.catchup.sequence_head       gauge      {ordinal}
reactor.catchup.settled_through     gauge      {ordinal}
reactor.catchup.settle_lag          gauge      {ordinal}    head - settledThrough
reactor.catchup.consumer_lag        gauge      {ordinal}    consumer, thread
reactor.catchup.sweep.duration      histogram  ms           consumer, thread
reactor.catchup.sweep.replayed      counter    {operation}  consumer, thread
reactor.catchup.sweep.failures      counter    {sweep}      consumer, thread

warn   settled watermark held at @settled (head @head) for @ms ms, waiting on xid @xids: @sessions
       (pid, application_name, state, xact_start from pg_stat_activity; Postgres only)
warn   @consumer applied @n operations its live path never received: ordinals @first..@last
error  @consumer cursor held at @applied: ordinal @ordinal (@documentId/@scope/@branch, @type) failed: @error
warn   @consumer cursor held at @applied for @ms ms (settled @settled)
info   @consumer cursor lowered externally from @old to @new; replaying
```

The error is logged once per consumer and ordinal; repeats are counted.

Metrics follow `opentelemetry-instrumentation-reactor`: gauges read
`module.catchUp.status()`, counters and the histogram subscribe to
`CATCHUP_SWEPT`.

### Operator commands

```
pnpm catchup status --pg <url> | --pglite <dir> [--schema reactor]
pnpm catchup rescan --pg <url> | --pglite <dir> [--schema reactor] --from <ordinal>
                    (--consumer <id>... | --all) [--dry-run]

status   sequence head, a probe's settled value and the sessions it waits on, and every
         ViewState and ProcessorCursor row with its lag
rescan   set "lastOrdinal" = least("lastOrdinal", $from) on the chosen ViewState and ProcessorCursor
         rows; prints old and new cursors and the rows above $from
exit     0 done, 64 usage, 68 failed (as preflight:auth, admin/preflight-options.ts:20-26)
```

`rescan` is safe while the reactor runs: its next compare-and-set fails and the
consumer replays from the lowered value. Nothing runs it automatically.

## Behaviour

| Window | Repaired by |
|---|---|
| Worker exits after commit | the retry's re-emit; the sweep if that is lost too |
| Host dies after commit | boot replay from `appliedThrough` |
| A read model throws on a live batch | released claims; the next sweep |
| Parallel chains, crash with a lower chain pending | boot replay: the cursor never passed it |
| Projection shard not ready or exited | the worker's boot replay after the host restarts it (`onShardFatal`) |
| Group referencer lookup or enqueue fails | the trigger's next sweep |
| Outbox derived past a transient gap | cannot happen: derivation stops at `settledThrough` |
| Outbox cursor stored past an unapplied item | cannot happen: held below it |

```
rolled back         settles once its xid leaves the snapshot, usually on the next probe
open, then commits  applied live; cursors wait below it, then pass it
open for minutes    settledThrough stays; consumers keep applying live batches and track them in
                    memory; cursors, sweeps and the outbox bound wait; after stuckWarnMs a warning
                    names the session. Past maxTrackedAboveCursor a consumer re-applies the range once
unrelated writer    any open write transaction in the cluster holds settlement the same way
PGlite              every gap is a rollback and passes on the next probe
```

Duplicates come from the boot replay of `(appliedThrough, previous head]`, a
live batch racing a sweep, and the stream suffix; each consumer's answer is
in the read models table, the processor contract and the re-evaluation job.

### Requirements for document erasure

1. A purged document is absent, not an error. Rows missing from
   `getByOrdinals` or `getStreamAfter` settle as absent, and a
   `DocumentNotFoundError` from `getState` drops the operation. Neither holds a
   cursor.
2. The purge marker is idempotent: applying `PURGE_DOCUMENT` again, from boot
   replay, a live race or a stream suffix, changes nothing in any consumer.
3. The marker's ordinal is above every ordinal it purges, so a suffix read of a
   purged stream returns only the marker.
4. The watermark does not read `purgedOrdinals`; a purged ordinal at or below
   `settledThrough` is absent like any other.
5. Cursor writes touch no document-keyed rows and take no fence lock; the fence
   applies to `commitOperations`.

## File ownership

Peer protocol agreement owns `touchChannel`, `AGREEMENT_FIELDS`, the
derive-time gate, holds, `backfillDocument`, receipt refusals and the create
paths. This plan touches sync only in stage 6, in these functions:

```
sync/sync-manager.ts               deriveOutbox: the find call's view argument (:1348-1354)
                                   processCompleteBatch: a refresh before the remote loop, owed marking in it
                                   startup, shutdown: one subscription each; deriveSettled: new
sync/batch-aggregator.ts           enqueueSettled: new, on the existing serial queue
sync/channels/gql-req-channel.ts   the outbox.onRemoved handler (:175-194); unappliedFloor: new
sync/sync-builder.ts               passes the watermark
```

The gate filters rows after `find` returns and this plan bounds `find`, so the
two rebase in either order. `backfillDocument` reads one document without a
cursor and does not move `latestOrdinal`; it needs no bound.

| Stage | Files |
|---|---|
| 1 | `catch-up/` (new), `cache/kysely-operation-index.ts`, `cache/operation-index-types.ts`, `storage/interfaces.ts`, `core/reactor-builder.ts`, `core/types.ts` |
| 2 | `read-models/base-read-model.ts`, `document-view.ts`, `coordinator.ts`, `interfaces.ts`; `projection/*` including `projection-worker/*`; `core/reactor-builder.ts`; reactor-attachments `attachment-reference-read-model.ts`; reactor-workflow `workflow-triggers-read-model.ts`, where another session may hold edits |
| 3 | `processors/processor-queue.ts`, `processor-manager.ts`; shared `processors/types.ts` |
| 4 | `core/group-reevaluation-trigger.ts`, `core/reactor-builder.ts` |
| 5 | tests only |
| 6 | the sync functions above |
| 7 | `admin/run-catchup.ts`, reactor `package.json`; opentelemetry-instrumentation-reactor `metrics.ts`, `instrumentation.ts`; design-system `connect/components/catch-up-inspector/`; apps/connect inspector hook |

## Where this meets anti-entropy

This plan is local durability: every operation committed to this reactor's
index reaches every local consumer and this reactor's outbox. Anti-entropy
(undo v3's resend track, `sync.anti-entropy` in peer protocol agreement)
repairs what a peer lost. They meet at the outbox cursor, which after stage 6
never passes a committed local operation that was not derived. Left for
anti-entropy: the remote's `ackOrdinal` is the highest ordinal the receiver
applied (`mailbox.ts:103-107`), and trimming by it (`gql-req-channel.ts:290-292,
339-341`) can drop an unapplied lower item; a receiver that lost what it
applied; `sinceTimestampUtcMs` on fresh channels.

## Stages

One PR per stage, in order. Each changes only the behaviour its flipped tests
name. Pinned tests use `it.fails` and become `it` in the stage that fixes
them. Stage 1 adds two helpers: `DroppingEventBus` (through `withEventBus`)
drops one job's `JOB_WRITE_READY` before any subscriber sees it, and
`holdIndexCommit(db, documentId)` installs an `AFTER INSERT` row trigger on
`operation_index_operations` that waits on an advisory lock the test holds, so
a job stops after taking its ordinal and before committing.

1. **Settled watermark.** Watermark, probe, backend selection; the xid
   statement in `executeCommit`; the three index reads and `throughOrdinal`;
   `CatchUpScheduler` with no consumers; `withCatchUp`; `module.catchUp`.
   Tests, `test/catch-up/`: `settled-watermark.unit.test.ts` "settles a probe
   with no open transaction at its own head", "holds a probe until xmin passes
   its highest open xid", "discards a probe taken inside a write transaction",
   "uses txid functions below server version 13";
   `settled-watermark.pglite.test.ts` "passes a rolled-back ordinal on the next
   probe"; `settled-watermark-postgres.test.ts` "holds below an ordinal whose
   transaction is open", "passes it once that transaction rolls back", "shows
   the row to the next read once it commits", "is held by an open write to
   another table, not by an open read-only transaction". Operation index:
   "assigns the xid before the first ordinal" (statement order through a
   recording Kysely plugin), and the new reads.
   Pins in `lost-write-ready.test.ts` (PGlite), each with one dropped
   `JOB_WRITE_READY`: P1 the document view serves the document after one
   sweep; P2 it serves it after a restart; P3 the indexer holds the
   relationship; P4 a bound processor receives the operation; P5 a processor
   bound after a restart receives it, after a later batch raised its cursor;
   P6 a membership change indexed without an event enqueues its
   re-evaluation. reactor-attachments `read-model.test.ts`: P7 the reference is
   indexed without a later batch.
   Flips: none.
2. **Read-model cursors.** `ContiguousCursor`; live, sweep and boot paths and
   compare-and-set writes in `BaseReadModel`; `startFrom`,
   `replayStreamSuffix`; the park removed; the document view guard; the
   attachment and workflow models on the base; `indexedReadModels`; the
   projection worker's scheduler and messages; the `shardCount` refusal.
   Tests: `contiguous-cursor.unit.test.ts` "drops ordinals at or below the
   cursor and ones already claimed", "holds the target below the lowest
   claimed and unapplied ordinal", "re-applies the range once after overflow";
   `base-read-model/catch-up.test.ts` "applies a late operation with the later
   operations of its stream in one transaction", "does not pass an ordinal a
   live batch holds", "retries a failed late operation next tick", "settles a
   vanished row as absent", "moves the cursor page by page in boot replay",
   "starts a head registration at the watermark", "replays from a cursor
   lowered externally"; document view "never rolls a scope back for an older
   duplicate", "keeps a document deleted when an older operation is replayed";
   indexer "keeps a relationship removed when the add is swept after the
   remove"; "resolves a token for an operation only a sweep applied", in
   process and in `hybrid-projection-worker-postgres.test.ts`; builder
   "refuses shardCount 2".
   Rewritten: in `base-read-model/integration.test.ts`, "advances the stored
   ordinal only once the whole batch is committed" becomes "... only in a
   sweep", and the two park cases ("parks the cursor at the last committed
   operation when a chunk fails", "never advances the cursor past an operation
   it failed to commit") become sweep-retry cases. The attachment model's gap
   cases from "fills internal gaps across pages" to "warns when the cursor
   parks short of the delivered maximum" go with `replayedThrough`, except
   "catches up across a permanent hole on init instead of throwing".
   Flips: P1, P2, P3, P4, P7.
3. **Processor cursors.** `confirmedThrough`, the capped `raiseCursor`, the
   manager's advance, compare-and-set `ProcessorCursor` writes, the contract.
   Tests: queue "never raises the cursor past the manager's"; manager
   "advances every bound processor after a sweep", "delivers a late operation
   followed by the later operations of its stream", "backfills from below an
   operation the processor was never given, after a restart".
   Flips: P5.
4. **Group re-evaluation cursor.** The row, cursor, scan and registration.
   Tests: "enqueues for a membership change only the sweep found", "does not
   enqueue again for a change the live path enqueued", "holds its cursor below
   a change whose referencers could not be read", "starts at the watermark".
   Flips: P6.
5. **Pinned sync transient gap.** `sync/outbox-transient-gap-postgres.test.ts`,
   `it.fails` "sends a lower ordinal that commits after a higher one": two real
   executor workers (`withWorkerPool`, a `WorkerFactory` over
   `test/executor/worker/entry/worker-bootstrap.mjs`); a drive collection
   synced to a `TestChannel` remote; `holdIndexCommit` stops job A (document X)
   after it takes its ordinal; job B (document Y) commits; the test waits for
   B's outbox item and `latestOrdinal` at B's ordinal, releases A, waits for
   A's `READ_READY`, and expects A's operation at the remote within 5 s. A twin
   runs in process with `executorConfig.maxConcurrency: 2`.
   Flips: none.
6. **Sync on the watermark.** Bounded derivation, the refresh, owed remotes,
   `deriveSettled`, the request channel's floor.
   Tests: "does not store an outbox cursor above an unapplied lower item",
   "derives an owed remote when the watermark advances without a batch",
   "derives a remote whose stored ack is 0 after the first settle", "derives a
   batch in its own pass when no other write is open".
   Flips: both stage 5 tests.
7. **Operator tools and observability.** `pnpm catchup`, `CATCHUP_SWEPT`,
   metrics, logs, `catchup-status` into host status, the Connect inspector.
   Tests: arguments and exit codes; `rescan --dry-run` counts; `rescan` on a
   running reactor replays through the failed compare-and-set; `status` names
   the session holding the watermark (Postgres); the seven metrics; the
   inspector over a fixed `CatchUpStatus`.
   Flips: none.

Stages 1 and 2 are serial. Stages 3, 4 and 5 can be developed in parallel
once stage 2 fixes `ContiguousCursor` and `ICatchUpConsumer`; stage 5 needs
only `holdIndexCommit` and can start alongside stage 1. Stage 6 follows 5.
Stage 7 is last; its command can start after stage 2.

## Migration

- Schema: none. The xid rule needs no table. `ViewState.lastOrdinal` and
  `ProcessorCursor.lastOrdinal` keep their integer columns and now mean
  `appliedThrough`.
- First boot after stages 2 to 4: each stored value is taken as
  `appliedThrough`. Gaps already below it stay unapplied until an operator runs
  `pnpm catchup rescan`. The group trigger's first row starts at the watermark.
- Downgrade: older code reads `appliedThrough` as a high-water mark at or
  below the one it would have written, and replays the difference.

## Test strategy

- **Unit.** `settle` over table cases; `ContiguousCursor`; the processor
  queue cap; the group trigger's grouping.
- **PGlite integration.** P1 to P7, each with the emit killed by
  `DroppingEventBus` and each checked after a sweep and after a restart;
  rolled-back gaps passing on the next probe; duplicate delivery for the
  document view, indexer and processors from boot replay, a live batch racing
  a sweep, and the suffix; purged-as-absent through a row deleted between the
  scan and the fetch and a `getState` that throws `DocumentNotFoundError`.
- **Real Postgres.** Files named `*-postgres.test.ts` against
  `REACTOR_TEST_PG_URL` (default `localhost:5433`, `packages/reactor/docker-compose.yml`;
  CI `postgres:16-alpine`, `.github/workflows/check-pr-reactor.yml:46-60`): a
  long-open transaction that took an ordinal holds the watermark and is applied
  when it commits, never mistaken for a rollback; the same transaction rolled
  back passes; the transient gap with two real workers; the projection
  worker's sweep and token relay.
- **Neutrality.** Every existing suite green at every stage, except the tests
  a stage names as rewritten.
- **Bench.** Record `events` and `sync` before and after stages 2 and 6.
  Steady state adds, per thread and tick, one probe (two statements) and one
  index-only primary key range scan returning the ordinals committed since the
  last tick; per consumer and tick, one cursor update where today each batch
  writes one; per index commit, one `pg_current_xact_id()`; per sync batch,
  one probe. Rebuilding `resultingState` costs one write-cache `getState` per
  late or re-applied operation: a cache hit at the head, otherwise the nearest
  keyframe plus at most `keyframeInterval` reducer steps.

## Decisions

1. **Settle a gap by asking Postgres which transactions are open.** A time
   bound must exceed the longest transaction, which nothing bounds, and a
   wrong guess loses an operation silently. A snapshot says exactly which
   transactions can still commit.
2. **Relate ordinals to transactions by allocation order, not a recorded
   xid.** A gap has no row, and a row the allocating transaction writes rolls
   back with it, so a recorded xid cannot describe the gap it leaves. Taking
   the xid before the first `nextval` makes every ordinal at or below a probe's
   head belong to a transaction that its snapshot lists or that has ended.
   Without the explicit statement, a transaction whose first write is the index
   insert evaluates `nextval` before it has an xid. The cost is one statement
   per index commit and two per probe.
3. **No PGlite branch.** PGlite's probe snapshot is always empty, so the same
   rule settles every gap at once. A second rule would be a second thing to
   keep correct.
4. **Boot trusts existing high-water cursors.** A safe starting point would
   otherwise need a full rescan of every consumer on upgrade. Gaps already
   buried stay lost unless an operator rescans.
5. **The rescan is an explicit command.** Replaying from an old ordinal can
   mean hours of document view rebuilds, and only an operator knows whether a
   store was affected.
6. **The worker-pool sync transient gap is in scope,** pinned by a two-worker
   reproduction and fixed by deriving up to the watermark.
7. **One projection shard.** `ViewState` has one row per read model, and one
   contiguous cursor cannot serve shards that each see part of the stream.
   Per-shard rows need a migration and a merge rule for re-sharding.
8. **The group trigger's cursor is part of this feature.** A lost membership
   event leaves authorization unevaluated, the most serious loss here. It
   starts at the watermark because it has no history to trust, and replaying
   every historical change would re-judge every referencing document.
9. **The document view guard ships with the first sweep.** The first sweep and
   boot replay are the first sources of out-of-order duplicates at scale;
   without the guard a replay rolls a scope back.
10. **Repair in the sweep, not the live path.** The attachment model's live
    merge needs a serial queue per model and an index read for every batch that
    is not contiguous. The coordinator runs chains in parallel on purpose; the
    live path stays as it is and the sweep repairs a loss within a tick.
11. **The stream suffix is the ordering guard.** Per-model tombstones would add
    a migration and a guard to every non-commutative model, third-party
    processors included. Re-applying the rest of a late operation's stream
    gives all of them the same guarantee.
12. **Cursors move only in sweeps, by compare-and-set.** A per-batch write
    cannot know the batch is contiguous. Compare-and-set lets a rescan run
    while the reactor is up.
13. **Live duplicates at or below the cursor are dropped.** Nothing at or below
    `settledThrough` can still commit, and a restart ends every transaction
    below a trusted cursor, so such an operation was applied.
14. **No feature flag.** The old path loses operations, both meanings fit one
    column, and reverting a stage is safe. A flag would keep two cursor
    implementations in `BaseReadModel`.
15. **A settled derivation does not wait for pending batches.** Waiting would
    stall the outbox behind a sibling whose event was lost. It uses
    `BatchTriggered`, which chains every item it derives: a superset of the
    per-document chains `Backfill` mode sends at startup and on remote add.
16. **The request channel's stored cursor stays below unapplied items.** Items
    for different documents apply out of order, so the highest applied ordinal
    passes one still in flight, and a restart would skip it.
17. **The watermark is not persisted.** The first probe recomputes it, and a
    stored value could be trusted only after the same check.
18. **Job status and subscription notifications are out of scope.** The
    in-memory job tracker learns `WRITE_READY` only from the event
    (`job-tracker/in-memory-job-tracker.ts:32-40, 61-66`), so a job whose event
    was lost stays `RUNNING` there, and notifications are live-only. Neither is
    a durable consumer.
19. **Consistency tokens keep their per-stream high-water rule.** A token can
    resolve before a lost lower operation of its stream is swept. Exact
    per-stream contiguity would need per-stream state in every tracker; the
    sweep closes the window within a tick.
