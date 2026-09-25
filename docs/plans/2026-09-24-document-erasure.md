# Plan: Document erasure and subject disclosure (GDPR)

Date: 2026-09-24 (revised 2026-09-25 against `main` at 6b463bad3a)
Replaces: the 2026-09-23 document erasure plan, whose purge ran outside the
operation log
Status: draft for implementation, not started. Written for agents
implementing from `main`. Every stage names its exit tests; a stage is not
done until they pass against a real Postgres. Paths are relative to
`packages/reactor/src` unless stated.

## Motivation

A deployer of the Reactor is a GDPR controller. Two obligations have to be
possible: list what is held about a person, and erase it. Today neither is.
`DELETE_DOCUMENT` sets `DocumentSnapshot.isDeleted` and removes a slug;
every operation, keyframe and snapshot stays, on every peer, forever. There
is no index from a person to the documents that mention them.

Erasure in an append-only, multi-peer, event-sourced system has one honest
shape: erase whole documents. Rewriting operations in place is not an
option: grant principals, condition literals and group members live in
signed `action.input`, and the v2 signature preimage binds `input` and
`signer.user` (`packages/shared/document-model/action-signature.ts:18-31`),
so redacting either voids the signature. Authorization replay reads
`signer.user.address` as the live subject (`decision/evaluation.ts:47-50`),
so nulling it flips a subject's own history to denied. What remains is a
hard delete that survives sync.

A hard delete kept beside the log would need its own journal and cursor so
read models learn of it, a gate on peer convergence so peers learn of the
deletion before the history disappears, per-insert guards against payloads
still in flight, and it could never reach a browser replica. This spec puts
the purge **in** the log instead.

## Overview

A purge is a document-scope operation, `PURGE_DOCUMENT`, that becomes the
document's only operation. Executing it deletes every row about the document
from every table in the reactor schema, writes the marker as the sole
surviving operation at a fresh ordinal, and keeps (and reopens) the
document's collection memberships so the marker is served to every remote
that ever held the document. Peers receive it through ordinary sync, admit
it through signature admission, execute the same purge on a dedicated path
that bypasses reshuffle and the decision models, and end up with the same
marker. Read models and processors receive it in the stream they already
consume and delete their own rows. Admission has one choke point: the
operation store refuses any append to a stream whose head is a marker.

The marker is the tombstone. It is permanent, it replicates, it is signed
by the purging host, and it carries no personal data.

Erasure is scheduled, not interactive. A request marks deleted documents for
erasure; a background job purges each one once every remote has received its
`DELETE_DOCUMENT`, or when a deadline passes, whichever is first. Peers that
were connected inside the window converge on "deleted" before the history
disappears; the rest receive the marker, which implies deletion.

Disclosure is a read model mapping a keyed hash of an identifier to the
documents it appears in. It answers the access request; the controller
decides which documents to erase.

## Decisions

1. **Erasure unit is the document.** No operation is rewritten. Signatures,
   state hashes and authorization replay are untouched. The costs are
   stated under Limits.
2. **The purge is an operation in the log.** One ordered stream already
   reaches every read model, processor, projection shard and peer, with
   cursors and catch-up. Putting the purge anywhere else means rebuilding
   that delivery: a journal, a second cursor per model, a fan-out through
   the coordinators and projection shards, and a gate on peer convergence.
3. **The marker replicates and implies deletion.** After a purge the
   purging peer cannot serve the `DELETE_DOCUMENT` any more, so a peer that
   missed it can only ever receive the marker. A marker for a live document
   is therefore applied as delete-then-purge. The scheduling window makes
   this rare; signature admission plus the host's push authorization make
   it safe (see Security).
4. **One admission choke point.** `IOperationStore.apply` refuses an append
   to a purged stream. Every source write goes through `apply` and the
   operation-index commit (`storage/kysely/store.ts:238, 363`;
   `cache/kysely-operation-index.ts:273`), so no per-site check is needed.
   After a purge the deleted operation ids are no longer live, so the
   live-id checks of signature admission no longer catch a replayed old
   operation; the tombstone is the replay guard for a purged document.
   Storage-layer interfaces may change for this; `IReactor`,
   `IReactorClient`, `IReadModel`, `IReadModelCoordinator` and `IProcessor`
   do not.
5. **Markers bypass the load pipeline.** Reshuffle, positional evaluation
   and the decision models exist to order and judge concurrent edits. A
   marker is neither: run through them it is denied after `DELETE_DOCUMENT`,
   or its index 0 rewinds and re-appends the whole live tail to every
   remote. A marker runs on its own executor path.
6. **Derived writers are fenced, not guarded.** Under READ COMMITTED, a
   read-model transaction that inserts before a purge commits and commits
   after it keeps its row: the purge's delete cannot see the uncommitted
   insert, and a `where not exists (tombstone)` on the insert cannot see the
   uncommitted tombstone. Every writer of document-keyed derived rows
   takes a shared per-document advisory lock at the start of its transaction
   and consults the tombstone there. The purge takes the exclusive lock. That
   is a fence.
7. **Scheduled, deadline-based.** No operator flush loop, no skip lists.
   The deadline defaults to 30 days from the erasure request (Art. 12(3):
   one month), configurable per deployment.
8. **Single reactor per database.** The queue, event bus and sync mailboxes
   are in-process (`queue/queue.ts:22`; no LISTEN/NOTIFY exists). Multiple
   processes sharing a reactor schema are not supported and this spec does
   not change that. Executor and projection worker threads share the
   database and are covered by the locks.
9. **Scope.** Access and erasure. Restriction (Art. 18) is out. Backups,
   WAL and point-in-time recovery are the deployer's to expire.

## Data

### The marker operation

```ts
// packages/shared/document-model: a reserved document-scope action
type PurgeDocumentAction = {
  type: "PURGE_DOCUMENT";
  scope: "document";
  id: string;                 // fresh UUID per marker; never derived from documentId
  timestampUtcMs: string;     // equals the operation's timestampUtcMs (v2 signature)
  input: {
    documentId: string;
    documentType: string;     // lets a lone marker describe its stream; not personal data
    purgedAtUtcIso: string;   // the same instant as timestampUtcMs
    requestId: string;        // erasure request that ordered it; opaque
  };
  context: { signer: ... };   // the purging host's signer; see Security
};
```

`PURGE_DOCUMENT` joins, in `packages/shared`:

- `RESERVED_OPERATION_NAMES` (`document-model/validation.ts:16-22`), so no
  document model can declare it;
- `DOCUMENT_SCOPE_ACTION_TYPES` (`document-model/action-signature.ts:60-67`),
  which also makes it a member of `GATED_DOCUMENT_ACTIONS`
  (`executor/util.ts:45-46`). The marker is exempt from the gate: see
  Receiving the marker.

In `packages/reactor` it joins `STRICT_ORDER_ACTION_TYPES`
(`utils/reshuffle.ts:12-22`), `isDriveDeletion` (`processors/utils.ts:8-10`),
and the `DocumentActionHandler` switch (`document-action-handler.ts:115-134`;
the default case throws "Unknown document action type").

Every path that applies `DELETE_DOCUMENT` during replay applies the marker
as a deletion (`isDeleted: true`, `deletedAtUtcIso` = `purgedAtUtcIso`):
`applyDeleteDocumentAction` (`shared/document-model/upgrades.ts:143-159`),
`kysely-write-cache.ts:702, 829`, `document-meta-cache.ts:204`,
`shared/document-model/versioned-replay.ts:289`. A stream whose only row is
a marker has no `CREATE_DOCUMENT`: `IWriteCache.getState` for it throws
`DocumentPurgedError`, and `documentMetaCache` returns deleted meta built
from the marker's `input`. Like every document-scope operation the marker
stores `hash: ""` (`executor/util.ts:208`).

After a purge the document's stream is exactly one row:

| `Operation` column | value |
|---|---|
| `documentId` | the purged id |
| `scope`, `branch` | `document`, `main` |
| `index`, `skip` | `0`, `0` |
| `timestampUtcMs` | the action's `timestampUtcMs` |
| `opId` | `deriveOperationId(documentId, "document", "main", action.id)` (`shared/document-model/utils.ts:17`) |
| `action` | the signed marker |

The `operation_index_operations` twin is written in the same transaction at
a fresh ordinal. Its `documentType` is the original type: a type name is
not personal data, and consumers filter on it. The v2 preimage does not
bind index, skip or the previous-state hash, so index 0 at a fresh ordinal
is sound.

### The tombstone index

The marker is authoritative; this table is the fast lookup writers and
`apply` use. It is written in the purge transaction and never deleted.

```sql
create table reactor.document_purges (
  "documentId"     text primary key,
  ordinal          bigint not null,            -- the marker's index ordinal
  "purgedOrdinals" int8range[] not null,       -- index ordinals removed
  "purgedAtUtc"    timestamptz not null,
  "requestId"      text not null
);
```

`purgedOrdinals` lets a consumer that tracks contiguous ordinals count a
purged range as settled at once instead of waiting it out as a hole. Today
the one such consumer, `AttachmentReferenceReadModel`, already tolerates
permanent holes (`attachment-reference-read-model.ts:122-176, 216-245`);
every other consumer compares ordinals with `>`.

### What the purge deletes

Every table in the reactor schema that keys on or embeds the id
(migrations 001–020, verified against 6b463bad3a):

| Table | Predicate |
|---|---|
| `Operation`, `operation_index_operations` | `documentId = id` (then the marker is inserted) |
| `Keyframe` | `documentId = id` |
| `DocumentSnapshot`, `SlugMapping` | `documentId = id` |
| `Document` | `id = id`; `DocumentRelationship` cascades both ways (`004:9,12`) |
| `group_references` | `documentId = id` only; rows whose `groupId` is the purged document stay (they key survivors) |
| `sync_dead_letters` | `document_id = id` |
| `ProcessorCursor` | `driveId = id` |

The signature-integrity lookups (`KyselyOperationStore.findOperationIds`,
`getOperationsByIds`, `store.ts:701-757`;
`KyselyOperationIndex.getOrdinalsByOpIds`, `kysely-operation-index.ts:401-425`)
read `Operation` and `operation_index_operations` and hold no state of
their own.

Kept on purpose:

- `document_collections` rows for the id. They hold `(documentId,
  collectionId, joinedOrdinal, leftOrdinal)` and no personal data. The purge
  reopens each one (`leftOrdinal = null`, `joinedOrdinal` = marker ordinal)
  so the outbox serves the marker to every remote of every collection the
  document was ever in, including lagging or new remotes through the joiner
  backfill (`kysely-operation-index.ts:454-462`). Without this, a child
  unlinked before deletion would never carry its marker to the drive's peers.
  The joiner backfill also adds a surviving document's referenced groups to
  a collection it joins (`kysely-operation-index.ts:306-319`), which keeps
  serving a purged group's marker; that is harmless.
- `sync_remotes` bound to a purged drive's collection. The erasure
  scheduler removes them once the drive's markers have converged (see
  Schedule). They live half in `SyncManager` memory and cannot be part of
  the transaction.
- `sync_remotes.filter_document_ids` and `collection_id` naming a purged id.
  An id is not personal data; a filter naming a purged id serves its marker.

Outside the reactor schema, the owners delete on receipt of the marker (see
Read models and processors) or the scheduler does (reactor-api permission
tables, see Erasure requests).

### Erasure requests, audit, and the subject index

These live in `packages/reactor-privacy`, an add-on, with their own
migration ledger (`kysely_migration_reactor_privacy` / `_lock`, as
`reactor-drive/src/schema/migrations/migrator.ts:11-13` does).

```sql
create table reactor.erasure_requests (
  "requestId"    text primary key,
  "subjectHash"  text,                          -- null for a document-only request
  "requestedBy"  text not null,                 -- admin identity, hashed if it is an address
  "requestedAt"  timestamptz not null,
  deadline       timestamptz not null,
  status         text not null                  -- 'open' | 'complete' | 'failed'
);

create table reactor.erasure_items (
  "requestId"    text not null references reactor.erasure_requests,
  "documentId"   text not null,
  status         text not null,   -- 'waiting' | 'purging' | 'purged' | 'erased' | 'failed'
  "markerOrdinal" bigint,         -- set on 'purged'
  "lastError"    text,
  "updatedAt"    timestamptz not null,
  primary key ("requestId", "documentId")
);

create table reactor.erasure_audit (
  ordinal        bigserial primary key,
  "requestId"    text not null,
  "documentId"   text,
  event          text not null,   -- 'requested' | 'expanded' | 'waiting' | 'purged'
                                  -- | 'marker-converged' | 'remotes-removed'
                                  -- | 'permissions-erased' | 'deadline-passed' | 'failed'
  detail         jsonb,           -- pending remote names, row counts, error text; never an address
  "atUtc"        timestamptz not null
);

create table reactor.subject_documents (
  "subjectHash"  text not null,   -- HMAC-SHA256(deploymentSecret, lower(identifier))
  "documentId"   text not null,
  role           text not null,   -- 'signer' | 'app-key' | 'creator' | 'header-key' | 'named'
  "firstOrdinal" bigint not null,
  "lastOrdinal"  bigint not null,
  primary key ("subjectHash", "documentId", role)
);
```

The audit table is append-only, has its own retention, and is not a
PHDocument: it must not inherit the problem it records.

## The purge operation

### Who may issue it

Three paths reach the executor with a `PURGE_DOCUMENT`:

- **A purge job**, enqueued only by the erasure scheduler through
  `DocumentPurgeService` (a concrete class in `packages/reactor/src/admin/`,
  constructed by the host from `InProcessReactorModule`). `JobKind` becomes
  `"mutation" | "load" | "reevaluation" | "purge"` (`queue/types.ts:11`).
  This is the only local origin.
- **A load job** carrying a marker from a peer.
- **A regular write** (`execute`, GraphQL mutation) carrying a
  `PURGE_DOCUMENT` action. Refused at admission with
  `ReservedActionError`, before any lock or read. A client cannot purge.

### Preconditions

Checked inside the purge transaction, after the exclusive lock, so they
cannot go stale:

1. The document exists locally and `isDeleted` is true on every branch
   (`DocumentSnapshot` for each branch, or document meta). Otherwise the
   job fails with `DocumentNotDeletedError`, terminal, nothing changed.
   Exception: a load-job marker for a live document proceeds by applying the
   deletion first (decision 3).
2. The document is not already purged. A second marker for a purged id,
   whatever its action id, is an idempotent success: no rows change, the
   job completes, nothing is emitted. Sync re-delivery and markers from two
   originators depend on this.
3. If the document is a group (`powerhouse/reactor-group`) and a surviving
   document's current `auth.grants` names it (candidates from
   `group_references`, confirmed through `referencedGroupIds` on their
   current auth state), the job fails with `GroupInUseError` unless the
   request carried `allowGroupInUse`. `group_references` alone is not the
   test: it is append-only and records references from refused and removed
   grants too. A `{ group }` principal naming an absent group never matches
   (`auth-v1.ts:837-851`), and evaluation is last-applicable-grant-wins
   (`auth-v1.ts:884-920`), so surviving documents would re-judge their
   history, in either direction, and diverge from peers.
4. If the document is a drive, every document in its collection must
   already be purged or be in the same request's expansion. The scheduler
   expands drives (below); the executor only checks.

Preconditions 3 and 4 are not checked for a load-job marker: the purging
peer checked them.

### Execution

One transaction on the reactor handle, in this order:

```
lock      pg_advisory_xact_lock(PURGE_NS, hashtext(id))          -- exclusive
check     tombstone; preconditions 1–4
sign      marker via the executor's signer (purge job only; a load job carries it signed)
touched   add every (id, scope, branch) to touchedStreams
delete    the table list above, in bounded statements; collect removed index ordinals
insert    Operation marker (index 0); commit the index twin, which yields the marker ordinal
upsert    document_purges row
update    document_collections: reopen every row for id at the marker ordinal
commit
```

Rollback uses the existing `JobRollbackSignal` path
(`simple-job-executor.ts:146-158, 285-299`): the handler returns a failed
result, the scope rolls back, and `evictTouchedStreams` drops what the job
touched.

After commit, in the same executor (`executeJob`, `simple-job-executor.ts:301-307`):

- evict through the existing post-commit lists: `postCommitInvalidations`
  (`writeCache` for every scope of the id) and
  `postCommitMembershipInvalidations` (the id, and every surviving document
  that was in a purged drive's collection: their cached collection list
  still names the drive). Add a post-commit `documentMetaCache` list; none
  exists today. Executor routing is sticky by document
  (`executor/worker-pool-router.ts:2-8`), so the thread that runs the job is
  the thread whose caches hold the document; no cross-thread invalidation
  protocol is needed.
- emit `JOB_WRITE_READY` with the marker as the only operation. The
  document view, indexer, processors, shards and the sync outbox receive it
  exactly as they receive any operation.

The transaction holds the exclusive lock across the deletes. A very large
document is purged in one transaction by design; statement batching bounds
statement size, not lock duration.

### Admission at the store

`KyselyOperationStore.executeApply` (`storage/kysely/store.ts:152-271`)
gains, inside its transaction and before the revision check (`:185-225`):

```sql
select 1 from reactor.document_purges where "documentId" = $1
```

If a row exists and the action being applied is not a `PURGE_DOCUMENT`
marker, `apply` throws `DocumentPurgedError`. The job transaction already
holds the shared lock for its document (below), so the lookup is consistent
with any concurrent purge. The executor checks the tombstone earlier, after
the job-start lock and before signature admission (Locks); `apply` is the
backstop. `HypercoreOperationStore.apply` must implement the same refusal or
the package must not ship; today it has no delete path at all
(`hypercore-operation-store.ts:161-174`).

`DocumentPurgedError`, `DocumentNotDeletedError`, `GroupInUseError` and
`ReservedActionError` join the terminal allow-list in `JobResultHandler`
(`executor/job-result-handler.ts:143-169`); anything not on it is retried up
to `maxRetries`. Error names survive to `JobInfo.error` across the queue,
tracker and worker boundary; other fields do not, so consumers read the id
from `job.documentId`.

On the load path `DocumentPurgedError` is not a failure: the operations are
dropped, not dead-lettered (a dead letter would write the personal data
back), and the sync manager records the id (see Synchronization).

`ADD_RELATIONSHIP` tolerates a missing target
(`document-action-handler.ts:990-995`) and then writes a membership
(`:895-903`) and an indexer `Document` row for it. On the write path a
tombstoned target is refused with `DocumentPurgedError`. On the load path
and under positional replay (`replayingAcceptedHistory || evaluatedByPosition`)
the operation is accepted and the membership and indexer writes for the
target are skipped. The executor resolves the target set once at job start.

### Locks

All purge-related locks use a two-int advisory key,
`pg_advisory_xact_lock(PURGE_NS, hashtext(id))`, so they cannot collide with
the single-int stream locks in `acquireStreamLocks` (`store.ts:280`).

- **Job transactions** take `pg_advisory_xact_lock_shared` for every id the
  job can write rows for — `job.documentId`, `CREATE_DOCUMENT` header ids,
  `ADD_RELATIONSHIP` targets from `job.actions` or `job.operations` — sorted,
  in one statement, at the top of `executeInScope` before
  `stores.operationIndex.start()` (`simple-job-executor.ts:350-353`). That is
  ahead of the load (`:355`), reevaluation (`:394`) and mutation branches and
  before `admitMutation` (`:435`) and `admitLoad` (`:2094`). The tombstone
  lookup for `job.documentId` follows the lock. The purge job takes the
  exclusive lock instead. No job takes more than one kind, and all take
  them first, so there is no cycle.
- `ExecutionStores` (`executor/execution-scope.ts:15-21`) exposes no
  transaction handle today. It gains
  `documentLocks: { shared(ids): Promise<void>; exclusive(id): Promise<void> }`,
  bound to the transaction in `KyselyExecutionScope` and a no-op in
  `DefaultExecutionScope`.
- A reevaluation job queued for a document before its purge committed
  completes with no writes: `DocumentPurgedError` is terminal, not retried.
- **Derived writers** (next section) take the shared lock for the ids in
  each chunk at transaction start.

## Read models and processors

Every consumer receives the marker in its normal stream and is responsible
for its own rows, as it already is for `DELETE_DOCUMENT`.

### Built-in models

| Model | On `PURGE_DOCUMENT` |
|---|---|
| `KyselyDocumentView` | writes nothing and deletes nothing: its rows are in the purge transaction. `commitOperations` skips the marker explicitly before the generic document-scope branch (`document-view.ts:217-230, 342-361`), which would otherwise insert header and document rows with `isDeleted` false and re-insert the `SlugMapping` from the header echo (`:302-318`). `init` does not rebuild state for a marker. With no rows, `get` and `resolveIdOrSlug` read the id as absent; `exists(IncludingDeleted)` still reports it taken through `getRevisions` (`:839-857`), so the id cannot be re-created. |
| `KyselyDocumentIndexer` | nothing to do: its rows are in the purge transaction. Skips the `Document` insert for a tombstoned `ADD_RELATIONSHIP` target. |
| `ProcessorManager` | for a drive: close its processor queues and delete cursors as `DELETE_DOCUMENT` does (`processor-manager.ts:199-223`, through `isDriveDeletion`). Forwards the marker to processors, and calls `onDocumentPurged(documentId)` on each processor that has it (see Processors). |
| `NodeProcessor` (reactor-drive) | delete `DriveNode where id = id or driveId = id` and `DocumentName where docId = id`. `applyDeleteDocument` (`node-processor.ts:231-240`) matches `id` only and would leave a purged drive's folder rows. |
| `AttachmentReferenceReadModel` | delete `attachment_reference where document_id = id`. |
| `WorkflowTriggersReadModel` | its data is opaque text in `run.trigger_payload`, `step_execution.input/output`, `trigger_state.store_state`, `trigger_dedupe.dedupe_key` and `piece_store.value` (`reactor-workflow/src/reactor/store.ts:122-233`). Uncovered until a document-id column exists; documented. |
| `SubscriptionNotificationReadModel` | handles the marker explicitly. Today it would fall to the updated branch (`subscription-notification-read-model.ts:67-71`), where `documentView.get` throws for the purged id and rejects the whole batch (`:90-94`). It emits Deleted only when the purge applied a deletion (a live document receiving a marker); for an already-deleted document it emits nothing, since the gated DELETE notice already went out. |
| `subject_documents` (reactor-privacy) | delete its rows for the id. |

The read gate needs no change. It reads through the document view and
caches nothing per document beyond one event or request. A Deleted event
for an id the view does not hold is served, id only, under the
absent-document rule (`reactor-client.ts:1873-1906`, `read-gate.ts:262-287`).

### Processors

`IProcessor.onOperations` receives the marker like any operation. Because
`RelationalDbProcessor.onOperations` is abstract
(`shared/processors/relational/types.ts:91`), the base never sees
operations; purge handling is an optional capability the manager detects
instead of a change to `IProcessor`:

```ts
interface IPurgeAware { onDocumentPurged(documentId: string): Promise<void>; }
export function isPurgeAware(p: unknown): p is IPurgeAware;
```

- `RelationalDbProcessor` implements it as a no-op; the codegen template
  implements it as a delete on every table with a document-id column.
- Analytics processors: `clearSeriesBySource("ph/doc/<id>/...")`
  (`analytics-engine/knex/src/KnexAnalyticsStore.ts:66-82`).
- `VetraReadModelProcessor`: delete from `vetra_package where document_id = id`.

A processor that ignores the marker keeps its rows. Processor authors are
told this in the processor documentation, and the erasure audit records
which processors were bound when the purge ran.

### The fence

`BaseReadModel.indexOperations` commits in `commitChunkSize` chunks, each
through a subclass-owned transaction, and persists the cursor in another
(`base-read-model.ts:128-157, 302-307`). It is restructured so each chunk's
rows and cursor share one transaction that the base opens, and takes the
shared locks first. `commitOperations` gains a `trx` parameter in every
subclass (`KyselyDocumentView`, `KyselyDocumentIndexer`, `ProcessorManager`,
`NodeProcessor`, `AttachmentReferenceReadModel`, `WorkflowTriggersReadModel`):

```ts
// base-read-model.ts, per chunk transaction
await trx.executeQuery(sql`select pg_advisory_xact_lock_shared(${PURGE_NS}, hashtext(id))
                          from unnest(${sortedIds}) as id`);
const purged = await findPurged(trx, sortedIds);          // document_purges
const live = chunk.filter(op => !purged.has(op.context.documentId)
                              || isPurgeMarker(op));
await this.commitOperations(live, trx);
await this.saveState(trx, ...);
```

A purge in progress holds the exclusive lock, so the chunk waits and then
sees the tombstone. A chunk that committed first is deleted by the purge.
Neither can leave a row behind. `KyselyWriteCache.persistKeyframe`
(`kysely-write-cache.ts:455-478`, and its second caller at `:394-402`) is
fire-and-forget today; it moves inside a transaction that takes the same
shared lock. Dead-letter persistence (`void this.deadLetterStorage.add`,
`sync/sync-manager.ts:681`) does the same and additionally refuses
tombstoned ids outright.

Models whose rows live on another database handle
(`AttachmentReferenceReadModel`, third-party relational processors) cannot
join the lock. They skip tombstoned ids at commit and accept the residual
race; the spec states it. The marker is re-delivered only while a model's
cursor is below it (`init` replays `getSinceOrdinal(lastOrdinal)`,
`base-read-model.ts:101-120`), so a row the race lets through stays until
the model is rebuilt from zero.

### Ordinal gaps

Purging removes index ordinals. `getSinceOrdinal`, `find`,
`lastOperationOrdinal` and processor routing compare with `>` and are
unaffected. A consumer that tracks contiguous ordinals reads
`purgedOrdinals` and counts a purged range as settled at once; if
contiguous cursors move into `BaseReadModel` and `ProcessorQueue`, their
settled-watermark component reads it the same way.

## Synchronization

### Serving the marker

The outbox derives from `operationIndex.find(collectionId, since)` joined
to `document_collections` with `leftOrdinal is null or ordinal < leftOrdinal`
(`kysely-operation-index.ts:443-476`). Because the purge reopens the
document's memberships at the marker ordinal, the marker is the one row
`find` returns for the document, to every remote of every collection the
document was ever in. A remote whose cursor is behind the marker's
`joinedOrdinal` takes the joiner backfill and receives the marker. A remote
added after the purge receives the marker on its initial backfill and
records a tombstone for a document it never held. No filter, protocol or
schema change is needed on the wire: the marker is an operation.

The serving gate must not throw on a purged id.
`SyncScopeGate.scopePredicateById` treats only `DocumentNotFoundError` as
absent (`decision/sync-scope-gate.ts:55-62`) and returns `META_ONLY`, but
`KyselyDocumentView.get` throws a plain `Error` (`document-view.ts:434`),
so today the gate rethrows and the whole poll fails
(`reactor-api/src/graphql/reactor/resolvers.ts:1406-1435`). Stage 0 makes
the view throw `DocumentNotFoundError`. With it, the purged id reads as
absent, `META_ONLY` serves document scope, and the marker is document
scope.

The outbound backfill filters out `quarantinedDocumentIds`
(`sync-manager.ts:1382-1384`). A document quarantined before its purge
would withhold its marker; the purge clears the id from that set (below).

Nothing else about the document is ever served again: its other rows are
gone.

### Receiving the marker

A load job whose operations include a marker never enters
`executeLoadJob`. The load branch of `executeInScope`
(`simple-job-executor.ts:355`) routes it to `executePurgeLoad`, which:

1. runs `admitLoad` on the marker alone. Receivers refuse an unsigned
   marker whatever the document's signature policy. A refused marker fails
   the job terminally with `InvalidSignatureError`; the dead letter holds
   the marker only, which carries no personal data. (A refused ordinary
   operation is dropped silently, `simple-job-executor.ts:2112-2126`; for a
   marker that would leave the document unpurged with no trace.)
2. skips the `DocumentDeletedError` gate (`:2029-2035`), `selectLoadWrites`
   and the reshuffle (`:2078-2238`), `evaluateByPosition` (`:2273-2289`),
   the `deniedReason` and policy branches of `DocumentActionHandler.execute`
   (`document-action-handler.ts:106-114`), and `reevaluateIfCriteriaMet`.
   Both decision models deny every execute on a deleted document
   (`decision/document-decision-model.ts:50`, `decision/auth-decision-model.ts:64`).
3. drops every other operation in the same load job.
4. purges:
   - for a document held locally and deleted: Execution above;
   - for a document held locally and live: apply the deletion, then purge
     (decision 3); the erasure audit is local to the requesting peer, so the
     receiving peer logs the event through its normal job events;
   - for a document not held locally: write the marker, the index twin, the
     tombstone row and the membership rows for the job's collection. Nothing
     else exists to delete;
   - for a document already purged: idempotent success.

The index twin carries `sourceRemote = job.meta.sourceRemote`, so the
marker is not echoed to its source.

A load job for a tombstoned document whose operations are not markers is
refused after the job-start lock with `DocumentPurgedError`, before any
read; the rollback is a no-op. `SyncManager` keeps an in-memory set of
tombstoned ids, seeded from `document_purges` at startup the way
`quarantinedDocumentIds` is seeded (`sync-manager.ts:208-219`), and drops
such operations in `handleInboxAdded` (`:828-858`) before a job exists. Its
two FAILED branches (`:993-1002` single, `:1051-1058` batch) dead-letter
unconditionally today, and `classifyJobFailure` (`sync/utils.ts:544-559`)
maps unknown names to `UNCLASSIFIED`, which quarantines. Both branches
treat `error.name === "DocumentPurgedError"` as a drop: add the id to the
tombstone set, remove it from the inbox, `syncOp.executed()`, no dead
letter.

On every marker it sees on `JOB_WRITE_READY`, `SyncManager` adds the id to
the tombstone set and removes it from `quarantinedDocumentIds`. The purge
deleted the dead letters that seeded the quarantine; the in-memory set does
not follow on its own, and would drop an incoming marker and withhold an
outgoing one until restart.

### Older peers

The marker is an operation of a known scope with an unknown type. A peer
without this spec:

- with `documentDecisions` off, rejects the load job for a deleted document
  with `DocumentDeletedError` (`simple-job-executor.ts:2029-2035`) and
  dead-letters the marker — an id and a timestamp, no personal data. The
  dead letter is `UNCLASSIFIED` and quarantines the document on that peer in
  both directions (`sync/utils.ts:568-580`);
- with `documentDecisions` on, routes the unknown type to
  `executeRegularAction`, where `evaluateByPosition` denies it after the
  deletion, and stores it as a denied operation without reducing
  (`simple-job-executor.ts:1002-1010`), then forwards it;
- holding the document live, applies neither deletion nor purge.

Either way the old peer keeps the document's history. That is the version
skew cost and it is stated under Limits. No poll-query field changes, so
the permanent-error path in `gql-req-channel.ts:886-906` is not reached.

### Connect

Connect runs the same `SyncManager`, `GqlRequestChannel`, executor and
read models over PGlite (`apps/connect/src/reactor.worker.ts:354-365`;
`reactor-builder.ts:996-1011`). A marker polled from switchboard becomes a
load job and runs the same purge. No Connect code is needed for receipt.
Under `authEnforcement` Connect admits the marker through its Renown trust
policy (`apps/connect/src/utils/renown-trust.ts:28-64`), so the purging
switchboard's signer must be Renown-bound (see Security). The 30-day
pre-migration backup in IndexedDB (`apps/connect/src/utils/pglite-migration.ts:12`)
is outside the reactor and is stated under Limits. Connect never originates
a purge: it has no erasure scheduler.

## Erasure requests and scheduling

`packages/reactor-privacy` owns the request lifecycle. It is wired by the
host after the reactor is built, the way the workflow runtime is
(`apps/switchboard/src/workflow-runtime.mts:238-276`) and the attachment
read model's post-build variant is
(`registerAttachmentReferenceReadModelOnModule`, `apps/switchboard/src/server.mts:529-532`),
behind `PH_PRIVACY_ENABLED` (default off). It takes the reactor handle,
`DocumentPurgeService`, the sync manager, and reactor-api's
`DocumentPermissionService`. It refuses to start when the reactor has no
signer: an unsigned marker is refused by every receiver.

### Request

```ts
interface IErasureService {
  /** Lists what an erasure of these ids would remove, and what blocks each. Read-only. */
  plan(ids: string[]): Promise<ErasurePlan>;
  /** Records the request; returns immediately. */
  request(ids: string[], opts: { requestedBy: string; deadline?: Date; allowGroupInUse?: boolean }): Promise<ErasureRequest>;
  status(requestId: string): Promise<ErasureRequest>;
}
```

`request` expands each drive to every document that was ever in its
collection (`document_collections`, any `leftOrdinal`) and has no open
membership elsewhere, records one `erasure_items` row per document, refuses
if any is live (`DocumentNotDeletedError` naming the ids; the caller deletes
them first and requests again), and records `requested` and `expanded`.

### Schedule

An in-process interval (default 60 s, `unref`) with a re-entrancy guard,
modelled on `TriggerSupervisor` (`reactor-workflow/src/reactor/trigger-supervisor.ts:231-240`
for `start`, `:888-895` for the guard). One process per database
(decision 8). Each tick, for each item:

- **waiting →** if the `DELETE_DOCUMENT` has converged, or
  `now >= deadline`, enqueue the purge job and move to `purging`. Record
  `deadline-passed` when that was the cause.
- **purging →** poll the job tracker; on success record the marker ordinal
  and row counts from the job result and move to `purged`. On terminal
  failure move to `failed` with the error name.
- **purged →** wait until the marker has converged
  (`pendingDelivery(id, markerOrdinal)` is empty) or `markerGrace` has
  passed since the purge (default 7 days), recording `marker-converged` or
  `deadline-passed`. Then remove `sync_remotes` bound to a purged drive's
  collection through `SyncManager.remove` (`sync-manager.ts:512`) and
  record `remotes-removed`; erase the reactor-api rows for the id on the
  other handle, `DocumentPermissionService.deleteAllDocumentPermissions`
  (exists, uncalled, `reactor-api/src/services/document-permission.service.ts:190-200`)
  and `DocumentProtection`, and record `permissions-erased`. On success
  move to `erased`; on error keep `purged` and retry next tick. Nothing is
  skipped because a previous step already ran.

The wait in `purged` exists because both steps stop the marker: a removed
remote never polls it, and erased permission rows can put the id in the
poll's `forbiddenIds`, which are consumed rather than held
(`reactor-api/src/graphql/reactor/subgraph.ts:538-560`, `resolvers.ts:1441-1460`).

A request completes when every item is `erased`; it fails when any item is
`failed`. Both are recorded.

### Convergence

"Converged" for a document at an ordinal means every remote that was owed
that ordinal has acknowledged past it. It is asked twice per item: at the
`DELETE_DOCUMENT` ordinal before the purge, and at the marker ordinal
after. `SyncManager` implements an opt-in capability rather than a change
to `ISyncManager`:

```ts
interface IDeliveryTracking {
  /** Remotes that have not acknowledged ordinal for documentId's collections. */
  pendingDelivery(documentId: string, ordinal: number): Promise<{ remote: string; state: ConnectionState }[]>;
}
export function supportsDeliveryTracking(x: unknown): x is IDeliveryTracking;
```

It reads each remote's `outbox` cursor from `sync_cursors` (both channel
kinds persist it, only after the peer acknowledges: `gql-req-channel.ts:178-196`,
`gql-res-channel.ts:192-220`) and applies the outbox's own filter function,
exported from `sync/utils.ts` and not copied. If the sync manager is
absent but `sync_remotes` has rows, the item is not converged: the check
fails closed and the deadline decides. The pending list is recorded in the
audit each tick it changes.

Under the cascade order fixed in stage 0, a child's `DELETE_DOCUMENT` is
served to the drive's remotes before its membership closes, so the check is
meaningful for children. Abandoned Connect pollers hold cursors forever and
would otherwise block indefinitely; the deadline and `markerGrace` bound
them.

## Disclosure

`SubjectDocumentsReadModel` is a `BaseReadModel` over the reactor handle
indexing, per operation:

| role | source |
|---|---|
| `signer` | `action.context.signer.user.address` |
| `app-key` | `action.context.signer.app.key` (a per-browser did:key in Connect) |
| `creator` | the auth scope's `creator` |
| `header-key` | `header.sig.publicKey` |
| `named` | addresses in `action.input`: grant principals and `match`/`where` literals that parse as addresses, reactor-group members |

Addresses are matched case-insensitively (nothing normalises case at write
time; `auth-v1.ts:831-836, 850-851` lowercase at compare time). Personal
data inside model-specific state is not indexed, and the access response
says so. `PHDocumentState.deletedBy` is a type only and is never written; it
is not indexed.

The key is an HMAC with a deployment secret. An address is enumerable, so a
plain hash would let anyone confirm a person is present in the index or the
audit log; the HMAC keeps both pseudonymous after the documents are gone.
Lookup by address still works because the HMAC is deterministic. Rotating
the secret is a rebuild of the index; losing it loses the ability to match
old audit rows to an address.

`disclose(identifier)` returns the index rows plus the non-document homes:
`sync_remotes.bound_address` rows (migration 018) and the reactor-api
permission rows for the address. The response names what is not covered.

Disclosure and erasure are exposed through a reactor-api subgraph over
`SubgraphArgs`. Every query and mutation requires `ctx.user?.address` and
`authorizationService.isSupremeAdmin(address)`, in the shape of the
existing `requireAdmin` helper (`reactor-api/src/graphql/packages/resolvers.ts:7-14`).
Under `AuthorizationPolicy.OPEN`, `isSupremeAdmin` is true for every
caller, anonymous included (`authorization.service.ts:157-160`), so the
subgraph is not mounted under `OPEN`. The authenticated-caller floor
(`REQUIRE_AUTHENTICATED_CALLER`) is not a substitute.

## Security

- **Local origin.** Only the erasure scheduler enqueues purge jobs, and only
  an admin can create a request. A `PURGE_DOCUMENT` submitted as a regular
  action is refused before any lock.
- **Signature.** The purge job signs the marker with the executor's signer
  (`SimpleJobExecutor.signer`, from `ReactorBuilder.withSigner`,
  `core/reactor-builder.ts:416, 790-806`; pooled workers through
  `workerSigner`, `executor/worker/build-worker-executor.ts:138-145`) by
  `signer.signAction(action, { documentId, branch })`, with
  `actionSignerIdentity(signer)` as `context.signer`. `signSynthesized`
  (`executor/synthesized-signing.ts:56-96`) is not reused: it handles UNDO
  and REDO only and derives its id from the submitted action. A receiver
  admits the marker through `SignatureAdmission.admitLoad`
  (`executor/signature-admission.ts:171-224`): v2 integrity, then the trust
  policy. Under `authEnforcement` the trust policy is Renown on switchboard
  (`apps/switchboard/src/server.mts:634-657`) and Connect, and accepts a key
  only when a credential binds `signer.user` to it
  (`packages/renown/src/signer-trust.ts:101-110`). A host that originates
  purges therefore needs a signer whose user is Renown-bound, or every
  enforcing receiver refuses its markers. `documentId` is in the preimage,
  so a marker cannot be moved to another document, and a peer cannot
  forge another host's marker.
- **Remote origin.** A pushed marker is authorized per operation against the
  pushing caller, not the marker's signer (`pushSyncEnvelopes` →
  `authorizationService.canMutate`, `reactor-api/src/graphql/reactor/subgraph.ts:1049-1070`,
  `base-subgraph.ts:259-273`). Under `OPEN` every caller passes. Under
  `DOCUMENT_PERMISSIONS` an operation type is restricted only per document,
  by `OperationUserPermission` rows (`document-permission.service.ts:310-322`,
  used at `authorization.service.ts:277-296`); there is no static list. So
  `DocumentPermissionsAuthorizationService.canMutate` gains a fixed rule:
  `PURGE_DOCUMENT` requires a document admin (supreme admin, owner, or an
  ADMIN grant) whatever the rows say. Polled operations are not authorized
  by the receiver at all: a peer admits what its remote serves, subject to
  signature admission. The signature proves which identity ordered the
  purge; it does not limit who may.
- **Personal data in the mechanism.** The marker, tombstone, memberships,
  request and item rows hold ids, type names, timestamps and hashes. The
  audit `detail` column holds remote names, counts and error text; an error
  message that embeds an address (`AuthorizationDeniedError` does,
  `shared/errors.ts:44`, raised at `simple-job-executor.ts:972-983`) is
  hashed before it is stored.
- **Worst case.** An attacker who can push to an open switchboard, and whose
  signing key the receivers trust (any key that verifies, with
  `authEnforcement` off), can purge any document it may mutate. Today they
  can delete it and, under `documentDecisions`, refuse every later
  operation; the marker adds permanence. The mitigations are the
  document-admin rule, unsigned-marker refusal, `authEnforcement`, and the
  operator documentation, not new machinery.

## Performance

- **Hot path.** One shared advisory lock statement and one primary-key
  lookup on `document_purges` per job, before signature admission, plus the
  same lookup inside `apply`. All per job, not per operation. Run the sync
  bench (`pnpm bench:sync`) before and after stage 1 and record both in the
  PR.
- **Read models.** One lock statement and one `in (...)` lookup per chunk
  transaction. Measure with the processors bench (`pnpm bench:processors`).
- **Purge.** Bounded by the document's row counts. A drive purge is N
  document purges, each its own job, routed and executed in parallel by the
  worker pool.
- **Scheduler.** One `sync_cursors` read per waiting or purged item per
  tick. Ticks are 60 s; a request with thousands of items is a bounded scan.

## Testing

Each stage's exit tests run against a real Postgres, through the package's
`pnpm test`, not an isolated `vitest run`. Every test that asserts a purge
stuck also asserts against every table in the delete list.

**Stage 0**
- Cascade-deleting a drive with children: every child's `DELETE_DOCUMENT`
  ordinal is below its membership's `leftOrdinal`, and the delete is served
  to the drive's remote, under the single executor and under the worker
  pool.
- `KyselyDocumentView.get` for an unknown id throws `DocumentNotFoundError`;
  `SyncScopeGate.scopePredicateById` returns `META_ONLY` for it against the
  real view, not a mock.

**Stage 1**
- `apply` refuses a non-marker append to a purged stream; a second marker,
  with the same or a different action id, is an idempotent no-op.
- A regular `execute` of `PURGE_DOCUMENT` is refused before any lock.
- Purge of a live document fails with nothing changed; of a group whose
  current grants are named by a survivor, fails without the override; of a
  group named only by a removed grant, succeeds.
- After a purge, every table in the delete list has no row for the id; the
  marker is the only `Operation`, signed by the host signer, with
  `operation.timestampUtcMs === action.timestampUtcMs`; memberships are
  reopened at the marker ordinal; `document_purges` carries the removed
  ranges; the document view holds no row and `exists(IncludingDeleted)` is
  true.
- Every new error is terminal: no retry, name intact on `JobInfo.error`.
- A replayed, validly signed old operation of the purged document, as a
  mutation and as a load, is refused by the tombstone before signature
  admission.
- **Resurrection probes**, each as a test:
  - a document-view chunk transaction held open across the purge (row lock
    on another document) commits after it and inserts nothing;
  - a `JOB_WRITE_READY` payload for the id delivered after the purge
    inserts nothing in view, indexer or keyframes;
  - a load job for the id started before the purge either commits first
    and is then purged, or waits and is refused;
  - a reevaluation job queued before the purge completes with no writes;
  - positional replay of a drive history containing `ADD_RELATIONSHIP` to a
    purged target succeeds and writes no membership or `Document` row;
  - a reactor restart after a purge: read-model `init` and the write cache
    handle the lone marker without error or rows.
- **Marker receipt bypasses reshuffle.** A receiver holding the document
  with a local document-scope operation timestamped after the purge
  receives the marker: no local operation is re-appended, nothing is
  re-sent, the stream is the marker alone.
- **Two reactors, real Postgres**, with `authEnforcement` on, a Renown-bound
  host signer and the sync serving gate. Create, edit, delete, let B
  receive the delete, purge on A: B receives the marker and purges; both
  hold identical markers and tombstones. Reset B's cursor: A stores
  nothing, dead-letters nothing, and the poll does not throw. Add C after
  the purge: C receives the marker only. Purge on A a document B never
  received the delete for: B applies delete-then-purge. A document
  quarantined on B before the purge still receives its marker. An unsigned
  marker, and one signed by an untrusted key, fails B's load job terminally
  and leaves only the marker in dead letters.
- A cascade-deleted child's marker reaches the drive's remote.
- Sync bench before and after.

**Stage 2**
- Each add-on model: rows exist, marker delivered, rows gone;
  `NodeProcessor` leaves no folder rows for a purged drive;
  `AttachmentReferenceReadModel` does not park on a purged gap;
  `SubscriptionNotificationReadModel` loses no other notification in a
  batch with a marker; the relational codegen template's
  `onDocumentPurged` deletes across its tables.

**Stage 3**
- `plan` expands a drive to ever-members; `request` refuses a live id.
- Convergence: waiting while a remote is owed; enqueued on
  acknowledgement; enqueued at the deadline with `deadline-passed`
  recorded; fails closed with no sync manager and rows in `sync_remotes`.
- After the purge, remotes and permissions stay until the marker has
  converged or `markerGrace` passed; a connected remote receives the marker
  before its remote row is removed.
- Permission erase retried across ticks until it succeeds; a failed purge
  job marks the item `failed` and the request `failed`.
- The service refuses to start with no reactor signer.
- Disclosure: two signers across three documents, one address in a grant,
  one distinct app key; exact ids and roles, case-insensitive; rows gone
  after purge.
- Subgraph refuses a non-admin and an anonymous caller, and is not mounted
  under `OPEN`.

## Implementation plan

Each stage is one PR, built off `main` in its own worktree with its own
Postgres, reviewed at high effort with an adversarial "resurrect it" pass,
and merged before the next begins. Stages 1 and 3 must not be combined:
stage 3 depends on stage 1's semantics being proven, not assumed.

**Stage 0 — two independent fixes.** Each is a bug on `main` today.
- *Cascade order.* `ReactorClient.deleteDocument(Cascade)`
  (`client/reactor-client.ts:1467-1517`) enqueues each document's incoming
  `REMOVE_RELATIONSHIP` before its `DELETE_DOCUMENT` with no dependency
  between them, so the parent's removal usually commits first, closes the
  membership, and the outbox filter (`kysely-operation-index.ts:455`)
  drops the child's delete. Under the worker pool it is a race. Fix: submit
  the cascade through `executeBatch` so each `REMOVE_RELATIONSHIP` targeting
  X `dependsOn` X's `DELETE_DOCUMENT`; the root's incoming relationships
  follow the same rule. A failed dependency still releases its dependents
  (`queue/queue.ts:494-499`), which leaves today's outcome for that case.
- *Not-found error.* `KyselyDocumentView.get` (`document-view.ts:434`)
  throws `DocumentNotFoundError` instead of a plain `Error`, so
  `SyncScopeGate` reads an absent document as absent instead of failing the
  poll.

**Stage 1 — the marker, the store, the executor, sync.**
- `PURGE_DOCUMENT` in shared document-model: reserved name, document-scope
  action type, every replay path applies it as deletion, type exported.
- Migration `021_create_document_purges.ts`, registered in both the import
  block and the record of `migrator.ts`.
- `IOperationStore.apply` refusal; `HypercoreOperationStore` mirrors it.
- `ExecutionStores.documentLocks`; job-start shared locks and tombstone
  check in `executeInScope`; `JobKind "purge"`; the purge handler in
  `document-action-handler.ts` with the transaction above, signing through
  the executor's signer; post-commit `documentMetaCache` eviction;
  `ReservedActionError` for regular writes; `executePurgeLoad` for the
  receipt cases; `ADD_RELATIONSHIP` target handling; the four errors in the
  terminal list.
- Write cache and meta cache handle a lone-marker stream.
- `KyselyDocumentPurger` (the table list) used by the handler.
- `DocumentPurgeService.enqueuePurge(ids, requestId, opts)` in `admin/`.
- `BaseReadModel` chunk-transaction fence with `commitOperations(ops, trx)`
  across its subclasses; keyframe and dead-letter persistence inside locked
  transactions; `KyselyDocumentView` and `KyselyDocumentIndexer` handle the
  marker; `ProcessorManager` drive handling via `isDriveDeletion`.
- `SyncManager` tombstone set, inbox drop, FAILED-branch drop, quarantine
  clear on marker.
- Exports from `packages/reactor/index.ts`: the action type, the errors,
  `PURGE_NS`, the purger, the service, `isPurgeAware`.
- Exit: the stage 1 tests, and the sync bench numbers in the PR.

**Stage 2 — add-on models and processors.** `NodeProcessor`,
`AttachmentReferenceReadModel`, `SubscriptionNotificationReadModel`,
`WorkflowTriggersReadModel` (documented as uncovered), `IPurgeAware` on
`RelationalDbProcessor` and the codegen template, analytics and Vetra
processors, processor-author documentation.

**Stage 3 — reactor-privacy.** Package, migrations, `IErasureService`,
scheduler with the post-purge marker wait, `IDeliveryTracking` on
`SyncManager` with the exported outbox filter, permission erase, audit,
`SubjectDocumentsReadModel`, subgraph, the `PURGE_DOCUMENT` document-admin
rule in `DocumentPermissionsAuthorizationService.canMutate`, switchboard
wiring behind `PH_PRIVACY_ENABLED`, operator documentation (signer and
Renown binding, document-admin rule, anonymous-push warning, backup expiry,
deadline and `markerGrace`).

**Stage 4 — Connect.** Nothing for receipt. Optional: surface "erased" in
the deletion notification so an open editor closes with a reason.

### Conventions for implementing agents

- `pnpm` only; `pnpm tsc --build` (TypeScript 7), never a global `tsc`.
  Packages build with tsdown. Lint and format are oxlint and oxfmt; the
  pre-commit hook runs `lint-staged` (`oxlint --fix`, then `oxfmt`) and may
  rewrite staged files; `commit-msg` runs commitlint.
- Rebuild `packages/shared` and `packages/reactor` dists before running
  downstream package tests; they consume the built output.
- Granular try/catch around the single await that can fail. Comments are
  terse and rare. Reducers apply or derive state; do not describe them as
  folding.
- Never edit a generated file by hand; run codegen.
- Commit per logical change with a body that says why; end with the
  attribution line the session provides. Never amend, rebase or force-push.
  If a commit is rejected by commitlint, fix the message and commit the same
  staged set; do not let the files fall into the next commit.
- A red test stays red until its cause is fixed. No retries to get green.
- Record every deviation from this spec in the PR body with file:line and
  the reason. Do not edit the spec to match the code; propose the change.

## Limits

- **The signer's address in undeleted documents.** Every document the person
  touched and the controller keeps still holds the address on each of their
  operations. Erasure of a person is erasure of documents.
- **The parent drive's log.** `ADD_RELATIONSHIP` and drive node operations
  in a surviving parent embed a purged child's id and title. Purging the
  drive removes them.
- **Older peers** keep the document's history and dead-letter or deny the
  marker. Erasure reaches peers on this spec's version.
- **Untrusting peers.** A receiver whose trust policy refuses the purging
  host's key keeps the document; its dead letter records why.
- **Browser backups.** Connect's 30-day IndexedDB copy is outside the
  reactor.
- **Cross-handle models** accept a residual late-insert race, repaired only
  by a rebuild from zero.
- **Processors that ignore the marker** keep their rows; the audit records
  which processors were bound.
- **Attachments** are content-addressed and deduplicated with no owner
  column; `evict()` keeps `file_name` and `get()` re-fetches from a peer.
  Reference rows go; bytes stay if any other document references the hash.
  Serving fails closed once the view holds no row for the document, but a
  download target issued before the purge stays valid until it expires
  (default 300 s, capped by `ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS`).
- **Grants naming a purged group** in surviving documents stop matching
  after an `allowGroupInUse` purge: an allow no longer grants and a deny no
  longer denies, so access can widen. The purge fires no re-evaluation; the
  next re-evaluation of a referencer judges without the group, on each peer
  independently.
- **Deletion notices after a purge** carry only the id and reach every
  matching subscription, including subjects who were refused the earlier
  gated DELETE notice.
- **Backups, WAL, PITR** are the deployer's.
- **Multiple reactors on one database** are unsupported.
- **Restriction (Art. 18)** is not provided.

## Unknowns

- Whether `HypercoreOperationStore` can implement the deletes the purge
  handler needs, or whether `reactor-hypercore` stays unshippable until it
  can.
- The right defaults for the scheduler interval, the deadline and
  `markerGrace` in deployments with many Connect users; 60 s, 30 days and 7
  days are starting values. `markerGrace` delays permission erasure, which
  holds addresses.
- Whether receivers should admit markers only from a configured set of host
  keys rather than from any identity their trust policy accepts.
- Whether a purged group should instead trigger a deterministic
  re-evaluation of its referencers on every peer, treating the marker as a
  membership change at its epoch.
