---
toc_max_heading_level: 2
---

# Recipes

The [Powerhouse Recipes](https://github.com/powerhouse-inc/recipes) repository is a collection of small, standalone, runnable projects. Each one isolates a single Reactor pattern — a processor, a read model, a sync channel, an auth scheme, a schema migration — so you can read it end to end, run it locally, and lift the parts you need into your own package.

This page is a map. For each recipe it gives the core idea, the Reactor primitives it exercises, and links straight to the source on GitHub. Click through to the repo for full setup instructions, demos, and expected output. For the same recipes rendered inline behind expandable toggles, see the [Cookbook](/academy/Lookup/Cookbook#reactor-recipes).

:::info Examples, not packages
Recipes are reference implementations, not published libraries. Clone the repo, read the recipe, and adapt the code — don't depend on the `@powerhousedao/example-*` packages in production.
:::

## Running a recipe

Every recipe is a workspace package with a runnable demo. From the repo root:

```sh
pnpm install
pnpm build
# then run a single recipe's demo, e.g.
pnpm --filter @powerhousedao/saga start
```

Each recipe's README lists its exact `pnpm --filter … start` command. The in-memory recipes run against PGlite with no external services; the ones that need PostgreSQL document their connection setup in their own README.

---

## Processors & read models

The most common Reactor extension point. A [processor](/academy/Reference/Reactor/Processors) reacts to operations **post-ready** (after a chain is readable) to perform side effects; a read model indexes **pre-ready** to build a derived view that readers can trust the instant they see it. These recipes cover both ends.

### [Analytics Processor](https://github.com/powerhouse-inc/recipes/tree/main/analytics-processor)

An `IProcessor` that projects expense-report operations into the Powerhouse analytics-engine time-series store, then answers rollups by category, month, and currency.

- Maps each `OperationWithContext` to `AnalyticsSeriesInput` rows via `IAnalyticsStore.addSeriesValues`, registered through a `ProcessorFactory` with a filter and `startFrom: "beginning"`.
- Models corrections as append-only compensating deltas (`ADD` writes `+amount`; `UPDATE` writes `-old` then `+new`; `DELETE` writes `-old`), so the financial series stays auditable.
- Idempotent replay: an `operation.index === 0` for an already-seen document triggers `clearSeriesBySource` and a rebuild, so re-delivery always converges to identical totals.

**Source** · [`src/processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/analytics-processor/src/processor.ts) · [`src/query.ts`](https://github.com/powerhouse-inc/recipes/blob/main/analytics-processor/src/query.ts)
**Concepts** · `IProcessor.onOperations` · `ProcessorFactory` · `IAnalyticsStore` · `AnalyticsPath` · `AnalyticsQueryEngine` — see [Processors](/academy/Reference/Reactor/Processors)

### [Audit Trail](https://github.com/powerhouse-inc/recipes/tree/main/audit-trail)

A processor that reads `ActionSigner` context off every operation and writes an immutable audit log to PostgreSQL, fronted by a GraphQL subgraph.

- Mines signer identity from `operation.action.context.signer` (`user.address`, `networkId`, `chainId`, app credentials) and batch-inserts one Kysely statement per operation batch.
- Pairs with `ReactorClientBuilder.withSigner` so client writes automatically populate the signer context the processor reads.
- Exposes a graphql-yoga subgraph to query entries by user, document, or time range.

**Source** · [`src/processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/audit-trail/src/processor.ts) · [`src/subgraph.ts`](https://github.com/powerhouse-inc/recipes/blob/main/audit-trail/src/subgraph.ts)
**Concepts** · `IProcessor.onOperations` · `ActionSigner` · `ProcessorFactory` · `ReactorClientBuilder.withSigner` — see [Processors](/academy/Reference/Reactor/Processors), [Reactor Client](/academy/Reference/Reactor/ReactorClient)

### [Custom Read Model](https://github.com/powerhouse-inc/recipes/tree/main/custom-read-model)

Implements `IReadModel` directly and registers it with `ReactorBuilder.withReadModel()` to maintain a document-count-per-type materialized view.

- Implements the `IReadModel` contract directly (just `indexOperations` plus query getters) instead of extending `BaseReadModel` — the right choice when you don't need catch-up/rewind plumbing.
- Registered read models index **pre-ready**: their work completes *before* `JOB_READ_READY` fires, so the view is consistent the instant downstream subscribers see the event. This is the key contrast with post-ready processors.

**Source** · [`src/document-count-read-model.ts`](https://github.com/powerhouse-inc/recipes/blob/main/custom-read-model/src/document-count-read-model.ts) · [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/custom-read-model/src/index.ts)
**Concepts** · `IReadModel.indexOperations` · `ReactorBuilder.withReadModel` · pre-ready vs post-ready · `JOB_READ_READY` — see [Processors](/academy/Reference/Reactor/Processors), [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)

### [Full-Text Search Processor](https://github.com/powerhouse-inc/recipes/tree/main/full-text-search)

A processor that flattens each document's resulting state into searchable text and maintains a PostgreSQL `tsvector` index for ranked keyword search.

- Indexes from `context.resultingState` rather than individual action inputs, so it stays agnostic to any document model's action set; dedupes to the last operation per `documentId` within a batch.
- Recursively flattens arbitrary JSON state into one string and maintains the row with an idempotent `INSERT … ON CONFLICT` upsert; reacts to the `DELETE_DOCUMENT` action by removing the row.
- `startFrom: "beginning"` back-indexes existing history; queries use `plainto_tsquery` and `ts_rank` over a GIN index.

**Source** · [`processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/full-text-search/processor.ts) · [`query.ts`](https://github.com/powerhouse-inc/recipes/blob/main/full-text-search/query.ts)
**Concepts** · `IProcessor.onOperations` · `context.resultingState` · `processorManager.registerFactory` · `tsvector` — see [Processors](/academy/Reference/Reactor/Processors), [Storage and Scaling](/academy/Reference/Reactor/StorageAndScaling)

### [Relational DB Subgraph](https://github.com/powerhouse-inc/recipes/tree/main/relational-db-subgraph)

A document-type-agnostic `RelationalDbProcessor` that projects every document into denormalized, Kysely-managed Postgres tables and serves them through a GraphQL subgraph.

- Subclass `RelationalDbProcessor<DB>` and maintain the relational read model in `onOperations` — parse `context.resultingState`, handle `DELETE_DOCUMENT` by clearing rows.
- Owns its schema through an `initAndUpgrade()` override that runs an idempotent (`ifNotExists`) Kysely migration, so registration is safe to repeat; uses the typed query builder, dropping to raw `sql` only for an `ON CONFLICT` upsert.
- A separate query layer feeds a graphql-yoga subgraph that can compose into a supergraph.

**Source** · [`src/processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/relational-db-subgraph/src/processor.ts) · [`src/subgraph.ts`](https://github.com/powerhouse-inc/recipes/blob/main/relational-db-subgraph/src/subgraph.ts)
**Concepts** · `RelationalDbProcessor` · `IRelationalDb` · `initAndUpgrade` · GraphQL subgraph — see [Processors](/academy/Reference/Reactor/Processors), [Storage and Scaling](/academy/Reference/Reactor/StorageAndScaling)

### [Semantic Search Processor](https://github.com/powerhouse-inc/recipes/tree/main/semantic-search)

A processor read model that embeds document state in-process with Transformers.js (MiniLM) into PGlite + pgvector and answers cosine-similarity queries — no external API.

- In-process embeddings (ONNX-quantized `all-MiniLM-L6-v2`, 384-dim) stored and queried in PGlite's pgvector extension — no embedding service, no separate vector database.
- Skips the expensive embed step when a SHA-256 `content_hash` matches the stored row; bakes the dimension into the `vector(384)` column and asserts the length before insert so a mismatched model fails loudly.
- Injects the embedder as a dependency, so tests run against a deterministic offline fake.

**Source** · [`processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/semantic-search/processor.ts) · [`embedder.ts`](https://github.com/powerhouse-inc/recipes/blob/main/semantic-search/embedder.ts) · [`query.ts`](https://github.com/powerhouse-inc/recipes/blob/main/semantic-search/query.ts)
**Concepts** · `IProcessor.onOperations` · `context.resultingState` · pgvector · Transformers.js — see [Processors](/academy/Reference/Reactor/Processors), [Storage and Scaling](/academy/Reference/Reactor/StorageAndScaling)

## Cross-document automation & orchestration

Treating the Reactor as an automation engine: one operation triggers work on other documents, or a single call provisions many documents at once.

### [Batch Progress](https://github.com/powerhouse-inc/recipes/tree/main/batch-progress)

Creates a dependency-ordered set of documents in a single `IReactor.executeBatch` call and tracks each job's lifecycle live via the EventBus.

- One `executeBatch` submits a graph of jobs; each job's `dependsOn` (referencing other jobs by key) lets the Reactor resolve ordering and parallelism across both document and drive scopes.
- Subscribe to `JOB_PENDING` / `JOB_RUNNING` / `JOB_WRITE_READY` / `JOB_READ_READY` / `JOB_FAILED` on the EventBus, mapping `result.jobs[key].id` back to each job for a live progress view.
- `JobAwaiter` reconciles events that arrived after `executeBatch` returned, so awaiting a terminal status is race-free.

**Source** · [`src/create-project.ts`](https://github.com/powerhouse-inc/recipes/blob/main/batch-progress/src/create-project.ts) · [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/batch-progress/src/index.ts)
**Concepts** · `IReactor.executeBatch` · `dependsOn` · `IEventBus.subscribe` · `JobAwaiter.waitForJob` — see [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage), [Error Handling](/academy/Reference/Reactor/ErrorHandling)

### [Cross-Document Reactor](https://github.com/powerhouse-inc/recipes/tree/main/cross-document-reactor)

Drives event-driven automation by subscribing to all document changes through an `IReactorClient` and dispatching actions on related documents from inside the handler.

- `client.subscribe({}, cb)` with an empty filter delivers every `DocumentChangeEvent`; the handler branches on `DocumentChangeType.Updated`.
- Resolves relationships at runtime with `client.find({ parentId })` plus a naming convention, then acts via `client.rename`.
- A module-scoped re-entrancy guard stops the handler's own write — which fires another change event — from re-triggering the rule.

**Source** · [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/cross-document-reactor/src/index.ts)
**Concepts** · `IReactorClient.subscribe` · `DocumentChangeEvent` · `client.find` · re-entrancy guard — see [Reactor Client](/academy/Reference/Reactor/ReactorClient)

### [Saga Coordination Processor](https://github.com/powerhouse-inc/recipes/tree/main/saga)

A processor implements the saga pattern: operations on one document dispatch follow-up actions to others, all correlated by a shared `saga_id`.

- Declarative step definitions (trigger match, target resolver, action builder) drive which incoming operation fires which follow-up; the processor calls `IReactor.execute` on a *different* document.
- A re-entrancy flag prevents the processor from reacting to the operations it itself dispatched, so the saga can't loop forever.
- Correlation lives entirely in the processor's own `saga_log` table keyed by `saga_id` — no changes to any document model or interface.

**Source** · [`src/processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/saga/src/processor.ts) · [`src/demo.ts`](https://github.com/powerhouse-inc/recipes/blob/main/saga/src/demo.ts)
**Concepts** · `IProcessor.onOperations` · `IReactor.execute` · re-entrancy guard · saga correlation — see [Processors](/academy/Reference/Reactor/Processors)

## External integration & ingestion

Bridging the Reactor to the outside world — pulling external events in, and pushing operations out — without losing idempotency or authenticity.

### [Inbound Webhook Bridge](https://github.com/powerhouse-inc/recipes/tree/main/inbound-webhook-bridge)

A standalone `node:http` endpoint that HMAC-verifies signed external webhooks against the raw request bytes and dispatches each verified event as a typed document action.

- Verifies the HMAC over the **exact raw bytes before `JSON.parse`** — a GraphQL/JSON resolver would parse too early, and a `JSON.parse` → `JSON.stringify` round-trip changes the bytes and breaks the MAC.
- Stripe-style scheme: HMAC over the `timestamp` joined to the `rawBody` with `crypto.timingSafeEqual` plus a replay window, so folding the timestamp into the MAC makes the freshness check tamper-proof.
- Idempotency survives restarts by storing processed event ids in **document state** (`processedEventIds`), not processor memory; the reducer independently throws `DuplicateEvent` as a second line of defense.

**Source** · [`src/webhook-bridge.ts`](https://github.com/powerhouse-inc/recipes/blob/main/inbound-webhook-bridge/src/webhook-bridge.ts) · [`src/signature.ts`](https://github.com/powerhouse-inc/recipes/blob/main/inbound-webhook-bridge/src/signature.ts)
**Concepts** · `IReactor.execute` · `JobAwaiter.waitForJob` · action creators · reducer dedup guards — see [Error Handling](/academy/Reference/Reactor/ErrorHandling), [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)

### [External Feed Ingest](https://github.com/powerhouse-inc/recipes/tree/main/external-feed-ingest)

A long-running polling worker that idempotently ingests an external feed into an event-sourced ledger document, seeding its dedup set and watermark from document state so a restart never double-ingests.

- The document *is* the checkpoint store: `seedFromState()` rebuilds the in-memory dedup set and high-watermark from `reactor.get().state`, so a crashed poller resumes with no side database.
- Dedupes on the stable `externalId` checked against state, **not** the delivery cursor — at-least-once feeds redeliver the same id past any watermark; the watermark is only a fetch optimization.
- Corrections are explicit append-only operations: a restatement marks the old entry `SUPERSEDED` and appends a new `RECORDED` entry — the original payload is never mutated.

**Source** · [`src/poller.ts`](https://github.com/powerhouse-inc/recipes/blob/main/external-feed-ingest/src/poller.ts) · [`document-models/feed-ledger/v1/src/reducers/ingest.ts`](https://github.com/powerhouse-inc/recipes/blob/main/external-feed-ingest/document-models/feed-ledger/v1/src/reducers/ingest.ts)
**Concepts** · `IReactor.get` / `execute` · `JobAwaiter` · typed reducer errors · append-only corrections — see [Error Handling](/academy/Reference/Reactor/ErrorHandling), [Reactor Client](/academy/Reference/Reactor/ReactorClient)

### [Discord Webhook Processor](https://github.com/powerhouse-inc/recipes/tree/main/discord-webhook-processor)

A processor that forwards filtered document operations to a Discord webhook as rich embeds, HMAC-signing every request.

- A `ProcessorFilter` on the record (rather than branching inside `onOperations`) scopes which operations reach the processor.
- Chunks the operations array to respect a downstream system's batch limit (Discord's 10-embed cap) across multiple `fetch` POSTs.
- Signs each outbound request with an HMAC-SHA256 `X-Reactor-Signature` over the exact JSON body.

**Source** · [`discord-webhook-processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/discord-webhook-processor/discord-webhook-processor.ts) · [`demo.ts`](https://github.com/powerhouse-inc/recipes/blob/main/discord-webhook-processor/demo.ts)
**Concepts** · `IProcessor.onOperations` · `ProcessorFilter` · `startFrom: "current"` · HMAC signing — see [Processors](/academy/Reference/Reactor/Processors)

## Auth, signing & security

Where identity comes from (`action.context.signer`), how it's verified, and how access decisions are made — inside the reducer, at a gate, or after the fact.

### [Role-Based Auth](https://github.com/powerhouse-inc/recipes/tree/main/role-based-auth)

A custom document model that embeds RBAC in document state and enforces it inside reducer operations by reading the caller from `action.context.signer.user.address`.

- Authorization lives in the reducer, not a server gate — so access control replicates with the document; each operation throws if the caller is missing or lacks the required role.
- Roles are *state*, not config: `creator` / `admins` / `members` are fields, and the first `bootstrap` caller auto-promotes to permanent root admin, protected by `CannotRevokeCreator` / `LastAdmin` invariants.
- Rejections surface as a typed error taxonomy (`NotAuthorized`, `NotAdmin`, …) captured onto `operation.error` in the document's log.

**Source** · [`document-models/role-based-auth/v1/src/reducers/access.ts`](https://github.com/powerhouse-inc/recipes/blob/main/role-based-auth/document-models/role-based-auth/v1/src/reducers/access.ts) · [`src/demo.ts`](https://github.com/powerhouse-inc/recipes/blob/main/role-based-auth/src/demo.ts)
**Concepts** · document-model reducer · `action.context.signer` · generated error taxonomy — see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)

### [Rate Limiter](https://github.com/powerhouse-inc/recipes/tree/main/rate-limiter)

A read-only processor that counts operations per signer address over a sliding window and trips a shared `AuthService` cooldown, which a request gate consults to throttle abusive users.

- Decouples observation from enforcement: the processor only signals (`authService.cooldown`) and never blocks, while the request gate (resolver/middleware) reads `authService.isAllowed` before forwarding mutations.
- Derives the per-user key from `signer.user.address`; sliding-window counting in a plain `Map`, reset in `onDisconnect`.

**Source** · [`src/rate-limiter-processor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/rate-limiter/src/rate-limiter-processor.ts) · [`src/auth-service.ts`](https://github.com/powerhouse-inc/recipes/blob/main/rate-limiter/src/auth-service.ts)
**Concepts** · `IProcessor.onOperations` · `signer.user.address` · `AuthService` gate · `startFrom: "current"` — see [Processors](/academy/Reference/Reactor/Processors)

### [Signed Operations Verifier](https://github.com/powerhouse-inc/recipes/tree/main/signed-operations-verifier)

A standalone script that builds cryptographically signed operations with an `ISigner` and verifies each one per-signature, detecting tampered and unsigned operations.

- Builds a self-contained ECDSA P-256 `ISigner` with `RenownCryptoBuilder` plus in-memory key storage — no filesystem or network.
- `buildSignedAction` advances the document through the reducer between actions, so each signature captures the correct previous-state hash; `verifyOperationSignature` checks each signature tuple.
- Tamper and unsigned detection: corrupting a signature element or removing `action.context` flips verification to invalid / unsigned respectively.

**Source** · [`src/verify-operations.ts`](https://github.com/powerhouse-inc/recipes/blob/main/signed-operations-verifier/src/verify-operations.ts) · [`src/verify-operations.test.ts`](https://github.com/powerhouse-inc/recipes/blob/main/signed-operations-verifier/src/verify-operations.test.ts)
**Concepts** · `ISigner` · `RenownCryptoSigner` · `buildSignedAction` · `verifyOperationSignature` — see [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage)

## Document-model patterns

Patterns that live in the document model itself — how schemas evolve over time, and how to model a container without paying for it.

### [Document Versioning](https://github.com/powerhouse-inc/recipes/tree/main/document-versioning)

Migrates a document model's schema from v1 to v2 with an `UpgradeManifest` and a pure `upgradeReducer`, so operation logs recorded under the old schema still replay into the new state shape.

- Declares every schema version in one codegen spec so `ph generate` emits a versioned `v1` / `v2` / `upgrades` tree plus a wired `UpgradeManifest`.
- The upgrade reducer must patch **both** `state` and `initialState`: replay folds domain operations from the stored `initialState` and never re-runs the `UPGRADE_DOCUMENT` op, so a state-only migration passes live but fails replay with `HashMismatchError`.
- The latest reducer owns the entire history — retired operations are kept and their reducer maps old fields onto new ones, so cross-version replay converges.

**Source** · [`document-models/todo/upgrades/v2.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/document-models/todo/upgrades/v2.ts) · [`src/upgrade.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-versioning/src/upgrade.ts)
**Concepts** · `UpgradeManifest` · `upgradeReducer` · `computeUpgradePath` · `replayDocument` · `HashMismatchError` — see [Document Model Registry](/academy/Reference/Reactor/DocumentModelRegistry)

### [Drive Override](https://github.com/powerhouse-inc/recipes/tree/main/drive-override)

A custom container document that tracks its children through the reactor's system-scope `ADD_RELATIONSHIP` action instead of `document-drive`'s `ADD_FILE`, keeping container state O(1).

- The container is an ordinary `DocumentModelModule` holding only metadata (`name` / `description`, one `SET_METADATA` op) — no embedded `nodes[]`, so its state and operation log stay flat as children scale past 10,000.
- Children are linked with `addRelationshipAction(...)` dispatched through `reactor.execute`; the executor writes one row to the relationship index and the container's reducer never sees them.
- Enumerate with `IDocumentIndexer.getOutgoing` / `getIncoming` and cursor paging — DB-native indexed queries, also exposed over GraphQL.

**Source** · [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/drive-override/src/index.ts) · [`document-models/custom-container/v1/src/reducers/metadata.ts`](https://github.com/powerhouse-inc/recipes/blob/main/drive-override/document-models/custom-container/v1/src/reducers/metadata.ts)
**Concepts** · `addRelationshipAction` · `IDocumentIndexer` · `ConsistencyToken` · `DocumentModelModule` — see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)

## Tooling & operations

Operating a Reactor from the outside: exporting state, watching the live event stream, monitoring sync health, and moving the underlying database.

### [Document Snapshot Exporter](https://github.com/powerhouse-inc/recipes/tree/main/document-snapshot-exporter)

A CLI that exports document state and operation history to JSON using `IReactor` consistency tokens for read-after-write, contrasted side-by-side with the auto-managed `IReactorClient`.

- Threads the `ConsistencyToken` from a completed write into `reactor.get()` / `getOperations()`, so a read reflects the just-finished write even while background indexing lags.
- Side-by-side comparison via a `--mode` flag: low-level `IReactor` (returns `JobInfo`, manual awaiting + tokens) versus `IReactorClient` (awaits and manages consistency internally, returns the document directly).
- Handles the differing `getOperations` shapes — a per-scope `Record` for `IReactor` versus a flat `PagedResults` for the client.

**Source** · [`src/export-reactor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-snapshot-exporter/src/export-reactor.ts) · [`src/export-client.ts`](https://github.com/powerhouse-inc/recipes/blob/main/document-snapshot-exporter/src/export-client.ts)
**Concepts** · `ConsistencyToken` · `IReactor` vs `IReactorClient` · `JobAwaiter` · `getOperations` — see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor), [Reactor Client](/academy/Reference/Reactor/ReactorClient)

### [Subscription CLI](https://github.com/powerhouse-inc/recipes/tree/main/subscription-cli)

A Node CLI that connects to a Reactor's GraphQL subscriptions endpoint over WebSocket and prints `documentChanges` (and optional `jobChanges`) events live.

- Consumes real-time subscriptions from *outside* the reactor process via the `graphql-ws` protocol, rather than from an in-process processor.
- Server-side filters the change stream with a `SearchFilterInput` (by document type and/or parent drive); passes bearer-token auth through `connectionParams`.
- Optionally watches a single job's lifecycle via `jobChanges(jobId)`, and cleans up per-stream subscriptions on `SIGINT` / `SIGTERM`.

**Source** · [`src/index.ts`](https://github.com/powerhouse-inc/recipes/blob/main/subscription-cli/src/index.ts)
**Concepts** · `documentChanges` · `jobChanges` · `SearchFilterInput` · `graphql-ws` — see [Synchronization](/academy/Reference/Reactor/Synchronization), [Reactor Client](/academy/Reference/Reactor/ReactorClient)

### [Sync Health Monitor](https://github.com/powerhouse-inc/recipes/tree/main/sync-health-monitor)

Subscribes to the Reactor EventBus sync lifecycle events to maintain live replication-health counters and exposes them through a GraphQL subgraph.

- Folds all five `SyncEventTypes` (pending / succeeded / failed / dead-letter / connection-state) into health counters and derives a healthy / degraded / unhealthy status.
- Implements `IChannelFactory` and `IChannel` to bridge two reactors entirely in-process, calling the mailbox's success/failure hooks and routing failed sends to a dead-letter queue.
- Registers peers via `syncModule.syncManager.add(...)` and serves a `syncHealth` query over a graphql-yoga subgraph.

**Source** · [`src/health-monitor.ts`](https://github.com/powerhouse-inc/recipes/blob/main/sync-health-monitor/src/health-monitor.ts) · [`src/internal-channel.ts`](https://github.com/powerhouse-inc/recipes/blob/main/sync-health-monitor/src/internal-channel.ts)
**Concepts** · `IEventBus.subscribe` · `SyncEventTypes` · `IChannel` / `IChannelFactory` · `syncManager.add` — see [Synchronization](/academy/Reference/Reactor/Synchronization)

### [DB Migrate](https://github.com/powerhouse-inc/recipes/tree/main/db-migrate)

Three Bash scripts that export, import, and migrate a PostgreSQL database by running `pg_dump` / `pg_restore` / `psql` inside the `postgres:17` Docker image — no local Postgres tools needed.

- Runs the Postgres client tools from the official Docker image, so Docker is the only prerequisite for backing up or moving a Reactor relational store.
- `migrate.sh` streams `pg_dump` straight into `pg_restore` (or `psql`) over a shell pipe, copying one database into another in a single pass with no intermediate dump file.
- A code-free operations recipe — no document models, processors, or subgraphs.

**Source** · [`migrate.sh`](https://github.com/powerhouse-inc/recipes/blob/main/db-migrate/migrate.sh) · [`export.sh`](https://github.com/powerhouse-inc/recipes/blob/main/db-migrate/export.sh)
**Concepts** · `pg_dump` · `pg_restore` · Docker — see [Storage and Scaling](/academy/Reference/Reactor/StorageAndScaling)
