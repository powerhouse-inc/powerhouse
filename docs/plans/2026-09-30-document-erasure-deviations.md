# Document erasure: deviations from the plan

Date: 2026-09-30
Companion to: [Document erasure and subject disclosure](2026-09-24-document-erasure.md)
Branch: `feat/document-erasure` at 37de0d0795

The plan asks for every deviation to be recorded with file:line and the
reason, and for spec changes to be proposed rather than made. This is that
record. The plan itself is unchanged.

Branch layout: one branch per stage, `feat/erasure-stage-0` to
`feat/erasure-stage-3`, each merged into the next. `feat/document-erasure`
points at the stage 3 head, so it carries all four. Stage 4 has no branch of
its own: it is committed on `feat/document-erasure`.

Line numbers are against 37de0d0795, except in entries the final review
round changed, which cite lines after that round. Paths are relative to
`packages/reactor/src` unless they start with `packages/` or `apps/`. Where a
line moves easily the symbol is given too.

Entries read `path:line (symbol) — what — why`. Reasons come from the track
reports and review findings; where a report gave none, the reason is read
from the code.

## Stage 0

- `client/reactor-client.ts:1579` (`waitsForTarget`) — an edge whose source is
  deleted no later than its target gets no `dependsOn`; this covers edges into
  the root from inside the deletion set — the plan's rule would make those
  edges wait on a delete that waits on them (a cycle).
- `client/drive-client.ts:581` (`removeFileNode`) — `DELETE_NODE`, then
  `DELETE_DOCUMENT`, then `REMOVE_RELATIONSHIP` with `dependsOn` on the delete
  — the plan's Convergence paragraph assumes only the cascade path closes a
  child's membership; removing a file through the drive client closed it
  before the child's delete was served.

## Stage 1

### Executor and store

- `storage/kysely/document-purges.ts:8` (`PURGE_LOCK_BUCKETS = 1024`) — the
  advisory key is `(PURGE_NS, hashtext(id) & 1023)`, not `hashtext(id)` —
  per-id shared locks exhausted the lock table: a job with 16 000
  `ADD_RELATIONSHIP` targets failed with "out of shared memory" (10 000 fit,
  20 000 failed). Cost: a purge blocks about 1/1024 of documents while it
  runs, and cross-bucket waits can form soft cycles that `deadlock_timeout`
  breaks (about 1 s stall). No hard deadlock was found.
- `executor/util.ts:510` (`jobWriteIds`) — also locks every group named by an
  auth-scope action (`mentionedGroupIds`) — a group purge raced a concurrent
  grant naming the group; both committed against the pre-purge group.
- `executor/simple-job-executor.ts:731` (`purgedRefusal`) — a submitted
  auth-scope action naming a purged group fails with `DocumentPurgedError`;
  on load it is accepted — the grant would otherwise succeed here and diverge
  from peers holding the marker.
- `executor/simple-job-executor.ts:754` (`purgedRefusal`) — a load that writes
  a purged foreign id (relationship end, `input.documentId`) fails with
  `InvalidSignatureError` `ID_MISMATCH`, not `DocumentPurgedError`; only the
  job's own id yields `DocumentPurgedError` — sync matches
  `DocumentPurgedError` by name and tombstoned the live job document, with no
  signature needed.
- `executor/simple-job-executor.ts:478` (`executeInScope`) — purge jobs and
  marker loads branch to `executePurge` before the shared lock and before
  `unsupportedStoredProtocol` — the purge takes only the exclusive lock (no
  job takes two kinds), and the stored protocol is irrelevant to a purge.
- `executor/simple-job-executor.ts:825` (`executePurge`) — an already-purged
  id emits `JOB_WRITE_READY` with `operations: []` — the plan says nothing is
  emitted; without the event the job stays `RUNNING` in the tracker. The
  check runs before marker admission, so a repeat marker is a no-op without a
  signature check.
- `executor/simple-job-executor.ts:809` (`executePurge`) — with no purger on
  the scope (`DefaultExecutionScope`) the job fails with a plain `Error`,
  retried, not terminal — only `KyselyExecutionScope` has the transaction a
  purge needs.
- `executor/simple-job-executor.ts:926` (`preparePurgeJob`) — precondition 4
  fails with `DocumentNotDeletedError`; "the same request's expansion" is
  `job.meta.purgeRequestDocumentIds` — the plan names no error or carrier for
  precondition 4.
- `executor/types.ts:164` (`DEFAULT_MAX_PURGE_OPERATIONS = 200_000`) — the cap
  is `JobExecutorConfig.maxPurgeOperations` (`:226`), reaching workers through
  the executor config; default 200 000, not 50 000 — set from the purge
  duration measurement (Measurements).
- `executor/simple-job-executor.ts:225` (`malformedMarker`) — a peer marker
  with input keys beyond the four, empty values, or naming another id, branch
  or scope fails with `InvalidSignatureError` `ID_MISMATCH` — a peer could
  carry `protocolVersions` or other fields into the receiver's meta cache.
- `executor/simple-job-executor.ts:1020` (`preparePurgeLoad`) — the receiver
  stores `purgeMarkerOperation(marker.action)`, not the peer's envelope — the
  envelope's index, skip, id and hash were arbitrary and propagated to the
  index twin.
- `executor/signature-admission.ts:227` (`admitMarker`) — the marker is held
  to `v2-required` and enforced in every `signatureVerification` mode,
  including `"log"`; an envelope timestamp that differs from the action's is
  refused (`signer/verify-action-signature.ts:251`) — `"log"` admitted
  invalid, untrusted and timestamp-mismatched markers.
- `executor/simple-job-executor.ts:1014` (`preparePurgeLoad`) — every receipt
  case upserts a membership for the source remote's collection, not only the
  not-held case — so the marker relays to that collection's other remotes
  whether or not the document was a member here.
- `executor/simple-job-executor.ts:1046` (`commitPurge`) — a marker for a
  held, live document writes no `DELETE_DOCUMENT`; the deletion shows only as
  `appliedDeletion` on the marker's context (`events/types.ts:129`) — the
  deletion's rows would be removed in the same transaction; consumers need
  only the fact that a deletion was applied.
- `executor/document-action-handler.ts:992` — a submitted
  `REMOVE_RELATIONSHIP` naming a purged target is accepted and written; the
  membership close is skipped — refusing it failed whole client jobs,
  including stage 0 cascade removals when a purge landed between (decision 3
  below).
- `executor/document-action-handler.ts:936` (`isTargetPurged`) —
  `ADD_RELATIONSHIP` targets are resolved at job start; operations a reshuffle
  re-appends fall back to a lazy lock and lookup — a reshuffle can add
  operations the job-start set did not see.
- `executor/util.ts:411` (`FencedWriteCache`) — every cross-document
  `getState` in a job transaction takes the shared lock and a tombstone
  lookup, batched through `PurgeFence.isPurgedMany` (`:396`); a tombstoned
  document reads as absent — a worker's write cache kept a purged group's
  roster and admitted a former member's operation the host denied. Routing
  stickiness covers only `job.documentId`.
- `executor/worker-pool-job-executor-manager.ts:371` (`evictPurged`) —
  marker ids are broadcast to every worker; `IExecutorWorker.evictPurged`
  (`executor/interfaces.ts:85`) is required — same cause as the previous
  entry.
- `cache/kysely-write-cache.ts:253` — reads in flight are tracked per
  document, and an invalidation stops them re-caching — `coldMissRebuild`
  across a purge commit could re-cache the purged state.
- `storage/kysely/store.ts:190` and `cache/kysely-operation-index.ts:771` —
  the tombstone re-check is skipped for ids the transaction read live under
  its shared lock (`liveIds`, bound in `executor/execution-scope.ts:125`);
  `DefaultExecutionScope` and direct `apply` keep it — hot path, decision 4
  below. The plan calls `apply`'s check the backstop.
- `executor/execution-scope.ts:25` — `DocumentLocks.purged(ids)` and an
  optional `ExecutionStores.purger` (`:43`) are added — the tombstone check
  after the lock and the purge itself need the scope's transaction.
- `packages/reactor-hypercore/src/hypercore-operation-store.ts:132` — refuses
  a non-marker append after a marker head; it has no delete path and cannot
  run a purge — answers the plan's Unknown: the package stays unshippable for
  erasure.
- `packages/reactor-api/src/services/authorization.service.ts:285`
  (`canMutate`) — the `PURGE_DOCUMENT` document-admin rule ships in stage 1,
  not stage 3 — without it any WRITE pusher can erase through a pushed marker
  under `DOCUMENT_PERMISSIONS` (decision 5 below).

### Caches and replay

- `storage/kysely/keyframe-store.ts:22` (`putKeyframe`) — the shared lock and
  tombstone check live in `putKeyframe`, not `persistKeyframe`; the write
  stays fire-and-forget, and on an already-committed job transaction the
  keyframe is logged and dropped — `putKeyframe` is the one writer both
  callers reach.
- `storage/kysely/stored-protocol-versions.ts:12` — the marker is excluded in
  the query; index 023 is unchanged — avoids a migration.
- `core/reactor-builder.ts:847` — a host `JOB_WRITE_READY` subscriber evicts
  marker ids from the host write and meta caches; disposed on `kill` —
  under `REACTOR_WORKERS` the executor's post-commit eviction runs in the
  worker, not the host.

### Read models

- `read-models/base-read-model.ts:101` (`purgeFence`) — `"locked"`,
  `"skip"` or `"none"`, default `"locked"` (`:446`). `ProcessorManager`
  (`processors/processor-manager.ts:125`) and `GroupReevaluationTrigger`
  (`core/group-reevaluation-trigger.ts:69`) are `"none"` — the plan has no
  opt-out; `GroupReevaluationTrigger` writes only its cursor and enqueues
  jobs, and a PGlite subclass that opens its own transaction on `this.db`
  inside the fence deadlocks on the single connection.
- `read-models/base-read-model.ts:237` (`static commitsInFenceTransaction`) —
  a `"locked"` model that overrides `commitOperations` must set it, or the
  constructor throws (`:222`) — a subclass writing on `this.db` instead of the
  passed transaction escapes the lock on Postgres and deadlocks on PGlite. It
  replaced a `commitOperations.length < 2` check, which misfired on default
  and rest parameters.
- `read-models/base-read-model.ts:170` (`dropPurged`) — the base drops by the
  operation's own `documentId` only; relationship ends are locked (`:155`)
  but not dropped. The indexer (`storage/kysely/document-indexer.ts:138`) and
  `NodeProcessor` skip a relationship with a tombstoned end themselves — the
  base cannot know which end a model writes rows for. A generic `"locked"`
  model gets no relationship-end skip.
- `read-models/base-read-model.ts:445` (`commitFenced`) — one wrap point for
  live, boot, sweep and rescan; `writesRows(items)` (`:440`) lets a model skip
  the transaction for batches it writes nothing for (the indexer, for batches
  without relationships) — saves a transaction and lock per batch.
- `read-models/base-read-model.ts:817` (`rebuildIfConfigured`) — besides
  `DocumentNotFoundError`, any error on an id `findPurged` reports tombstoned
  is settled absent — a rebuild of a purged stream can fail in other ways once
  its rows are gone, and a throw there blocks the cursor for every document.

### Sync

- `sync/sync-manager.ts:759` (`tombstone`) — runs from derivation, the
  `JOB_WRITE_READY` scan, a successful marker load, a FAILED
  `DocumentPurgedError` and a dead-letter storage refusal; also removes every
  non-marker outbox entry for the id (marked applied) and its in-memory dead
  letters — each is a path where pre-purge rows could otherwise be served or
  kept.
- `sync/sync-manager.ts:1415` (`deadLetter.onAdded`) — remote dead letters for
  tombstoned ids are handled here, not in `handleRemoteDeadLetters` in
  `gql-req-channel.ts` — one place for both channel kinds.
- `sync/sync-manager.ts:1034` (`refuseOnReceipt`) — a marker skips the
  receipt protocol refusal — the refusal judges the document's old versions
  and would dead-letter the marker.
- `sync/sync-manager.ts:2591` — the marker is exempt from `sinceTimestampUtcMs`;
  `sync/utils.ts:121` (`filterForRemote`) exempts it from remote scope and
  branch filters — either filter could withhold the marker.
- `sync/sync-manager.ts:2031` — FAILED marker loads split three ways:
  `DocumentPurgedError` drops; `InvalidSignatureError` dead-letters as
  `MARKER_REFUSED` with no quarantine (`:2267`); anything else keeps the
  marker in the inbox and retries with backoff (`retryMarker`, 1 s to 60 s,
  `:161`), unlimited — a transient failure (trust policy outage) dead-lettered
  and quarantined the marker after three fast retries, while the sender's
  cursor passed it.
- `sync/sync-manager.ts:204` (`isPurgedFailure`) — requires the message
  "Document <id> was purged" for the job's id; anything else is
  `MARKER_REFUSED` — see the foreign-id entry above.
- `sync/utils.ts:556` (`classifyJobFailure`) — `DOCUMENT_PURGED` and
  `PURGE_PRECONDITION` do not quarantine; `RESERVED_ACTION` does.
- `sync/types.ts:227` — `SyncEventTypes.PURGE_REFUSED` (20008) — the hook
  stage 3 needs for "undelivered".
- `sync/mailbox.ts:63` (`holdAckBelowMarkers`) — an inbox's ack, and its
  persisted cursor, never pass an unapplied marker — the sender's cursor
  passed a marker the receiver had not applied, so a receiver restart lost it.
- `storage/migrations/025_create_sync_received_markers.ts` — received markers
  are stored durably (kept, not purged; one row per remote and marker op id)
  and restored into the inbox before channel init (`sync/sync-manager.ts:480`);
  `pushSyncEnvelopes` awaits `receiptsStored`
  (`packages/reactor-api/src/graphql/reactor/resolvers.ts:2071`) — the ack
  hold alone failed: after a switchboard restart, any later push moved the
  ack past the lost marker.
- `sync/channels/gql-req-channel.ts:1174` — pushed markers unacked for
  `retryMaxDelayMs` (300 s) are pushed again; `retireRefusedMarkers`
  (`:1147`) stops on `MARKER_REFUSED`; the receiver dedupes by op id — covers
  a restarted remote without re-pushing a refused marker forever.
- `packages/reactor-api/src/graphql/reactor/resolvers.ts:1747`
  (`pollSyncEnvelopes`) — delivery counters rewind to the client's
  `outboxLatest`, re-serving what a restarted client never acknowledged.
- `storage/kysely/sync-hold-storage.ts:46` — `upsert` refuses a hold for a
  purged id unless it is a `document-purge` hold — a hold written after the
  purge would read as held forever.
- `sync/sync-manager.ts:1692` (`oweSettledRange`) with
  `cache/kysely-operation-index.ts:402` (`getCollectionsInRange`) — each
  watermark advance owes the remotes of collections that moved in the newly
  settled range — if the purge's `JOB_WRITE_READY` was dropped, no remote was
  owed and the marker waited for the next batch in that collection. The plan
  states derivation does not depend on the event; this makes it true.
- `sync/sync-manager.ts:2485` (`emitBatches`) — refuses tombstoned non-marker
  rows; `GqlRequestChannel` flush pushes only entries still queued — entries
  derived before the purge could still go out.
- `sync/sync-manager.ts:1493` — a refused marker load dead-letters the marker
  only, not the operations batched with it — the others carry personal data.

### Test infrastructure

Not spec deviations; recorded because they change how the suites run.

- `packages/reactor/test/sync/fleet.ts` gained a Postgres mode (one database
  per node), async `dispose()`, and queues envelopes until a channel is wired
  (a flake's root cause).
- Per-storage test databases (27d1474dd0): Kysely introspection
  (`has_schema_privilege`, `pg_get_serial_sequence`) raced a concurrent
  `DROP SCHEMA` and failed with "schema reactor_test_* does not exist".
- A `holds-xid` vitest project runs files that hold a write transaction
  serially after the rest (2697ec2664): the settled watermark waits for the
  cluster-wide xmin, so one file's open xid stalled other files' outboxes and
  sweeps.

## Stage 2

- `packages/reactor-drive/src/processors/node-processor.ts:88` — `"locked"`,
  with `commitsInFenceTransaction` (`:61`); `purgeLookup` (`:97`, hook at
  `read-models/base-read-model.ts:434`) reads tombstones in the reactor
  schema, taken as an optional sixth constructor argument (`:74`) — the
  processor's handle is scoped to the drive schema.
- `packages/reactor-drive/src/processors/node-processor.ts:317`
  (`applyDeleteDocument`) — `DELETE_DOCUMENT` of a drive also clears its tree
  (`driveId = id`), own commit c9253e3fdd — the plan asks this for the marker
  only; a deleted drive's folder rows had no later remover.
- `packages/reactor-attachments/src/read-models/attachment-reference/attachment-reference-read-model.ts:49`
  — `"skip"`; markers are handled before the module lookup;
  `IAttachmentReferenceWriter.removeDocuments` (`types.ts:21`) is required —
  breaking for external implementers of the writer.
- `events/types.ts:129` (`PurgeMarkerContext.appliedDeletion`) — set on the
  marker's context when the receipt applied a deletion; survives the worker
  pool, not sent on the wire — `SubscriptionNotificationReadModel` needs it
  and the event had no such signal.
- `subs/subscription-notification-read-model.ts:127` — an updated document
  whose view lookup throws `DocumentNotFoundError` is dropped per id, not the
  batch — a purge logged "Post-ready read model indexing failed" for the
  whole batch.
- `packages/reactor-browser/src/document-refetcher.ts:33` — matches
  `"DocumentPurgedError"` by name — reactor-interop forbids value imports.
- `packages/reactor-workflow/src/reactor/workflow-triggers-read-model.ts:40`
  — `"skip"`, not a transaction writer — its rows live on
  `host.relationalDb`, a separate handle. The plan lists it as a writer on
  the reactor handle.
- `packages/reactor-workflow/src/reactor/store.ts:1623`
  (`eraseRunsForDocuments`) — erases runs whose trigger payload or sampled
  test output names the id as `documentId`, `driveId` or `parentId`, plus
  their reruns, beyond `run_document`; a process-wide `erasedRuns` guard
  (`:824`) stops in-flight runs writing back — payloads carry ids with no
  `run_document` row.
- `packages/reactor-workflow/src/reactor/service.ts:1637`
  (`forgetDeletedWorkflow`) — the marker disarms a workflow as
  `DELETE_DOCUMENT` does (registry, supervisor, webhook token, dedupe) and
  erases `trigger_state` and `trigger_dedupe` rows for the workflow's own id —
  the read model stripped markers before the runtime, so a purged workflow
  stayed armed.
- `packages/reactor-workflow/src/reactor/service.ts:1341`
  (`onDocumentsPurged`) — throws while the run journal is down, so the cursor
  holds; the journal reopens with backoff (1 s to 60 s); fires made while it
  was down are remembered (cap 65 536, `:393`) — returning without erasing let
  the cursor pass the marker.
- `processors/processor-manager.ts:394` (`deliverDeletion`) — a deleted
  drive's processors receive the deletion whatever their filter, without the
  tombstone drop, then close — a processor filtered to other scopes must still
  erase.
- `processors/processor-manager.ts:474` (`eraseOwed`) and `:541`
  (`eraseDrive`) — a deleted drive's cursor rows stay owed until each
  processor has its deletion; `init` and `registerFactory` build processors
  for deleted drives with owed rows, deliver the deletion or marker, then
  disconnect, without awaiting (`trackErasure`, `:512`) — the deletion was
  lost for processors not live at `DELETE_DOCUMENT` (package reload, restart
  before registration, errored processor), and awaiting let one hung
  processor block registration.
- `processors/processor-manager.ts:561` (`eraseRecords`) — deletes only rows
  whose processor received the deletion — a factory that threw or returned
  nothing lost the deletion for good.
- `processors/processor-manager.ts:323` — factories get the drive's creation
  header (`extractCreationHeader`); the minimal header only after a purge —
  slug-keyed factories returned nothing for an empty slug.
- `processors/processor-manager.ts:783` — `unregisterFactory` marks rows
  `RELEASED_CURSOR_STATUS` instead of deleting them — a contract change,
  documented; deleting lost owed deletions.
- `processors/processor-manager.ts:193` (`shutdown`) — called from
  `Reactor.kill` through `closers` (`core/reactor.ts:114`) — queues and retry
  timers outlived `kill()`.
- `processors/processor-queue.ts:152` — delivery awaits an unlocked tombstone
  lookup per batch (routing stays synchronous); backfill checks each page;
  a failed lookup retries 100 ms to 30 s, 10 times, then errors the processor
  (`:125`).
- `cache/kysely-operation-index.ts:478` (`getStreamAfter`) — optional
  `limit`; deleted-drive discovery pages by 500.
- `packages/shared/processors/relational/types.ts:118` (`isNamespaceDrive`) —
  compares the document id with the factory's drive id (fourth constructor
  argument, `:71`) — comparing namespaces dropped every namespace when
  `getNamespace` was overridden to a constant.
- `packages/shared/processors/relational/types.ts:127`
  (`deleteDocumentRows`) — finds tables through `information_schema`
  (`document_id` or `documentId` columns).
- `packages/codegen/src/templates/processors/relational-db/factory.ts:31` —
  the generated filter takes scopes `global` and `document`; the scaffold
  table gains `document_id`; the analytics template's `clearSource` no longer
  swallows errors.
- `packages/vetra/processors/vetra-read-model/factory.ts:30` — scope widened
  to `document` to see deletions.

## Stage 3

- `packages/reactor-privacy/src/subgraph/subgraph.ts:36`
  (`createPrivacySubgraph`) — a factory, not a `BaseSubgraph` over
  `SubgraphArgs`; throws under OPEN or when anonymous is admin — no coupling
  to reactor-api's subgraph classes.
- `apps/switchboard/src/privacy.mts:116` — privacy under OPEN, without a
  deployment secret of 32 bytes or more, or without a signer fails boot;
  subgraph registration failure is boot-fatal (`:165`) — a half-enabled
  erasure add-on is worse than none.
- `packages/reactor-privacy/src/erasure/scheduler.ts:173` — "no signer" means
  no `signer.app.key` — `PassthroughSigner` signs empty, which every receiver
  refuses.
- `packages/reactor-privacy/src/erasure/erasure-service.ts:48` (`isLive`) —
  `request` treats an unknown id as live and refuses it — an id the reactor
  does not hold cannot be purged here.
- `packages/reactor-privacy/src/erasure/erasure-service.ts:65` — `plan()`
  reports the cap from the service option, defaulting to
  `DEFAULT_MAX_PURGE_OPERATIONS`, not the executor's configured value — the
  service has no handle on executor config.
- `packages/reactor-privacy/src/erasure/scheduler.ts:163` (`jobIds`) — purge
  job ids are held in memory; an item in `purging` with no known job is
  enqueued again (`:585`), gated by the purge lock — the job tracker loses
  entries on restart, and `document_purges` stays the success signal.
- `packages/reactor-privacy/src/erasure/scheduler.ts:343` (`recoverFailed`)
  — each tick moves a `failed` item whose tombstone appeared to `purged`, and
  reopens its request (`reopened` event, `:400`) — a timed-out purge can
  commit after the manager marked it FAILED. Replaced "FAILED confirmed on a
  second tick".
- `packages/reactor-privacy/src/erasure/scheduler.ts:481`
  (`reopenRequests`) — each tick reopens every `failed` request with no
  `failed` item, in one transaction with its `reopened` rows — reopening only
  in the step that moved the item left the request `failed` for good when
  that step threw after the move committed.
- `packages/reactor-privacy/src/erasure/scheduler.ts:516`
  (`purgeLockTaken`) — dispatch waits while `pg_locks` shows a purge lock on
  the previous id — a timed-out purge's transaction can still be open, and
  dispatching the next would break one purge at a time (decision 8).
- `packages/reactor-privacy/src/erasure/scheduler.ts:621`
  (`previousPurgesEnded`) — while that lock blocks dispatch the scheduler
  logs a warning naming the locked ids and sets `lastError` on the item it
  would dispatch next — a leaked transaction blocks all erasure, and an
  info log alone left nothing in the request status.
- `packages/reactor-privacy/src/erasure/scheduler.ts:595` — an item in
  `purging` with no tombstone after `purgeTimeoutMs` (default 15 min, `:34`,
  `PH_PRIVACY_PURGE_TIMEOUT_MINUTES`) is enqueued again — a purge job that
  never settles would block all erasure.
- `packages/reactor-privacy/src/erasure/scheduler.ts:197` — ticks also run on
  the scheduler's own purge `JOB_WRITE_READY` and `JOB_FAILED` — one purge per
  60 s tick cannot meet a 30-day deadline past about 43 200 documents.
- `packages/reactor-privacy/src/erasure/scheduler.ts:286` (`runDispatch`)
  — a pass triggered by a purge job advances only the `purging` items, then
  dispatches the head of the ready list the last full pass built
  (`dispatchReady`, `:303`), checked again on its own; the full scan runs
  only on the interval and on `tick()`. An item that becomes ready between
  full passes waits up to `intervalMs`. Still one purge at a time — each
  triggered pass scanned every waiting item (about 0.8 ms per item), so a
  backlog cost O(N²): purge completion to next dispatch took 80–115 ms at
  100 waiting items, 290–350 ms at 400 and 1.2–1.3 s at 1 600; after, 5–10 ms
  at all three.
- `packages/reactor-privacy/src/erasure/scheduler.ts:332` — convergence reads
  `sync_remotes` each check; a stored remote the sync manager has not loaded,
  whose membership covers the ordinal, is pending `unknown` (`:854`) — a remote
  dropped after a failed init read as converged.
- `packages/reactor-privacy/src/erasure/scheduler.ts:782` — remote removal
  works from stored rows and deletes directly at `markerGrace` — a bound
  remote that was not loaded was never removed while the item read `erased`.
- `packages/reactor-privacy/src/erasure/scheduler.ts:655` and `:727` —
  `marker-undelivered` carries `detail.kind` `"outcome"` or `"refusal"`; a
  request completing records `complete` (`:918`) — the plan names neither.
- `packages/reactor-privacy/src/erasure/scheduler.ts:913` — other items of a
  failed request keep running — the plan says only that the request fails.
- `sync/delivery-tracking.ts:81` (`pendingDelivery`) — owes the marker to a
  remote whatever its filter, through `filterForRemote` — markers bypass
  remote filters since stage 1.
- `sync/sync-manager.ts:730` (`recordPurgeRefusal`) with
  `storage/migrations/026_create_sync_purge_refusals.ts` — a refusal is
  persisted as a payload-free row (remote, document, branch), then
  `PURGE_REFUSED` is emitted — the event fires once per process, so a stopped
  scheduler lost it; and after `MARKER_REFUSED` the ack hold lifts and the
  cursor alone reads "delivered".
- `sync/sync-manager.ts:738` (`recordPolledMarkerRefusals`) — a polled marker
  refusal is kept only for a tombstoned document with an open membership in
  the reporting remote's collection; at most `MAX_POLLED_REFUSALS` (100,
  `sync/purge-refusals.ts:4`) per poll, written in one statement
  (`storage/kysely/sync-purge-refusal-storage.ts:27`); the poller sends at
  most that many and keeps the rest pending (`sync/channels/gql-req-channel.ts:812`)
  — any bound client could record refusals of any id, unbounded, in N inserts
  per poll, and change another drive's erasure outcome.
- `packages/reactor-api/src/graphql/reactor/resolvers.ts:1988`
  (`recordPollMarkerRefusals`) — a failed refusal write fails the poll with
  `RefusalNotRecordedError` (`packages/reactor-api/src/graphql/errors.ts:80`),
  code `REFUSAL_NOT_RECORDED` in `RECOVERABLE_GRAPHQL_ERROR_CODES`
  (`sync/errors.ts:56`); the poller keeps polling and the refusals stay
  pending, and a recoverable error is never read as the peer rejecting the
  agreement fields (`sync/channels/gql-req-channel.ts:875`) — an
  `INTERNAL_SERVER_ERROR` stopped the poller's timer for the process lifetime.
- `packages/reactor-privacy/src/erasure/scheduler.ts:824` (`refusedRemotes`)
  — counts a refusal only from a stored remote whose collection holds the
  document (open membership) — a row from a remote bound elsewhere made the
  outcome `marker-undelivered`. A remote removed before the outcome is read
  no longer counts.
- `sync/sync-manager.ts:1483` (`deadLetter.onAdded`) — a remote dead letter
  of a tombstoned id is persisted as a refusal only when its `errorType` is
  `MARKER_REFUSED`; any other type is dropped without quarantine — a conflict
  or validation dead letter reported after the purge became a kept refusal
  and turned the outcome into `marker-undelivered`.
- `sync/channels/gql-req-channel.ts:856` — a poller reports refused markers
  with `kind: "marker"` only to a peer announcing the `marker-refusal`
  feature (`packages/shared/document-model/peer-agreement.ts:37`); the server
  records them (`packages/reactor-api/src/graphql/reactor/resolvers.ts:1967`)
  instead of turning them into holds — polled refusals never reached the
  purging host, and an older server answers an unknown field with HTTP 400.
- `packages/reactor-api/src/graphql/reactor/resolvers.ts:1923`
  (`holdPollRefusals`) — only a polled refusal with no `kind` becomes a hold;
  a kind the server does not know is ignored — a future kind was held as
  `UNSUPPORTED_PROTOCOL`.
- `storage/kysely/document-purger.ts:82` (`groupReferencersInHistory`) —
  moved into the purger, shared by precondition 3 and `plan()`.
- `sync/sync-manager.ts:347` — `IDeliveryTracking` backed by an optional
  15th constructor argument, `delivery?: DeliveryLookup`, wired in
  `sync/sync-builder.ts`.

## Stage 4

Nothing was needed for receipt. The optional editor notice is done: a Deleted
event that a purge marker applied carries `context.purged`, and Connect closes
the open drive or document with "has been erased" instead of "has been
deleted".

- `subs/types.ts:34` (`DocumentDeletedInfo`) — `onDocumentDeleted` callbacks
  and `notifyDocumentsDeleted` take an optional trailing `{ purged: true }`;
  `SubscriptionNotificationReadModel` (`subs/subscription-notification-read-model.ts:105`)
  sends marker deletions in their own call — the plan names no carrier;
  optional keeps every existing subscriber and mock unchanged.
- `client/types.ts:72` (`DocumentChangeEvent.context.purged`) — additive and
  optional; the event type stays `Deleted` — a new `DocumentChangeType`
  member would break the reactor-browser mirror, the document cache's
  deletion handling and the GraphQL enum.
- `packages/reactor-api/src/graphql/reactor/schema.graphql:219`
  (`DocumentChangeContext`) — unchanged; a client on `GraphQLReactorClient`
  gets a plain Deleted and shows "has been deleted" — the task keeps wire
  formats unchanged. The worker RPC carries the field (structured clone).
- `apps/connect/src/utils/deleted-selection.ts` (`closeDeletedSelection`) —
  the redirect moved out of `store/reactor.ts:536` so it can be tested.
- Only a marker that applied a deletion shows the notice. A purge of a
  document already deleted here emits no Deleted (stage 2) and there is no
  open editor to close: the deletion closed it with "has been deleted". The
  refetch path (`DocumentPurgedError`) is not used: the Deleted event has
  already dropped the cache entry.

## Decisions

Taken by the orchestrator after review, and applied:

1. The fence defaults to `"locked"`. `"none"` and `"skip"` are explicit
   opt-outs, documented on `BaseReadModelConfig`, for PGlite subclasses that
   open their own transaction and for models on another handle.
2. `admitMarker` enforces whatever the `signatureVerification` mode.
3. A submitted `REMOVE_RELATIONSHIP` to a purged target is accepted and
   written, with the membership close skipped. This reverses the write-path
   half of d12bf1a648.
4. Hot path: only the `liveIds` skip of the `apply` and index-commit
   re-checks. A single statement that takes the lock and reads the tombstone
   is unsafe: under READ COMMITTED its snapshot is taken before the lock wait
   and misses the tombstone. A volatile SQL function running both as two
   queries is safe but needs a migration; deferred.
5. The `canMutate` document-admin rule for `PURGE_DOCUMENT` moved into stage
   1. Stage 1 must not ship without it.
6. The cross-peer group race goes to the plan's Limits as a proposal (below).

## Proposed spec changes

- **Limits, groups.** Add the cross-peer race: peer B grants on a document
  naming group G while peer A purges G. A's precondition 3 cannot see B's
  grant; receivers re-judge B's grant without G. Local races are closed by
  locking `mentionedGroupIds`.
- **The fence.** Default `"locked"` with opt-outs `"skip"` (rows on another
  handle) and `"none"` (`ProcessorManager`, `GroupReevaluationTrigger`,
  PGlite subclasses opening their own transaction), and
  `static commitsInFenceTransaction` for `"locked"` models overriding
  `commitOperations`. Say that relationship ends are locked by the base but
  dropped by the model.
- **The fence, cross-handle models.** Move `WorkflowTriggersReadModel` from
  the transaction writers to the cross-handle (`"skip"`) models, with the
  rescan repair.
- **Convergence.** Name the drive-client `removeFileNode` path beside the
  cascade: it deletes the child before removing the relationship.
- **Implementation plan, stage 0.** State the cycle rule: an edge whose source
  is deleted no later than its target does not wait, which covers edges into
  the root from inside the deletion set.
- **Receiving the marker.** Add the `marker-refusal` peer feature, the polled
  refusal kind, migrations 025 `sync_received_markers` and 026
  `sync_purge_refusals` (both kept, not purged), and the received-marker ack
  hold with the re-push of unacked markers.
- **Implementation plan, stages 1 and 3.** Stage 1 ships with the `canMutate`
  document-admin rule.
- **Admission at the store.** `REMOVE_RELATIONSHIP` to a purged target:
  accept, write, skip the membership close, on every path.
- **Built-in models, attachments.** `IAttachmentReferenceWriter.removeDocuments`
  is a required member.
- **Processors.** On unregister, cursor rows are released, not deleted; a
  deleted drive's rows stay owed until each processor has its deletion, and
  are delivered on `init` and `registerFactory`.
- **Built-in models, `NodeProcessor`.** `DELETE_DOCUMENT` of a drive also
  clears its folder rows.
- **API, `request`.** A drive expands to the ever-members with no open
  membership elsewhere that are still open in its collection or deleted; a
  live former member is not expanded, and the executor's drive precondition
  does not require it. Relationship operations are on the drive, so its
  purge erases them; a document unlinked and kept is no longer the drive's.
  A cascade delete closes its children's memberships, so the deleted ones
  are still expanded.
- **Serving the marker.** The settled-range sweep that owes remotes on each
  watermark advance, so a lost `JOB_WRITE_READY` cannot strand the marker.
- **Schedule.** Event-triggered ticks on the scheduler's own purge jobs;
  `failed` to `purged` recovery with `reopened`; `purgeTimeoutMs`
  re-dispatch gated by `pg_locks`; convergence from stored `sync_remotes`
  rather than the sync manager's loaded remotes.
- **Limits, peers.** Refusals from peers without the `marker-refusal` feature,
  and refusals at a relay, are not reported to the purging host.
- **Preconditions 5, Performance.** `maxPurgeOperations` default 200 000.
  State that the executor's 30 s `jobTimeoutMs` bounds a purge, `allowLarge`
  included, so a large purge also needs a longer job timeout.
- **Unknowns, answered.** `HypercoreOperationStore` refuses appends after a
  marker but cannot purge; the package stays unshippable for erasure. A
  receiver in `"log"` signature mode never admits a marker it would refuse in
  `"enforce"`.

## Measurements

Machine: Apple M4 Max, 14 cores, Node 24.13.0. Numbers predate the review
fixes unless stated; the post-merge sync bench is after them.

### Sync bench

`pnpm bench:sync:record` (tinybench, PGlite). Before: `feat/erasure-stage-0`
43d1a5d0c0 with the stage 1 bench file. After: stage 1 at e5f0b3cd2b. Stdout
records only; nothing appended to `BENCHMARKS.jsonl`.

| Case | Before ms (±%) | After ms (±%) | After / before |
|---|---|---|---|
| Baseline: 10 docs × 10 ops | 557.9 (0.8) | 732.1 (1.4) | 1.31 |
| Outbound gating: peers without document-purge | 582.9 (1.8) | 731.0 (1.2) | 1.25 |
| Conflicts: 5 docs × 20 conflicting ops | 752.1 (1.0) | 1003.0 (1.0) | 1.33 |
| Contention: 10 × 10, alternating writer | 791.2 (1.7) | 1013.9 (1.1) | 1.28 |
| Deep Hierarchy | 1020.3 (34.1) | 668.2 (0.5) | before too noisy |
| Document Count: 50 × 10 | 3343.9 (22.0) | 3178.5 (0.7) | 0.95 |
| History Depth: 10 × 100 | 5238.9 (1.3) | 5906.2 (0.3) | 1.13 |
| Heavy Load: 50 × 100 | 28534.1 (3.5) | 29702.3 (2.2) | 1.04 |

The outbound-gating case is new. On stage 0 its manifest is full and runs
ungated; on stage 1 it fails `coversLocal` and `gateOutbound` runs on every
page. Other cases use silent remotes, gated on both builds, so the gate adds
nothing measurable (731.0 against 732.1).

Post-merge, after the review fixes. Before: main at c7cb51e650 (the merge
base) with main's bench file copied over. After: main at 4d4f2a3b9b (the
merge). Same machine, no other process running during either run.

| Case | Before ms (±%) | After ms (±%) | After / before |
|---|---|---|---|
| Baseline: 10 docs × 10 ops | 584.2 (2.2) | 622.8 (1.0) | 1.07 |
| Outbound gating: peers without document-purge | 560.8 (0.9) | 626.3 (0.8) | 1.12 |
| Conflicts: 5 docs × 20 conflicting ops | 868.6 (3.4) | 881.3 (1.6) | 1.01 |
| Contention: 10 × 10, alternating writer | 823.1 (4.3) | 882.1 (1.0) | 1.07 |
| Deep Hierarchy | 649.9 (4.6) | 635.6 (0.6) | 0.98 |
| Document Count: 50 × 10 | 4054.6 (34.4), median 2993.5 | 3014.4 (0.6) | 1.01 by median |
| History Depth: 10 × 100 | 5562.9 (3.2) | 5589.8 (0.5) | 1.00 |
| Heavy Load: 50 × 100 | 31096.5 (4.8) | 27522.9 (0.5) | 0.89 |

The review fixes (the `liveIds` skip, `isPurgedMany`, the settled sweep gated
on trailing remotes) took the stage 1 cost from about 30% to about 7% on the
small cases. The outbound-gating case now carries the gate (1.12 against 1.07
for Baseline). Per job, Baseline, mean ms before → after: local apply 14.6 →
15.8, local index 5.8 → 7.0, local index chain wait 86.3 → 92.1, load apply
24.2 → 22.7, load index 8.1 → 14.9.

Per job, Baseline, mean ms: local apply 13.8 to 19.2, local index 5.5 to 8.5,
load index 7.9 to 17.0. Queue wait and index chain wait grow with them, since
jobs on one document run in series.

`pnpm bench:sync:smoke`, seconds, mean of two runs, by build point:

| Point | Commit | Baseline | Contention | Heavy Load | History Depth |
|---|---|---|---|---|---|
| stage 0 | 43d1a5d0c0 | 0.60 | 0.78 | 23.8 | 4.87 |
| + 1a foundation | 08d5fda989 | 0.62 | 0.80 | 24.2 | 4.90 |
| + A executor | bee8c0c383 | 0.70 | 0.91 | 27.4 | 5.61 |
| + B caches | 419476d414 | 0.69 | 0.90 | 27.8 | 5.70 |
| + C read models | 19f75fb343 | 0.72 | 0.93 | 29.3 | 5.96 |
| + D sync | c3085ad7eb | 0.72 | 0.94 | 29.2 | 5.97 |
| + lost write-ready sweep | cb6af8ae3a | 0.74 | 1.01 | ~29 | 5.90 |

Track A (job-start lock, tombstone lookup, `apply` re-check) is about two
thirds of the cost, the fence about a quarter, the settled-range sweep a few
percent.

### Purge duration

Real Postgres, local Docker, `document-model` documents seeded in 500-action
jobs, deleted, purged with `allowLarge`. Time from `enqueuePurge` until the
`document_purges` row is visible.

| Operations | Index rows | Keyframes | ms (small action) | ms (2 KB action) |
|---|---|---|---|---|
| 1 000 | 1 003 | 99 | 13 | – |
| 5 000 | 5 003 | 499 | 18 | – |
| 20 000 | 20 003 | 1 999 | 59 | 37 |
| 50 000 | 50 003 | 4 999 | 152 | 166 |
| 100 000 | 100 003 | 9 999 | 651 | 451 |
| 200 000 | 200 003 | 19 999 | 1 652 | 1 591 |
| 500 000 | 500 003 | 49 999 | 1 970 | – |

Cost follows row count; payload size does not matter. 200 000 purges in
1.6 s, about 18× headroom to the 30 s job timeout. Seeding 500 000
operations took 7.5 minutes.

### Hot path

Statements per mutation job on Postgres:

| Point | Total | Purge lock | Tombstone lookups |
|---|---|---|---|
| Stage 1 before review fixes | 22.3 | 2.1 | 4.1 |
| After F1 (`liveIds` skip) | 20.3 | 2.1 | 2.1 |

The remaining lookups are the job-start check and the read-model fence.

| Change | Before | After |
|---|---|---|
| `FencedWriteCache`, N foreign groups per job (F1 then F4 `isPurgedMany`) | 2N statements; 35.9 / 37.7 / 44.2 ms per job at N = 1 / 10 / 50 | 2 statements |
| Mailbox ack getter, 5 000 items × 20 ops drain (F4 marker set) | 1 725 ms | 2 ms |
| Shared locks per job (bucketed keys) | 16 000 ids: out of shared memory | 1 024 keys at most |

## Pre-existing bugs found, not fixed

- **Agreement and decision-field fallbacks never fire.**
  `sync/channels/gql-req-channel.ts:868` (`isAgreementRejection`) and `:897`
  (`rejectsDecisionFields`) match only category `"graphql"`. Apollo Server 5
  answers an unknown-field validation failure with HTTP 400, category
  `"http"`, which `classifyError` (`:1241`) marks unrecoverable, so the poll
  stops instead of degrading.
- `core/reactor.ts:253` (`getBySlug`) throws a plain `Error` for an unknown
  slug, not `DocumentNotFoundError`.
- `client/reactor-client.ts:1569` — the cascade planner reads `getIncoming`
  without paging.
- `client/reactor-client.ts:1629` (`deleteDocuments`) — runs each cascade as
  its own batch, concurrently, with no ordering between them.
- `sync/batch-aggregator.ts:39` (`pendingBatches`) — a job that emits
  neither `JOB_WRITE_READY` nor `JOB_FAILED` leaks its pending batch.
- `core/reactor.ts:135` — the Reactor's `JOB_FAILED` subscriber is never
  disposed.
- `packages/reactor-drive/src/processors/node-processor.ts` works only when
  the drive schema equals `REACTOR_SCHEMA`: its view state and watermark
  probe use the drive-scoped handle.
- Models added through `withReadModel` or `withReadModelFactory`
  (`core/reactor-builder.ts:407`, `:419`) never get `attachCatchUp`.
- `packages/reactor-drive/src/processors/node-processor.ts` suffix replay
  re-inserts the node of a deleted, unpurged child.
- `packages/reactor/test/factories.ts` — when a storage `create()` throws,
  `afterEach` cleans the previous test's storage again ("driver has already
  been destroyed").

## Open items

Release and CI:
- `packages/reactor-privacy` has `publishConfig.access: public`; it must stay
  public because switchboard depends on it.
- CI build lists name `reactor-privacy` for reading only; its tests do not
  run there.
- The reactor-workflow Postgres exit suite
  (`workflow-triggers-read-model.purge.test.ts:138`, `describe.skipIf`) does
  not run in `check-commit.yml`, which has no Postgres for that package.

Operations:
- No environment variable raises the executor's `jobTimeoutMs`, which an
  `allowLarge` purge needs.
- A marker load has no size cap; a timeout retries it rather than failing
  terminally.
- The privacy subgraph registers with `core = false`
  (`apps/switchboard/src/privacy.mts:165`), so a name collision is possible.
- A full scheduler pass (each `intervalMs`) still scans every active item,
  unbounded; a completing purge no longer does.
- `enqueuePurge` with several ids can dispatch them concurrently
  (`SimpleJobExecutorManager` capacity race), and a rejected async
  `JOB_AVAILABLE` emit is swallowed. The scheduler enqueues one id at a time;
  other callers are exposed.

Sync:
- Older clients and relays never report a refusal; the purging host sees the
  marker as delivered or pending.
- `SyncManager.records` goes stale after the scheduler deletes a remote row
  directly at `markerGrace`.
- `isPurgedFailure` depends on the `DocumentPurgedError` message text.
- Entries after a pending marker are not trimmed while the ack is held,
  bounded by `maxHeldOperationsPerRemote`. A served channel can wait up to
  `retryMaxDelayMs` (300 s) after a restart before the marker is re-pushed.
- 1 024 lock buckets: a purge blocks about 39% of 500-id locked read-model
  batches while it runs.

Processors and models:
- Owed cursor rows for processors a factory stopped producing warn forever;
  released rows of uninstalled packages are never cleaned.
- `seedRegistry` race in `ProcessorManager`.
- `isNamespaceDrive` returns false silently when a processor has no drive id.
- The owed-deletion path may create a relational namespace only to drop it.
- A processor that always throws on deletion is redelivered on every
  registration.
- Processor delivery has no tombstone cache: one lookup per batch and per
  backfill page.
- `OpenPanelProcessor` and Vetra's `CodegenProcessor` now receive drive
  deletions outside their filter and must skip them by type.
- Workflow: the set of fires made while the journal was down is in memory
  only; a third-party workflow registration with no in-memory binding never
  runs `onDisable`.
- The attachment residual race is untested.
- `SubscriptionNotificationReadModel` is live-only: a missed marker emits no
  Deleted.
- Recipes-repo processors handle only `DELETE_DOCUMENT` (outside this repo);
  `ACADEMY_LLM_COMPLETE.md` is stale.

Executor:
- Precondition 1 misses a branch holding only global or local rows (probably
  unreachable).
- A keyframe written after the job commits runs in autocommit (very low
  risk).
- `executor/util.ts:382` has a class `PurgeFence`; the read-model config type
  exported from `index.ts` has the same name.
- Stage 4: the "erased" notice reaches only a reactor-client or worker-RPC
  subscriber; the GraphQL subscription does not carry `purged`.
