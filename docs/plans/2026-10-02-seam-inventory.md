# Seam inventory: packages/reactor (testing-policy rollout, Phase 2)

Date: 2026-10-02
Status: done for `packages/reactor`. `reactor-api` and `reactor-workflow`
are inventoried separately by their own tracks. Rule numbers refer to
`2026-10-02-testing-policy.md`; the phase definition is
`2026-10-02-testing-policy-rollout.md`, Phase 2.

## Method

Mechanical sweep of `packages/reactor/test` for `as unknown as I*` casts
and `vi.fn()`-built object literals assigned where an interface is
expected (the `mockWriteCache` pattern,
`test/read-models/base-read-model/integration.test.ts:156`). Each hit was
resolved to its interface seam, then classified per R1:

- (a) the seam already has at least one real-pair test somewhere;
- (b) both sides carry logic that can disagree and no real-pair test
  existed — one composed test was backfilled;
- (c) the double is inert (logger, clock, signer stub, pure delegation) —
  no obligation.

The classification is per seam, not per test file: a hundred unit tests
keep their mocks; the seam gets one composed test.

## Result

22 seams: 14 class (a), 3 class (b) backfilled in this pass, 5 class (c).
Two residual gaps are listed as future work rather than backfilled,
because each needs a harness this phase's budget does not cover.

## Backfilled tests

1. `test/read-models/write-cache-rebuild/integration.test.ts` — the
   write-cache / read-model rebuild seam, where the September data-loss
   bug lived. Real `KyselyWriteCache` (real reducer, real
   `KyselyOperationStore`) under a real `KyselyDocumentView` sweep and a
   real `KyselyDocumentIndexer` sweep. The first test pins the
   `targetRevision` convention of `IWriteCache.getState`
   (`src/cache/write/interfaces.ts:17`) against
   `BaseReadModel.rebuildStateForOperations`
   (`src/read-models/base-read-model.ts:477`): the store holds the full
   stream before any entry is swept, so a cache that answered with head
   state instead of at-revision state would write the wrong snapshot
   content. Content asserted per R2 (`DocumentSnapshot.content.name`),
   not coordinates.
2. `test/sync/sync-manager/gql-request-channel.integration.test.ts` —
   `SyncManager` with the real `GqlRequestChannelFactory`,
   `IntervalPollTimer`, and `GqlRequestChannel`, doubled only at the
   network boundary (`fetchFn`) and at the neighboring reactor seam
   (which has its real pair in `two-reactor-convergence.test.ts`).
   Inbound: poll -> envelope parsing -> inbox -> `loadBatch` content ->
   inbox cursor persisted to the real `KyselySyncCursorStorage`.
   Outbound: `JOB_WRITE_READY` -> outbox -> push serialization (action
   input intact, `resultingState` stripped per `serializeEnvelope`,
   `src/sync/channels/utils.ts:32`) -> ack trims the outbox and persists
   the outbox cursor.
3. `test/queue/integration.test.ts` — the queue / resolver admit path.
   `queue/unit.test.ts:1234` already composed the refusing half (real
   `InMemoryQueue`, real `DocumentModelResolver`, failing loader); the
   admitting half — a CREATE_DOCUMENT gated on a model the resolver
   actually imports via `resolveModelSources` and registers — ran only
   against `NullDocumentModelResolver`. The new test loads
   `test/core/fixtures/model-barrel.mjs` through the real resolver and
   asserts the registered module and the admitted job.

## Future work (not backfilled)

- Purge markers through sync with a real reactor. Every purge-sync test
  mocks both `IReactor` and `IChannelFactory`
  (`test/purge/sync/harness.ts:125-136`,
  `test/purge/sync/marker-restart.test.ts:103`), and
  `two-reactor-convergence.test.ts` does not purge. A composed test needs
  a two-reactor purge harness; that is a Phase 3-sized item, not one
  test.
- The wire contract between `GqlRequestChannel` and `reactor-api`'s sync
  subgraph resolvers. The new channel test doubles the GraphQL endpoint;
  the producing resolvers live in `reactor-api`, so the composed test is
  cross-package and belongs to the R6 fixture-table work, alongside the
  Phase 1f loader predicate.

## Appendix: seam table

| # | Seam (interface, consumer) | Where a test doubles it | Class | Real-pair test |
|---|---|---|---|---|
| 1 | `IWriteCache` under `BaseReadModel` rebuild (view, indexer, processor manager) | `test/read-models/catch-up-guards.test.ts:168`; `test/read-models/base-read-model/integration.test.ts:156`; `test/read-models/base-read-model/catch-up.test.ts:75`; `test/purge/read-models/helpers.ts:130`; `test/processors/processor-manager.test.ts:3097` | (b), backfilled | `test/read-models/write-cache-rebuild/integration.test.ts` (new). Previously only `test/purge/read-models/fence.test.ts:442`, which asserts absence, not content |
| 2 | `IWriteCache` behind `KyselyDocumentView.get` (snapshot read path) | `test/decision/sync-scope-gate-postgres.test.ts:30`; `test/purge/sync/serving-gate.test.ts:53` | (c) | not needed: `get` serves snapshots; the cache is inert on that path |
| 3 | `IDocumentView` under `SyncScopeGate` | `test/decision/sync-scope-gate.test.ts:22`; `test/purge/sync/serving-gate.test.ts:88` | (a) | `test/decision/sync-scope-gate-postgres.test.ts`; `test/purge/sync/serving-gate.test.ts:67` (real view) |
| 4 | `IWriteCache` under the executor (`SimpleJobExecutor`, document-action handler) | `test/executor/document-action-handler/unit.test.ts:92`; `test/executor/synthesized-signing.test.ts:519` | (a) | `test/executor/integration.test.ts:181` |
| 5 | `IOperationStore` under executor / write cache / handlers | `createMockOperationStore` (`test/factories.ts:602`), used in 23 files | (a) | `test/cache/integration.test.ts`; `test/executor/integration.test.ts` |
| 6 | `IOperationIndex` under `CatchUpScheduler` | `test/catch-up/scheduler.unit.test.ts:29` | (a) | `test/read-models/catch-up-guards.test.ts` (real index under real scheduler) |
| 7 | `IOperationIndex` under `ProcessorManager` backfill | `test/processors/processor-manager.test.ts:3075` | (a) | same file, `test/processors/processor-manager.test.ts:1030` |
| 8 | `IOperationIndex` / `IDocumentView` under the read gate | `test/decision/read-gate.test.ts:485,773,1032` | (a) | `test/decision/conditions.integration.test.ts`, `test/decision/groups-convergence.integration.test.ts` (ReactorBuilder, real stack) |
| 9 | `IDocumentModelRegistry` under executor / execution scope / load path | `test/executor/execution-scope/unit.test.ts:160`; `test/decision/read-gate.test.ts:108`; `test/executor/load.unit.test.ts:56` | (a) | `test/executor/execution-scope/integration.test.ts`; `test/executor/integration.test.ts:167` |
| 10 | `IChannel`/`IChannelFactory` under `SyncManager` (real network channel) | `test/sync/sync-manager/bind-remote.test.ts:42`; `outbox-bound.test.ts:109`; `holds-restart.test.ts:57`; `peer-manifest.test.ts:97`; `early-receipt.test.ts:79`; `test/sync/outbox-transient-gap-postgres.test.ts:135`; TestChannel throughout | (b), backfilled | `test/sync/sync-manager/gql-request-channel.integration.test.ts` (new). Response side already real in `test/sync/sync-manager/receipt.test.ts:69` |
| 11 | `IReactor` under `SyncManager` (load/loadBatch) | `test/sync/sync-manager/settled-watermark.test.ts:93`; `receipt.test.ts:52`; `outbox-bound.test.ts:285`; `test/sync/sync-manager/integration.test.ts:57` | (a) | `test/sync/two-reactor-convergence.test.ts` (two real reactors over SyncBuilder) |
| 12 | `IQueue` under `IntervalPollTimer` (backpressure) | `test/sync/channels/gql-req-channel/unit.test.ts:70`; `test/sync/channels/interval-poll-timer/unit.test.ts:25` | (c), now also (a) | thin (`totalSize` only); real `InMemoryQueue` under the real timer in the new channel test |
| 13 | `IDocumentModelResolver` under `InMemoryQueue` (CREATE_DOCUMENT gate) | `NullDocumentModelResolver` throughout `test/queue/unit.test.ts`, `test/core/*.test.ts` | (b), backfilled | `test/queue/integration.test.ts` (new, admit path); `test/queue/unit.test.ts:1234` (refuse path, pre-existing) |
| 14 | `IDocumentModelRegistry` under `DocumentModelResolver` | `test/registry/document-model-resolver.unit.test.ts:210` (one error case) | (a) | same file: real `DocumentModelRegistry` everywhere else |
| 15 | `IQueue` under `GroupReevaluationTrigger` | `test/core/group-reevaluation-trigger.test.ts:66` | (a) | `test/decision/groups-reevaluation.integration.test.ts` (ReactorBuilder, real queue) |
| 16 | `IReactorClient` under the reactor host module | `test/processors/host-module.test.ts:12` | (c) | pure delegation (forwards `executeAsync`, resolves names); real client composed in `test/client/integration.test.ts` |
| 17 | `IReactor` under `ReactorClient` | `test/client/unit.test.ts:139`; `test/client/evaluate-actions.test.ts:127` | (a) | `test/client/integration.test.ts`; `test/client/evaluate-actions.integration.test.ts` |
| 18 | `IDocumentView` under the subscription manager | `test/subscription/purge-marker.test.ts:85` | (a) | `test/integration/subscriptions.test.ts` (ReactorBuilder, real view) |
| 19 | `IQueue`/`IJobTracker`/`IEventBus` under `JobResultHandler` | `test/executor/job-result-handler/unit.test.ts:90-98` | (a) | `test/integration/reactor.test.ts` (full pipeline) |
| 20 | `ILogger` everywhere | e.g. `test/sync/batch-aggregator/unit.test.ts:41`; `test/core/reactor-builder.test.ts:36` | (c) | inert; the one logger that must fail is Phase 1a's EPIPE case, not an R1 seam |
| 21 | `IReactor` + `IChannelFactory` under purge-marker sync | `test/purge/sync/harness.ts:125-136`; `test/purge/sync/marker-restart.test.ts:103`; `test/purge/sync/worker-version-cache-postgres.test.ts:113` | (b), deferred | none composed; listed under future work above |
| 22 | `ISigner` / `IJobAwaiter` stubs in client and executor tests | `createMockSigner` (`test/factories.ts:1076`); `createMockJobAwaiter` (`test/factories.ts:1112`) | (c)/(a) | signer real in `test/signer` and `test/decision/conditions.integration.test.ts` (TestP256Signer); awaiter real in `test/client/integration.test.ts` |
