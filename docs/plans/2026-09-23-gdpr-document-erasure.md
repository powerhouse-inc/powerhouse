# Plan: Document erasure and subject disclosure (GDPR)

Date: 2026-09-23
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
  `group_references`. `IOperationStore` and `IOperationIndex` have no delete
  verb (`storage/interfaces.ts:143-292`). The only full purge is a test helper
  (`packages/reactor-api/test/utils/postgres-test-db.ts:241-274`) that deletes
  by `documentId` column and misses `Document.id`, `DocumentRelationship`,
  `sync_dead_letters.document_id` and the drive's own collection row.
- **A naive purge is undone by sync.** Incoming operations are deduplicated
  against local history only: `existingActionIds`
  (`executor/simple-job-executor.ts:1984-1993`) and `findIdempotentReplay`
  (`storage/kysely/store.ts:387-426`). After a purge both are empty. A peer
  backfill containing `CREATE_DOCUMENT` re-creates the document (`store.ts:216-222`
  only refuses when rows exist); a batch without it fails and is dead-lettered,
  which writes the personal data back into `sync_dead_letters.operations`.
  The only refuse list, `quarantinedDocumentIds` (`sync/sync-manager.ts:153`),
  is in memory and derived from dead-letter rows.
- **No subject index.** The signer's address sits in `Operation.action` JSONB
  on every operation, duplicated into `operation_index_operations.action`.
  There is no index on either, so "which documents hold X" is a scan of both
  tables.
- Per-document rows also live outside the reactor schema: reactor-drive
  `DriveNode` / `DocumentName`, reactor-attachments `attachment_reference`,
  reactor-api `DocumentPermission` / `OperationUserPermission` /
  `DocumentProtection`, reactor-workflow triggers, processor tables.

## Decisions

1. **The erasure unit is the document.** A subject's data is erased by
   purging every document the controller decides to erase. Operations are
   never rewritten. Signatures, state hashes and authorization replay are
   untouched. The cost, stated in "Not in this plan": the subject's address
   survives as signer in every document not purged, and a purged document's
   id and title survive in its parent drive's log.
2. **Nothing on core interfaces.** `IReactor`, `IReactorClient`,
   `IOperationStore`, `IReadModel` and `IReadModelCoordinator` do not change.
   The purge is a concrete class in `packages/reactor/src/admin/`, modelled on
   `DocumentIntegrityService` (`admin/document-integrity-service.ts:23`,
   built by the host from `InProcessReactorModule` fields,
   `apps/connect/src/reactor.worker.ts:368-374`). Read models opt in through a
   capability interface and type guard, the pattern of
   `ILiveReadModelCoordinator` / `supportsLiveReadModelRegistration`
   (`read-models/interfaces.ts:62-72`).
3. **Soft-delete first, then purge.** Purge refuses a document whose snapshot
   is not `isDeleted`, and refuses while any remote has not yet received the
   `DELETE_DOCUMENT` operation. Peers therefore converge on "deleted" before
   the local history disappears.
4. **A purge leaves a tombstone.** `document_purges` keeps the purged id
   forever (a UUID is not personal data). Admission refuses any later
   operation for that id where a missing document is today read as "new",
   and sync drops it before it reaches a job or a dead letter.
5. **A journal, not only a fan-out.** Read models reconcile against
   `document_purges` on `init()`, beside the existing `ViewState.lastOrdinal`
   replay. That covers a model in a dead projection shard, a package loaded
   later, or a model registered after the purge. The coordinator fan-out is
   the fast path.
6. **Disclosure is an index.** A documents-by-subject read model maps
   `HMAC(address)` to document ids. An access request lists documents; the
   controller decides which to purge.
7. **Scope.** Access and erasure only. Restriction (Art. 18) is not in this
   plan. Reactor storage only: in-memory caches on other threads are evicted
   by restart, and browser replicas are out of reach (see "Not in this plan").

## Design

### Migration `021_create_document_purges.ts`

`packages/reactor/src/storage/migrations/`. 020 is the latest. Register in
both the import block (`migrator.ts:6-25`) and the `migrations` record
(`:27-47`).

```sql
create table reactor.document_purges (
  ordinal        bigserial primary key,
  "documentId"   text not null unique,
  "directiveId"  text not null,
  "purgedAtUtc"  timestamptz not null,
  "purgedBy"     text
);

alter table reactor."ViewState"
  add column "lastPurgeOrdinal" bigint not null default 0;
```

Add `lastPurgeOrdinal` to `ViewStateTable` (`read-models/types.ts:3`) and
export `ViewStateTable` from `packages/reactor/index.ts` (today only
`DocumentViewDatabase` and `InsertableDocumentSnapshot` leave that file,
`:336-339`).

### `KyselyDocumentPurger`

`packages/reactor/src/storage/kysely/document-purger.ts`. One class owns the
SQL for every reactor-schema table, so no store class or interface changes.
It takes the reactor `Kysely` handle (`InProcessReactorModule.database`,
`reactor-builder.ts:1003`) and runs one transaction per call:

```ts
class KyselyDocumentPurger {
  constructor(private readonly db: Kysely<Database>) {}

  /** Deletes every row about the ids and appends one tombstone per id. */
  async purge(ids: string[], directive: PurgeDirective): Promise<PurgeRows>;
}
```

Tables, from the migrations (verified):

| Table | Predicate |
|---|---|
| `Operation`, `operation_index_operations` | `documentId in ids` |
| `Keyframe` | `documentId in ids` |
| `DocumentSnapshot` | `documentId in ids` (hard delete; today only soft) |
| `SlugMapping` | `documentId in ids` (normally already gone) |
| `Document` | `id in ids`; `DocumentRelationship` cascades (`004:9,12`) |
| `DocumentRelationship` | `sourceId in ids or targetId in ids`, explicit, for rows pointing at a purged id from a surviving document |
| `document_collections` | `documentId in ids`, and `collectionId = 'drive.<branch>.<id>'` for drives (`operation-index-types.ts:136-174`; the self-row at `kysely-operation-index.ts:229-247`) |
| `group_references` | `documentId in ids` only. Rows whose `groupId` is a purged group stay: they key surviving documents, and their grants now name a group that no longer resolves. |
| `sync_dead_letters` | `document_id in ids` |
| `ProcessorCursor` | `driveId in ids` |
| `document_purges` | insert one row per id |

Chunk the deletes (migration 019 shows an unbatched whole-table `UPDATE`;
do not copy that). Ordinal gaps in `operation_index_operations` are fine:
`getSinceOrdinal` and the sync cursors are `>` comparisons, not counters.

### Admission: the tombstone check

The regular write path reads document meta first and fails on
`DocumentNotFoundError` (`simple-job-executor.ts:711-724`), so a purged
document is already refused there. Two places treat a missing document as
new, and both need a `document_purges` primary-key lookup:

- the create path, before `DocumentAlreadyExistsError` is evaluated
  (`document-action-handler.ts`, the `CREATE_DOCUMENT` branch);
- the load path, where a missing meta is swallowed with "may be a new
  document" (`simple-job-executor.ts:1815-1817`).

Both return a new `DocumentPurgedError`. A lookup by primary key on a rare
path is cheap; no in-memory set is needed in the executor, which matters
because executor workers run on their own threads with their own caches.

### Sync: drop before a job exists

`SyncManager` seeds `quarantinedDocumentIds` at startup from dead letters
(`sync-manager.ts:209-213`). Seed it from `document_purges` as well, and add
the id on purge. Both the inbox filter (`:833-835`) and the outbox filter
(`:1382-1384`) already consult that set. A purged id therefore never becomes a
load job, never dead-letters, and is never pushed.

### `DocumentPurgeService`

`packages/reactor/src/admin/document-purge-service.ts`. Constructed by the
host with `database`, `documentView`, `writeCache`, `syncModule`,
`readModelCoordinator` and the executor's `documentMetaCache` and
`collectionMembershipCache` (the last two are built in the builder and not on
the module today; expose them there, an implementation field).

```ts
class DocumentPurgeService {
  /** Purges ids and their orphaned children. Every id must already be soft-deleted. */
  async purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeOutcome>;
}
```

Order, per call:

1. **Expand.** For each drive in `ids`, add the members of its collection
   that belong to no other open collection. Mirror `getOrphanedChildren` on
   the client (`client/reactor-client.ts:1652-1720`); the collection query is
   `document_collections` with `leftOrdinal is null`.
2. **Refuse if live.** Every id must have `DocumentSnapshot.isDeleted = true`
   for the branch (`document-view.ts:154-166`). Otherwise
   `DocumentNotDeletedError` names the ids and nothing is purged.
3. **Refuse if unflushed.** For each remote bound to a collection the
   document was in (`getRemotesForCollection`, `sync-manager.ts:771-777`),
   the remote's push cursor in `sync_cursors` must be past the
   `DELETE_DOCUMENT` operation's ordinal and the in-memory outbox must hold
   nothing for the id. Otherwise `DocumentNotFlushedError` names the remotes.
   Whether `getSyncStatus(documentId)` (`sync-manager.ts:607`) already
   exposes this is a phase 2 check; if not, read the cursor storage directly.
4. **Drain.** `readModelCoordinator.drain()` so no `write-ready` /
   `read-ready` payload for the document is still crossing the projection
   worker boundary; a worker that finished after the purge would re-insert a
   snapshot row. Drain reaches ready shards only
   (`projection-shard-manager.ts:332`); a non-ready shard is reported and
   converges through the journal.
5. **Purge.** `KyselyDocumentPurger.purge(ids, directive)`: rows and
   tombstones in one transaction.
6. **Evict.** `writeCache.invalidate(id)` (`cache/kysely-write-cache.ts:492`),
   `documentMetaCache.invalidate(id)` (`cache/document-meta-cache.ts:121`),
   `collectionMembershipCache.invalidate(id)`
   (`cache/collection-membership-cache.ts:52`). Without the meta eviction a
   later load fails with `DocumentDeletedError` instead of `DocumentPurgedError`;
   harmless but misleading.
7. **Quarantine.** Add the ids to the sync manager's set.
8. **Fan out.** If `supportsDocumentPurge(readModelCoordinator)`, call
   `purgeDocuments(ids, directive)` and collect per-model outcomes and
   unacknowledged shards.

Steps 5 to 8 are not atomic with each other. The journal row is written in
step 5, so a crash after it leaves the fan-out to reconcile on the next
`init()`. A crash before it leaves nothing changed.

### Read-model hook and journal

`BaseReadModel` (`read-models/base-read-model.ts:71`, not abstract) gains
a public default and a reconcile step:

```ts
/** Removes this model's rows for the ids. Default: nothing, reported as uncovered. */
async purgeDocuments(ids: string[], directive: PurgeDirective): Promise<PurgeOutcome> {
  return { readModelId: this.name, rowsAffected: 0, covered: false };
}

/** Applies journal rows above ViewState.lastPurgeOrdinal, then advances it. */
protected async reconcilePurges(): Promise<void>;
```

`covered: false` distinguishes "nothing to delete" from "never taught how";
an unimplemented default must never read as success. Failures return through
the outcome: both coordinators catch and only log read-model errors
(`coordinator.ts:156-162, 183-194`).

`init()` (`:101-119`) calls `reconcilePurges()` after the `getSinceOrdinal`
replay. `initializeState()` seeds `lastPurgeOrdinal` at the journal head: a
new model replays a log that no longer contains the purged operations.

Cursor and data are not atomic in this class (`commitOperations` runs outside
`persistCursor`, `:174-177` vs `:302-307`), so the hook takes no transaction;
a model that needs atomicity opens its own on its own handle.

Subclasses (six, verified on main):

| Class | `init()` | Own tables | Override |
|---|---|---|---|
| `KyselyDocumentView` (`read-models/document-view.ts:60`) | inherited | reactor schema, purged by the purger | report `covered: true, rowsAffected: 0` |
| `KyselyDocumentIndexer` (`storage/kysely/document-indexer.ts:48`) | inherited | reactor schema | same |
| `ProcessorManager` (`processors/processor-manager.ts:61`) | overrides, calls `super.init()` | `ProcessorCursor`, purged by the purger | close processor queues for a purged drive as `DELETE_DOCUMENT` does (`:198-223`); processors themselves stay uncovered |
| `NodeProcessor` (`reactor-drive/src/processors/node-processor.ts:56`) | overrides, calls `super.init()` | `DriveNode`, `DocumentName` | delete as `applyDeleteDocument` does (`:231-240`) |
| `AttachmentReferenceReadModel` (`reactor-attachments/.../attachment-reference-read-model.ts:31`) | reimplements the loop without `super.init()` (`:65-82`) | `attachment_reference` in the other DB handle | add the delete and call `reconcilePurges()` by hand; cursor and rows cannot share a transaction, say so in the outcome |
| `WorkflowTriggersReadModel` (`reactor-workflow/src/reactor/workflow-triggers-read-model.ts:25`) | check | its trigger tables | delete rows for the ids |

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
export function supportsDocumentPurge(x: unknown): x is IDocumentPurgingCoordinator;
```

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
     "subjectHash"  text not null,   -- HMAC-SHA256(deploymentSecret, lower(address))
     "documentId"   text not null,
     role           text not null,   -- 'signer' | 'named'
     "firstOrdinal" bigint not null,
     "lastOrdinal"  bigint not null,
     primary key ("subjectHash", "documentId", role)
   );
   ```

   `signer` rows come from `action.context.signer.user.address`. `named`
   rows come from inputs that carry an address: grant principals and
   `match` / `where` literals in the auth scope, reactor-group members,
   `deletedBy`. Match case-insensitively; nothing normalises case at write
   time (only `auth-v1.ts:831-836, 850-851` lowercase, at compare time).
   The HMAC key is a deployment secret: an address is enumerable, so a plain
   hash would let anyone confirm a subject is present. The model implements
   `purgeDocuments` by deleting its own rows for the ids.

2. **Disclosure.** `listDocuments(address)` reads the index. Also report the
   non-document homes: `sync_remotes.bound_address` (migration 018) and the
   reactor-api permission rows for the address.

3. **Erasure request.** `eraseDocuments(ids, request)`: calls
   `DocumentPurgeService.purgeDocuments`, then
   `DocumentPermissionService.deleteAllDocumentPermissions` per id
   (`reactor-api/src/services/document-permission.service.ts:190-200`, exists,
   uncalled) and the `DocumentProtection` row, in the other handle and its
   own transaction. Records both outcomes.

4. **Audit log.** Own append-only table with its own retention: request id,
   requester, authoriser, ids, `subjectHash`, per-model `rowsAffected` and
   `covered`, unacknowledged shards, permission-table outcome. Not a
   PHDocument, or it inherits the problem it records.

5. **Subgraph.** Request API over `SubgraphArgs` (`http`,
   `authorizationService`, `reactorClient`, `relationalDb`). Erasure requires
   an admin.

## Phases

1. Migration 021, `ViewStateTable` export, `KyselyDocumentPurger`, the two
   admission checks, sync quarantine seeding. Integration test: purge, then
   replay the original history from a peer and assert nothing comes back and
   nothing dead-letters.
2. `DocumentPurgeService` with preconditions, drain, evict, fan-out through
   `ReadModelCoordinator` only. `BaseReadModel` hook, `reconcilePurges`,
   capability interfaces, the six overrides. Expose `documentMetaCache` and
   `collectionMembershipCache` on `InProcessReactorModule`. Settle the flush
   check against `getSyncStatus` or cursor storage.
3. Worker protocol, `ProjectionShardManager` broadcast,
   `HybridProjectionCoordinator` delegation.
4. `reactor-privacy`: index and backfill, disclosure, erasure request,
   audit log, subgraph, switchboard wiring.

## Tests

- **Purger:** after `purge`, every table in the table above has no row for
  the id; the drive self-row and orphaned children are gone; surviving
  documents' `DocumentRelationship` rows to the id are gone; the tombstone
  exists. Chunking covers a document with more rows than one chunk.
- **Admission:** a `CREATE_DOCUMENT` for a tombstoned id fails with
  `DocumentPurgedError`; a load job for it fails the same way with
  `documentDecisions` off and on.
- **Sync:** two reactors, real Postgres. Create, edit, `DELETE_DOCUMENT`,
  flush, purge on A. Then reset B's push cursor and let it backfill: A stores
  nothing, dead-letters nothing, and the quarantine set holds the id after A
  restarts. Repeat with a fresh remote added after the purge.
- **Preconditions:** purge of a live document is refused and changes
  nothing; purge before flush is refused and names the remote; a second purge
  of the same id is a no-op with a distinct outcome.
- **Journal:** `reconcilePurges` advances the cursor only after the hook
  returns; a throwing hook leaves it unadvanced and reports through the
  outcome; `initializeState` seeds at the head; the default reports
  `covered: false`.
- **Per model:** for each of the six subclasses, write rows, purge, assert
  the model's tables are clean and the count matches.
- **Worker:** extend
  `test/integration/hybrid-projection-worker-postgres.test.ts` (real worker
  over a real `pg.Pool`): the broadcast reaches the shard; a stopped shard
  is reported unacknowledged; it converges on restart via the journal. None
  of those cases exists there today.
- **Disclosure:** operations from two signers across three documents, one
  address named in a grant; `listDocuments` returns exactly the right ids and
  roles for each, case-insensitively; after purging one document the index
  row is gone.
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
  Erasure is per deployment.
- **Browser replicas.** Every Connect client holds a full PGlite replica, and
  Connect keeps a pre-migration copy in IndexedDB for 30 days
  (`apps/connect/src/utils/pglite-migration.ts:12`). Exposing the purger in
  Connect is a follow-up.
- **Restriction (Art. 18).**
- **`IProcessor` projections.** `IProcessor` has only `onOperations` and
  `onDisconnect`. Uncovered: `VetraReadModelProcessor` (`vetra_package`,
  keyed on `document_id`, no delete), drive and document analytics (series
  under `ph/doc/<id>/...`; `clearSeriesBySource` exists,
  `analytics-engine/knex/src/KnexAnalyticsStore.ts:66-82`, and could be wired
  later), `RelationalDbProcessor` subclasses, `CodegenProcessor`,
  `OpenPanelProcessor` (third-party SaaS).
- **Attachments.** Content-addressed, globally deduplicated, no owner column;
  `evict()` keeps `file_name` and `get()` re-fetches from a peer. A purged
  document's `attachment_reference` rows go; the bytes stay if any other
  document references the hash, and there is no hard delete for them.
- **In-memory caches on other threads.** Executor workers and the projection
  worker each hold their own `KyselyWriteCache` and `DocumentMetaCache`;
  the host cannot evict them. The tombstone makes the stale entries
  harmless; a restart clears them.
- **Grants naming a purged group.** Surviving documents whose grants name a
  purged group document keep those grants; the group no longer resolves.
- **Sync mailboxes.** The in-memory inbox, outbox and dead-letter mailboxes
  cannot be evicted by id; the quarantine set stops them from being acted on.
- `reactor-hypercore` has no delete path at all
  (`hypercore-operation-store.ts:161-174`); do not ship it until it does.

## Separate tickets found on the way

- `KyselyKeyframeStore.deleteKeyframes` ignores `branch` when `scope` is
  undefined (`storage/kysely/keyframe-store.ts:123-146`), so
  `DocumentIntegrityService.rebuildKeyframes(id, "main")` (`:168-185`)
  deletes every branch's keyframes.
- `DocumentIntegrityService.rebuildSnapshots` writes nothing; it only
  invalidates write-cache entries (`:187-204`).
- `NodeProcessor.applyDeleteDocument` hard-deletes without checking
  `isDenied`; `document-view.ts:135-152` explains why a refused
  `DELETE_DOCUMENT` must not.
- `apps/switchboard/src/attachment-reference-read-model.mts:111,113` calls
  `init()` twice.
- `sync_dead_letters` has no retention; `remove` / `removeByRemote` have no
  production callers.
- `DocumentPermissionService.deleteAllDocumentPermissions` is called only
  from tests; `DELETE_DOCUMENT` does not clear permissions.
- Stale comment: `apps/switchboard/src/types.ts:14` names a nonexistent
  `addDefaultReactorDrive`.
