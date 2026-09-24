# Plan: Document erasure and subject disclosure (GDPR)

Date: 2026-09-23 (revised the same day after a code review of the first draft)
Replaces: the 2026-09-17 subject-redaction plan (local file, never in the
repo). That plan rewrote signer addresses inside stored operations. It is
dropped: the erasure unit is now the whole document, so no operation is ever
rewritten and no signature is voided. The signature plan
(`2026-09-23-action-signature-integrity.md`, "Not in this plan") records the
same decision.

## Problem

Powerhouse ships the Reactor for others to self-host, so the deployer is the
controller. The obligation is to make compliance possible: a deployer must be
able to answer "what do you hold about X" and to erase it.

Today neither is possible.

- **Nothing hard-deletes a document.** `DELETE_DOCUMENT` appends an operation
  (`packages/reactor/src/executor/document-action-handler.ts:514`), sets
  `DocumentSnapshot.isDeleted` (`read-models/document-view.ts:154-166`) and
  removes the `SlugMapping` row (`:183-187`). Every operation, keyframe and
  snapshot stays. No code deletes from `Operation`,
  `operation_index_operations`, `DocumentSnapshot`, `document_collections` or
  `group_references`. `IOperationStore` (`storage/interfaces.ts:143-292`) and
  `IOperationIndex` (`cache/operation-index-types.ts:49`) have no delete verb.
  The only full purge is a test helper
  (`packages/reactor-api/test/utils/postgres-test-db.ts:241-274`) that deletes
  by `documentId` column and misses `Document.id`, `DocumentRelationship`,
  `sync_dead_letters.document_id` and the drive's own collection row.
- **A naive purge is undone by sync.** Incoming operations are deduplicated
  against local history only: `existingActionIds`
  (`executor/simple-job-executor.ts:1984-1993`) and `findIdempotentReplay`
  (`storage/kysely/store.ts:387-426`). After a purge both are empty. A peer
  backfill containing `CREATE_DOCUMENT` re-creates the document
  (`store.ts:216-222` only refuses when rows exist); a batch without it fails
  and is dead-lettered, which writes the personal data back into
  `sync_dead_letters.operations`. The only refuse list,
  `quarantinedDocumentIds` (`sync/sync-manager.ts:153`), is in memory and
  derived from dead-letter rows.
- **No subject index.** The signer's address sits in `Operation.action` JSONB
  on every operation, duplicated into `operation_index_operations.action`.
  There is no index on either, so "which documents hold X" is a scan of both
  tables.
- Per-document rows also live outside the reactor schema: reactor-drive
  `DriveNode` / `DocumentName`, reactor-attachments `attachment_reference`,
  reactor-api `DocumentPermission` / `OperationUserPermission` /
  `DocumentProtection`, processor tables.

## Decisions

1. **The erasure unit is the document.** A subject's data is erased by
   purging every document the controller decides to erase. Operations are
   never rewritten. Signatures, state hashes and authorization replay are
   untouched. The cost, stated in "Not in this plan": the subject's address
   survives as signer in every document not purged, and a purged document's
   id and title survive in its parent drive's log.
2. **Nothing on core interfaces.** `IReactor`, `IReactorClient`,
   `IOperationStore`, `IOperationIndex`, `IReadModel`,
   `IReadModelCoordinator` and `IProcessor` do not change. The purge is a
   concrete class in `packages/reactor/src/admin/`, modelled on
   `DocumentIntegrityService` (`admin/document-integrity-service.ts:23`,
   built by the host from `InProcessReactorModule` fields,
   `apps/connect/src/reactor.worker.ts:368-374`). Read models, processors and
   coordinators opt in through capability interfaces and type guards, the
   pattern of `ILiveReadModelCoordinator` /
   `supportsLiveReadModelRegistration` (`read-models/interfaces.ts:62-72`).
3. **Soft-delete first, then purge.** Purge refuses a document whose snapshot
   is not `isDeleted` on every branch, and refuses while any remote still
   owes an operation of the document. Peers therefore converge on "deleted"
   before the local history disappears. An operator override names the
   remotes it skips, and the audit log records them.
4. **A purge leaves a tombstone.** `document_purges` keeps the purged id
   forever (a UUID is not personal data). Admission refuses any later
   operation for that id, sync drops it before it becomes a job or a dead
   letter, and every row insert that could resurrect the document is guarded
   by the table.
5. **A journal, not only a fan-out.** Read models reconcile against
   `document_purges` on `init()` and on every fan-out, beside the existing
   `ViewState.lastOrdinal` replay. That covers a model in a dead projection
   shard, a package loaded later, a model registered after the purge, and a
   hook that failed once. The coordinator fan-out is the fast path.
6. **Purges are serialized.** One advisory lock is held from the first
   delete through commit, so journal ordinals commit in order and a model's
   cursor never skips a purge. Purges are rare; the lock costs nothing.
7. **Disclosure is an index.** A documents-by-subject read model maps
   `HMAC(identifier)` to document ids. An access request lists documents; the
   controller decides which to purge.
8. **Scope.** Access and erasure only. Restriction (Art. 18) is not in this
   plan. Reactor storage plus the read models wired in switchboard. Browser
   replicas are out of reach (see "Not in this plan").

## Design

### Migration `021_create_document_purges.ts`

`packages/reactor/src/storage/migrations/`. 020 is the latest. Register in
both the import block (`migrator.ts:6-25`) and the `migrations` record
(`:27-47`).

```sql
create table reactor.document_purges (
  ordinal          bigserial primary key,
  "documentId"     text not null unique,
  "directiveId"    text not null,
  "purgedOrdinals" int8range[] not null,   -- operation_index_operations ordinals removed
  "purgedAtUtc"    timestamptz not null,
  "purgedBy"       text
);

alter table reactor."ViewState"
  add column "lastPurgeOrdinal" bigint not null default 0;
```

`purgedOrdinals` exists for one consumer: `AttachmentReferenceReadModel`
parks its cursor at the first missing ordinal (`contiguousEnd`,
`attachment-reference-read-model.ts:130-150, 202-211`) and would sit on a
purged gap forever. Every other consumer compares with `>` (`find`,
`kysely-operation-index.ts:417-450`; `getSinceOrdinal`;
`DocumentSnapshot.lastOperationOrdinal`; `ProcessorManager` routing).

Add `lastPurgeOrdinal` to `ViewStateTable` (`read-models/types.ts:3`) and
export `ViewStateTable` from `packages/reactor/index.ts` (today only
`DocumentViewDatabase` and `InsertableDocumentSnapshot` leave that file,
`:336-339`).

### `KyselyDocumentPurger`

`packages/reactor/src/storage/kysely/document-purger.ts`. One class owns the
SQL for every reactor-schema table, so no store class or interface changes.
It takes the reactor `Kysely` handle (`InProcessReactorModule.database`,
`reactor-builder.ts:1003`).

```ts
class KyselyDocumentPurger {
  constructor(private readonly db: Kysely<Database>) {}

  /** One transaction under the purge lock: deletes every row about the ids, appends one tombstone per id. */
  async purge(ids: string[], directive: PurgeDirective): Promise<PurgeRows>;

  /** Idempotent: deletes rows that arrived for already-tombstoned ids. */
  async sweep(ids: string[]): Promise<PurgeRows>;
}
```

`purge` opens the transaction, takes `pg_advisory_xact_lock(hashtext('purge'))`
(decision 6), and per id takes the exclusive per-document lock the admission
check reads (see below). Tables, from the migrations (verified):

| Table | Predicate |
|---|---|
| `Operation`, `operation_index_operations` | `documentId in ids`; record the removed ordinals |
| `Keyframe` | `documentId in ids` |
| `DocumentSnapshot` | `documentId in ids` (hard delete; today only soft) |
| `SlugMapping` | `documentId in ids` (normally already gone) |
| `Document` | `id in ids`; `DocumentRelationship` cascades both ways (`004:9,12`) |
| `document_collections` | `documentId in ids`, and `collectionId like 'drive.%.<id>'` for drives on every branch (`operation-index-types.ts:136-174`; the self-row at `kysely-operation-index.ts:229-247`) |
| `group_references` | `documentId in ids` only. Rows whose `groupId` is a purged group stay: they key surviving documents. |
| `sync_dead_letters` | `document_id in ids` |
| `ProcessorCursor` | `driveId in ids` |
| `sync_remotes` | rows whose `collection_id` is a purged drive's collection: removed through `SyncManager.remove` before the transaction, because `sync_cursors` lost its foreign key in migration 011 and nothing cascades. Also strip the ids from `filter_document_ids`. |
| `document_purges` | insert one row per id |

Delete in statements of bounded size. That limits statement cost, not lock
duration: the transaction holds its locks until commit, and a very large
document is purged in one transaction by design.

### Admission: the tombstone check

Three write paths can create rows for an id with no local history, and each
gets an unconditional check at its top, not inside a `catch`:

- `executeCreate` (`document-action-handler.ts`), keyed on the header id from
  the action input, not `job.documentId`;
- `executeLoadJob` (`simple-job-executor.ts:1796`), before meta is read: a
  stale `isDeleted` meta in an executor worker's cache would otherwise let a
  load proceed under `documentDecisions` (`:1822`);
- `executeReevaluationJob` (`:1687`).

Each takes `pg_advisory_xact_lock_shared(hashtext('purge:'||id))` inside the
job's transaction (`executeJob`, `:230-262`) and then looks up
`document_purges` by primary key. The purger takes the exclusive lock, so a
job that passed the check before the purge started cannot commit after it,
and a job that starts after the purge sees the tombstone. Both return
`DocumentPurgedError`, which joins the terminal error set
(`job-result-handler.ts:142-156`) so it is never retried, and `DeferredJobs`
(`:132-140`) drops its entries for the ids instead of failing them into dead
letters at TTL.

`ADD_RELATIONSHIP` tolerates a missing target (`document-action-handler.ts:984-989`)
and then writes membership (`:885-892`) and an indexer `Document` row for it.
On the write path a tombstoned target is refused; on the load path the
operation is accepted and the membership and indexer writes are skipped.

### Resurrection guards

`drain()` is best-effort: `ReadModelCoordinator.drain()` awaits only chains
that already exist (`coordinator.ts:75-80`), worker-pool jobs emit
`JOB_WRITE_READY` after an async collection lookup
(`worker-pool-job-executor-manager.ts:341-391`), and
`KyselyWriteCache.persistKeyframe` is fire-and-forget
(`kysely-write-cache.ts:455-477`). A payload that committed before the purge
can therefore be projected after it, and the document view builds its rows
from `context.resultingState`, not from the store (`document-view.ts:206-330`).

So every insert that could bring an id back carries
`where not exists (select 1 from reactor.document_purges p where p."documentId" = <id>)`:
`DocumentSnapshot`, `SlugMapping`, `Keyframe`, the indexer's `Document` and
`DocumentRelationship`, `document_collections`, `sync_dead_letters`. The table
is small and keyed, so the cost is a primary-key probe per insert. The
purge service runs `sweep(ids)` once after the fan-out as a second net.

### Sync

`SyncManager.quarantinedDocumentIds` becomes two sets:

- **inbound refusal**: seeded at startup from `document_purges` and from dead
  letters (`sync-manager.ts:209-213`), consulted by the inbox filter
  (`:833-835`) and before any dead letter is persisted;
- **outbound exclusion**: consulted by the outbox filter (`:1382-1384`).

A purge in progress adds the id to the inbound set first, so no new row for
it can arrive, while the outbox keeps draining what peers are still owed.
After the purge the id is in both. Other reactors on the same database
consult the table when they persist a dead letter and refuse at admission,
and pick the id up into their sets at their next start.

### `DocumentPurgeService`

`packages/reactor/src/admin/document-purge-service.ts`. Constructed by the
host with `database`, `documentView`, `operationIndex`, `writeCache`,
`documentMetaCache`, `collectionMembershipCache`, `syncModule`,
`executorManager` and `readModelCoordinator`. The two caches are local
variables in the builder today (`reactor-builder.ts:698, 703`); add them to
`InProcessReactorModule` (`core/types.ts:555-601`) and the literal (`:996`).

```ts
class DocumentPurgeService {
  /** Expands ids to the set a purge would remove and reports what blocks each. Read-only. */
  async planPurge(ids: string[]): Promise<PurgePlan>;

  /** Purges exactly these ids. Refuses unless planPurge would report them all ready. */
  async purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeOutcome>;
}
```

`planPurge` returns, per candidate: `live` (not `isDeleted` on some branch),
`owed` (remotes that have not received its operations), `group-in-use`, or
`ready`. Candidates are the ids plus, for each drive, every document that was
ever in the drive's collection (`document_collections`, any `leftOrdinal`)
and has no open membership elsewhere. The client's cascade removes
relationships before it deletes children (`reactor-client.ts:1690-1694`), so
an "open members only" query would find nothing.

`purgeDocuments` order:

1. **Refuse if live.** Every id must have `DocumentSnapshot.isDeleted = true`
   on every branch. Otherwise `DocumentNotDeletedError` and nothing changes.
2. **Refuse a group in use.** If `group_references` links a purged group to a
   surviving document, refuse unless `directive.allowGroupInUse`. An absent
   group fails closed (`auth-v1.ts:840-848`), so a later positional walk or
   re-evaluation of the surviving document diverges from peers.
3. **Quarantine inbound.**
4. **Refuse if owed.** For each id D, read D's `document_collections` rows
   including closed ones. For each remote R in `syncManager.list()` bound to
   one of those collections and not being removed, compute
   `target_R = max(leftOrdinal ?? 0, max(ordinal))` over D's
   `operation_index_operations` rows that R would ever be served: ordinal
   below `leftOrdinal` when set (`kysely-operation-index.ts:428-430`),
   `sourceRemote <> R.name`, and passing `filterOperations(R.meta.filter)`
   (`sync-manager.ts:1348-1379`). If no row qualifies, R owes nothing. Else
   require all of:
   - `sync_cursors(R, 'outbox').cursor_ordinal >= target_R`. Both channel
     kinds persist this cursor, and only after the peer acknowledges
     (`gql-req-channel.ts:178-196`; `gql-res-channel.ts:192-220`);
   - no `remote.channel.outbox.items` entry with `documentId = D`;
   - no evicted outbox floor for R at or below `target_R`
     (`SyncManager.evictedOutboxFloors` is private, `:159, 1141-1145`; add an
     accessor);
   - no `remote.channel.deadLetter.items` entry for D.

   Otherwise `DocumentNotFlushedError` names R with its `ConnectionState`
   and `lastSuccessUtcMs`. An offline peer blocks the purge by design.
   `directive.skipRemotes` lists remotes the operator accepts as never
   converging; they are recorded in the outcome and the audit log. Do not
   use `getSyncStatus` (`sync-status-tracker.ts:40-60`): it counts in-memory
   mailboxes only, resets on restart, and drops evicted entries.
5. **Drain.** `readModelCoordinator.drain()`, best-effort (see guards).
6. **Purge.** `KyselyDocumentPurger.purge(ids, directive)`.
7. **Evict.** `writeCache.invalidate(id)` (`kysely-write-cache.ts:492`),
   `documentMetaCache.invalidate(id)` (`document-meta-cache.ts:121`),
   `collectionMembershipCache.invalidate(id)`
   (`collection-membership-cache.ts:52`) for the ids and, for a purged
   drive, for every surviving document that was in its collection: the cache
   is keyed by document and still names the drive. Then, if
   `supportsCacheInvalidation(executorManager)`, broadcast
   `invalidateDocuments(ids)` to the executor workers (below).
8. **Quarantine outbound.**
9. **Fan out.** If `supportsDocumentPurge(readModelCoordinator)`, call
   `purgeDocuments(ids, directive)`; collect per-model outcomes and
   unacknowledged shards.
10. **Sweep.** `purger.sweep(ids)`.

The journal row is written in step 6, so a crash after it leaves the
fan-out to reconcile on the next `init()`. A crash before it leaves nothing
changed except the inbound quarantine, which clears on restart.

### Cascade ordering

`ReactorClient.deleteDocument(Cascade)` removes each descendant's incoming
relationships before deleting it (`reactor-client.ts:1690-1694, 1900-1925`).
The removal sets `leftOrdinal`, and the outbox serves a document's
operations to a drive's remotes only below `leftOrdinal`, so the child's
`DELETE_DOCUMENT` never reaches them. Peers keep a live orphan and step 4
cannot see it. Reverse the order in the client: delete the child, then
remove the relationship. That is an implementation change in
`ReactorClient`, not an interface change.

### Executor workers

With `REACTOR_WORKERS > 0` each worker builds its own `KyselyWriteCache`,
`DocumentMetaCache` and `CollectionMembershipCache`
(`executor/worker/build-worker-executor.ts:163-182`), and `ParentMessage` is
`init | execute | abort | shutdown | load-model` (`executor/worker/protocol.ts:295-300`).
The host cannot evict them, and today's `DocumentIntegrityService.rebuildSnapshots`
has the same gap. Add `InvalidateMessage { type: "invalidate"; correlationId; documentIds }`,
handle it in `run-worker.ts` beside `load-model` (`:370`), and broadcast it
from `WorkerPoolJobExecutorManager` as `loadModel` is
(`worker-pool-job-executor-manager.ts:188-200`). Expose it through
`ICacheInvalidatingExecutorManager` and `supportsCacheInvalidation`, a
capability beside `IJobExecutorManager`, not on it. Until it lands, a
worker's write cache holds the purged document's state in memory until LRU
eviction or restart; the tombstone keeps it unreachable, but it is retained.

### Read-model hook and journal

`BaseReadModel` (`read-models/base-read-model.ts:71`, not abstract) gains
a public default and a reconcile step:

```ts
/** Removes this model's rows for the ids. Default: nothing, reported as uncovered. */
async purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeOutcome> {
  return { readModelId: this.name, rowsAffected: 0, covered: false };
}

/** Applies journal rows above ViewState.lastPurgeOrdinal in ordinal order, then advances it. */
protected async reconcilePurges(): Promise<void>;
```

`covered: false` distinguishes "nothing to delete" from "never taught how";
an unimplemented default must never read as success. Failures return through
the outcome: both coordinators catch and only log read-model errors
(`coordinator.ts:156-162, 183-194`).

`init()` (`:101-119`) calls `reconcilePurges()` after the `getSinceOrdinal`
replay. The coordinator fan-out calls the model's `reconcilePurges()` rather
than `purgeDocuments` directly, so a hook that failed earlier is retried at
the next purge and not only at restart.

`initializeState()` seeds `lastPurgeOrdinal = 0`, not the journal head. A new
model replays the surviving documents, and the parent drive's operations
recreate the purged child's `DriveNode` / `DocumentName` rows and its
`Document` / `DocumentRelationship` rows (`document-indexer.ts:571-633`).
Reconciling the whole journal after the replay removes them again. The
journal is small.

Models with `rebuildStateOnInit` call `writeCache.getState` on replayed
pages (`:182-208`); a page fetched just before a purge throws there. Skip
ids present in `document_purges`.

Cursor and data are not atomic in this class (`commitOperations` runs outside
`persistCursor`, `:174-177` vs `:302-307`), so the hook takes no transaction;
a model that needs atomicity opens its own on its own handle.

Subclasses (six, verified on main):

| Class | `init()` | Own tables | Override |
|---|---|---|---|
| `KyselyDocumentView` (`read-models/document-view.ts:60`) | inherited | reactor schema, purged by the purger | `covered: true, rowsAffected: 0` |
| `KyselyDocumentIndexer` (`storage/kysely/document-indexer.ts:48`) | inherited | reactor schema | same |
| `ProcessorManager` (`processors/processor-manager.ts:61`) | overrides, calls `super.init()` | `ProcessorCursor`, purged by the purger | close processor queues for a purged drive as `DELETE_DOCUMENT` does (`:198-223`); forward to processors that pass `supportsDocumentPurge` |
| `NodeProcessor` (`reactor-drive/src/processors/node-processor.ts:56`) | overrides, calls `super.init()` | `DriveNode`, `DocumentName` | delete `where id in ids or driveId in ids`; `applyDeleteDocument` (`:231-240`) matches `id` only and would leave a purged drive's folder rows |
| `AttachmentReferenceReadModel` (`reactor-attachments/.../attachment-reference-read-model.ts:31`) | reimplements the loop without `super.init()` (`:65-82`) | `attachment_reference`, separate writer | add the delete and call `reconcilePurges()` by hand; count `purgedOrdinals` as filled in `contiguousEnd`; cursor and rows cannot share a transaction, say so in the outcome |
| `WorkflowTriggersReadModel` (`reactor-workflow/src/reactor/workflow-triggers-read-model.ts:25`) | returns early on fresh registration without `super.init()` (`:47-54`) | `run.trigger_payload`, `step_execution.input/output`, opaque text (`reactor-workflow/src/reactor/store.ts:122-190`) | **uncovered** until a document-id column exists; reports `covered: false` |

`SubscriptionNotificationReadModel` (`subs/subscription-notification-read-model.ts:14`)
implements `IReadModel` directly and owns no tables: give it an explicit
`covered: true` no-op rather than let the guard exclude it.

### Capability interfaces

`read-models/interfaces.ts`, beside `ILiveReadModelCoordinator`:

```ts
export interface IDocumentPurgingReadModel extends IReadModel {
  purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeOutcome>;
}
export interface IDocumentPurgingCoordinator extends IReadModelCoordinator {
  purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeFanOutOutcome>;
}
export function supportsDocumentPurge(x: unknown): x is IDocumentPurgingReadModel | IDocumentPurgingCoordinator;
```

The same guard applies to processors: `IProcessor` keeps `onOperations` and
`onDisconnect` only, and `ProcessorManager` forwards to processors that pass
it. Analytics processors can then delete their series through
`clearSeriesBySource` (`analytics-engine/knex/src/KnexAnalyticsStore.ts:66-82`,
series named `ph/doc/<id>/...`); that wiring is phase 4, optional.

`ReadModelCoordinator` (`read-models/coordinator.ts:25`) awaits each model.
`HybridProjectionCoordinator` (`projection/hybrid-projection-coordinator.ts:30`)
runs host models then delegates to `ProjectionShardManager`
(`projection/projection-shard-manager.ts:197`), which broadcasts to every
ready shard, not `bucketFor(documentId)`: a directive can span shards.
Correlation follows `drain()` / `handleDrained()` / `pendingDrains`
(`:331`, `:656`, `:208`).

### Projection worker protocol

`projection/protocol.ts`: one parent message `"purge-documents"` with
`correlationId`, one reply `"documents-purged"` with `shardId` and outcomes,
both structured-cloneable (`:4-5`). Add the case to the worker switch
(`projection-worker/run-projection-worker.ts:325`; the `never` check at
`:389` makes this a compile error until handled) and its mirror in the shard
manager (`projection-shard-manager.ts:518-576`). Only `document-view` and
`document-indexer` can live in a worker (`protocol.ts:34`), so today this is
one worker, two models, both reporting `covered: true` with nothing to do.
The path exists for the dead-shard and restart cases, not for rows.

### `packages/reactor-privacy`

An add-on wired by the host after the build, the way the attachment read
model is (`apps/switchboard/src/server.mts:662-665`) and the workflow read
model is (`apps/switchboard/src/workflow-runtime.mts:238-276`,
`coordinator.addReadModel`). It takes the reactor DB handle, the
`DocumentPurgeService`, and reactor-api's `DocumentPermissionService`.

1. **Documents-by-subject read model.** A `BaseReadModel` over the reactor
   handle, migrations with explicit ledger names
   (`kysely_migration_reactor_privacy` / `_lock`, as
   `reactor-drive/src/schema/migrations/migrator.ts:11-13` does):

   ```sql
   create table reactor.subject_documents (
     "subjectHash"  text not null,   -- HMAC-SHA256(deploymentSecret, lower(identifier))
     "documentId"   text not null,
     role           text not null,   -- 'signer' | 'app-key' | 'creator' | 'header-key' | 'named'
     "firstOrdinal" bigint not null,
     "lastOrdinal"  bigint not null,
     primary key ("subjectHash", "documentId", role)
   );
   ```

   Identifiers indexed: `signer.user.address` (`signer`), `signer.app.key`
   (`app-key`, a per-browser did:key in Connect), the auth scope's `creator`
   (`creator`), `header.sig.publicKey` (`header-key`), and addresses in
   inputs (`named`): grant principals and `match` / `where` literals that
   parse as addresses, reactor-group members. `PHDocumentState.deletedBy`
   exists as a type only (`state.ts:110`) and is never written; it is not
   indexed. Match addresses case-insensitively; nothing normalises case at
   write time (only `auth-v1.ts:831-836, 850-851` lowercase, at compare
   time). Personal data inside model-specific state is not indexed, and the
   access request says so.

   HMAC with a deployment secret: the address is enumerable, so a plain hash
   lets anyone confirm a subject is present. Lookup by address still works
   because the HMAC is deterministic. Its value is that the index and the
   audit log outlive the erasure without holding the identifier; while the
   documents exist the address is in `Operation.action` in the clear anyway.
   Rotating the secret is a full rebuild of the index; losing it loses the
   ability to match old audit rows to an address. The model implements
   `purgeDocuments` by deleting its own rows for the ids.

2. **Disclosure.** `listDocuments(identifier)` reads the index. Also report the
   non-document homes: `sync_remotes.bound_address` (migration 018) and the
   reactor-api permission rows for the address.

3. **Erasure request.** `planErasure(ids)` wraps `planPurge`.
   `eraseDocuments(ids, request)` calls `purgeDocuments`, then
   `DocumentPermissionService.deleteAllDocumentPermissions` per id
   (`reactor-api/src/services/document-permission.service.ts:190-200`, exists,
   uncalled) and the `DocumentProtection` row, in the other handle and its
   own transaction. Records both outcomes.

4. **Audit log.** Own append-only table with its own retention: request id,
   requester, authoriser, ids, `subjectHash`, skipped remotes, per-model
   `rowsAffected` and `covered`, unacknowledged shards, permission-table
   outcome. Not a PHDocument, or it inherits the problem it records.

5. **Subgraph.** Request API over `SubgraphArgs` (`http`,
   `authorizationService`, `reactorClient`, `relationalDb`). Erasure requires
   an admin.

## Phases

1. Migration 021, `ViewStateTable` export, `KyselyDocumentPurger` with the
   purge lock, the three admission checks with the shared lock,
   `DocumentPurgedError` terminal, `DeferredJobs` drop, the
   `ADD_RELATIONSHIP` target check, the resurrection guards, the two sync
   sets and dead-letter refusal. Integration test: purge, then replay the
   original history from a peer and assert nothing comes back and nothing
   dead-letters.
2. `DocumentPurgeService` with `planPurge`, the preconditions, drain, evict,
   sweep, fan-out through `ReadModelCoordinator` only. `BaseReadModel` hook,
   `reconcilePurges`, capability interfaces, the six overrides. Expose the
   two caches and the evicted-floor accessor. Reverse the client's cascade
   order.
3. Projection worker protocol, `ProjectionShardManager` broadcast,
   `HybridProjectionCoordinator` delegation. Executor worker `invalidate`
   message and the executor-manager capability.
4. `reactor-privacy`: index and backfill, disclosure, erasure request,
   audit log, subgraph, switchboard wiring. Optional: processor guard and
   analytics series deletion.

## Tests

- **Purger:** after `purge`, every table in the table above has no row for
  the id; the drive self-row on each branch and the closed members are gone;
  `sync_remotes` for the drive's collection are gone; the tombstone carries
  the removed ordinal ranges. A document with more rows than one statement
  is handled.
- **Admission:** a `CREATE_DOCUMENT` for a tombstoned id fails with
  `DocumentPurgedError` and is not retried; a load job fails the same way
  with `documentDecisions` off and on, and with a stale `isDeleted` meta in
  the cache; a reevaluation job for the id fails the same way; an
  `ADD_RELATIONSHIP` to a tombstoned target is refused on write and creates
  no membership or indexer row on load.
- **Race:** start a load job, hold it before commit, purge concurrently;
  exactly one of the two commits, and if the load committed first the sweep
  removes its rows.
- **Guards:** a `write-ready` payload delivered after the purge inserts no
  `DocumentSnapshot`, `SlugMapping` or `Keyframe`; a `sync_dead_letters`
  insert for a tombstoned id is refused.
- **Sync:** two reactors, real Postgres. Create, edit, `DELETE_DOCUMENT`,
  flush, purge on A. Reset B's push cursor and let it backfill: A stores
  nothing, dead-letters nothing, and the inbound set holds the id after A
  restarts. Repeat with a fresh remote added after the purge, and with a
  cascade-deleted child (asserting its `DELETE_DOCUMENT` reached B under the
  reversed order).
- **Preconditions:** live document refused; owed remote refused and named
  with its connection state; `skipRemotes` proceeds and is recorded; a group
  in use refused without the override; a second purge of the same id is a
  no-op with a distinct outcome.
- **Journal:** two purges commit in ordinal order under the lock;
  `reconcilePurges` advances the cursor only after the hook returns; a
  throwing hook leaves it unadvanced and is retried at the next fan-out;
  `initializeState` seeds 0 and a fresh `NodeProcessor` replaying the parent
  drive ends with no row for the purged child.
- **Per model:** for each of the six subclasses, write rows, purge, assert
  the model's tables are clean and the count matches; `NodeProcessor` for a
  purged drive leaves no folder rows; `AttachmentReferenceReadModel` does
  not park on a purged gap.
- **Worker:** extend
  `test/integration/hybrid-projection-worker-postgres.test.ts` (real worker
  over a real `pg.Pool`): the broadcast reaches the shard; a stopped shard
  is reported unacknowledged; it converges on restart via the journal. The
  executor worker evicts on `invalidate`.
- **Disclosure:** operations from two signers across three documents, one
  address named in a grant, one distinct app key; `listDocuments` returns
  exactly the right ids and roles for each, case-insensitively; after
  purging one document the index rows are gone.
- Run `pnpm test` per package and `pnpm tsc --build`, not isolated
  `vitest run`.

## Not in this plan

- **The signer address in undeleted documents.** Every document the subject
  touched and the controller keeps still holds the address on each of their
  operations. Erasure of a subject is erasure of documents; there is no
  per-operation path by decision 1.
- **The parent drive's log.** `ADD_RELATIONSHIP` and drive node operations in
  the parent embed the child's id and title. Purging the child leaves them.
  Purging the drive removes them.
- **Peers.** `PollSyncEnvelopes` ships `signer { user { address ... } }` to
  every remote (`sync/channels/gql-req-channel.ts:654-690`), and nothing in
  the protocol carries a purge. Peers learn "deleted", never "erased".
  Erasure is per deployment. A remote listed in `skipRemotes` does not even
  learn "deleted".
- **Browser replicas.** Every Connect client holds a full PGlite replica, and
  Connect keeps a pre-migration copy in IndexedDB for 30 days
  (`apps/connect/src/utils/pglite-migration.ts:12`). Exposing the purger in
  Connect is a follow-up.
- **Restriction (Art. 18).**
- **Model-specific state.** Personal data typed into a document's own state
  is neither indexed for disclosure nor findable except by purging the
  document the controller already knows about.
- **`IProcessor` projections without the guard.** `VetraReadModelProcessor`
  (`vetra_package`, keyed on `document_id`, no delete), `RelationalDbProcessor`
  subclasses, `CodegenProcessor`, `OpenPanelProcessor` (third-party SaaS),
  and `WorkflowTriggersReadModel` as noted.
- **Attachments.** Content-addressed, globally deduplicated, no owner column;
  `evict()` keeps `file_name` and `get()` re-fetches from a peer. A purged
  document's `attachment_reference` rows go; the bytes stay if any other
  document references the hash, and there is no hard delete for them.
- **Grants naming a purged group.** With `allowGroupInUse`, surviving
  documents whose grants name the group keep them; the group fails closed
  and their history may re-judge differently from peers.
- **Sync mailboxes.** The in-memory inbox, outbox and dead-letter mailboxes
  cannot be evicted by id; the two sets stop them from being acted on.
- `reactor-hypercore` has no delete path at all
  (`hypercore-operation-store.ts:161-174`); do not ship it until it does.

## Separate tickets found on the way

- `KyselyKeyframeStore.deleteKeyframes` ignores `branch` when `scope` is
  undefined (`storage/kysely/keyframe-store.ts:123-146`), so
  `DocumentIntegrityService.rebuildKeyframes(id, "main")` (`:168-185`)
  deletes every branch's keyframes.
- `DocumentIntegrityService.rebuildSnapshots` writes nothing; it only
  invalidates the host's write cache (`:187-204`), and under
  `REACTOR_WORKERS > 0` that cache is not the one the executors use.
- `NodeProcessor.applyDeleteDocument` hard-deletes without checking
  `isDenied`; `document-view.ts:135-152` explains why a refused
  `DELETE_DOCUMENT` must not.
- `apps/switchboard/src/attachment-reference-read-model.mts:111,113` calls
  `init()` twice.
- `sync_dead_letters` has no retention; `remove` / `removeByRemote` have no
  production callers.
- `DocumentPermissionService.deleteAllDocumentPermissions` is called only
  from tests; `DELETE_DOCUMENT` does not clear permissions.
- `touchChannel` (`reactor-api/src/graphql/reactor/resolvers.ts:1338-1360`)
  persists a remote for every polling client. An abandoned client holds an
  outbox cursor forever; the stale-remote prune (`sync-manager.ts:1147-1164`)
  is what bounds it, and its window decides how long an erasure can be
  blocked without `skipRemotes`.
