---
toc_max_heading_level: 3
---

# Advanced reactor usage

This page covers the low-level `IReactor` interface and the internal components you can access through `ReactorModule`. Most developers should use `IReactorClient` (see [IReactorClient API Reference](/academy/Reference/Reactor/ReactorClient)) — the information here is for advanced scenarios such as:

- Building custom tooling or infrastructure on top of the reactor
- Working with consistency tokens for read-after-write guarantees
- Subscribing directly to internal event bus events
- Constructing a reactor with custom storage or executor configurations
- Writing integration tests that need access to internals

## IReactor vs IReactorClient

`IReactorClient` is a high-level wrapper around `IReactor`. The table below summarizes the key differences:

| Aspect                  | `IReactor`                                                 | `IReactorClient`                                                                                        |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Write return values** | Returns `JobInfo` immediately (fire-and-forget)            | Waits for job completion, returns the final document                                                    |
| **Signing**             | Caller passes an `ISigner` explicitly                      | Client manages signing internally                                                                       |
| **Document lookup**     | Separate `get()`, `getBySlug()`, `getByIdOrSlug()` methods | Single `get(identifier)` that accepts either                                                            |
| **Children/parents**    | Returns `string[]` (document IDs only)                     | Returns `PagedResults<PHDocument>` (full documents)                                                     |
| **Convenience methods** | Basic CRUD                                                 | Plus: `createEmpty()`, `rename()`, `moveRelationship()`, `deleteDocuments()`, and `client.drives.addFile()` |
| **Subscriptions**       | Not available (use the event bus directly)                 | `subscribe(search, callback, view?)` for real-time document changes                                     |
| **Consistency tokens**  | Explicit — pass tokens to reads after writes               | Handled internally by the client                                                                        |

**When to use `IReactor` directly:**

- You need fire-and-forget job submission without waiting for completion
- You want explicit control over consistency tokens
- You are building infrastructure that manages its own signing
- You need access to `executeBatch()` for multi-document operations with dependency ordering

## Building a reactor with ReactorBuilder

`ReactorBuilder` uses a fluent API to construct and wire all internal components.

```typescript
import { ReactorBuilder, ChannelScheme } from "@powerhousedao/reactor";
import { ConsoleLogger } from "document-model";

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([todoListModule, invoiceModule])
  .withLogger(new ConsoleLogger())
  .withExecutorConfig({ maxConcurrency: 4, jobTimeoutMs: 30_000 })
  .withWriteCacheConfig({ maxDocuments: 100, ringBufferSize: 10 })
  .withMigrationStrategy("auto")
  .withChannelScheme(ChannelScheme.CONNECT)
  .build();
```

`build()` returns an `IReactor`. If you need access to internal components, use `buildModule()` instead — it returns an `InProcessReactorModule` containing the reactor plus all its internals (see [ReactorModule](#reactormodule)).

### Builder methods

| Method                            | Description                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `withDocumentModelSources(sources)` | Register document-model sources: live modules, importable `{ filePath }` files, or importable `{ packageName }` packages |
| `withUpgradeManifests(manifests)` | Register [upgrade manifests](/academy/Reference/Reactor/DocumentModelRegistry) for document model versioning |
| `withLogger(logger)`              | Set the logger (defaults to `ConsoleLogger`)                             |
| `withExecutorConfig(config)`      | Configure `maxConcurrency`, `jobTimeoutMs`, and the reactor `featureFlags` (see [Authorization](/academy/Reference/Reactor/Authorization)) |
| `withWriteCacheConfig(config)`    | Configure `maxDocuments` and `ringBufferSize` for the write cache        |
| `withMigrationStrategy(strategy)` | Set to `"auto"` to run database migrations on build                      |
| `withKysely(kysely)`              | Provide a custom Kysely database instance (defaults to in-memory PGlite) |
| `withQueue(queue)`                | Provide a custom job queue (defaults to `InMemoryQueue`)                 |
| `withEventBus(eventBus)`          | Provide a custom event bus                                               |
| `withExecutor(executor)`          | Provide a custom job executor manager                                    |
| `withReadModel(readModel)`        | Register an additional read model                                        |
| `withReadModelFactory(factory)`   | Register a factory that builds a pre-ready read model after the operation index, write cache, and processor-manager tracker exist |
| `withReadModelCoordinator(coordinator)` | Provide a custom read model coordinator                            |
| `withSync(syncBuilder)`           | Enable [synchronization with remote reactors](/academy/Reference/Reactor/Synchronization) |
| `withChannelScheme(scheme)`       | Set the sync channel scheme                                              |
| `withFeatures(features)`          | Set feature flags                                                        |
| `withSignatureVerifier(verifier)` | Set a signature verification handler                                     |
| `withJwtHandler(handler)`         | Set a JWT handler for authentication                                     |
| `withDocumentModelLoader(loader)` | Set a lazy document-model loader: `load(documentType)` returns a `DocumentModelSource`; importable sources are broadcast to executor workers, live modules stay host-only |
| `withDriveContainerTypes(types)`  | Set the document types treated as drive containers                       |
| `withInstrumentedPool(instrumentation)` | Register an externally-built `pg.Pool` so its metrics surface through `pools` |
| `withShutdownHook(hook)`          | Register an async cleanup hook to run during graceful shutdown           |
| `withSignalHandlers()`            | Register OS signal handlers for graceful shutdown                        |
| `withWorkerPool(options)`         | Run jobs in N worker threads instead of in-process — calling it enables the pool; `{ numWorkers, db, verifier? }` or `{ numWorkers, factory }` (see [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling)) |
| `withProjectionShards(config)`    | Run N sharded projection workers (see [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling)) |
| `withProjectionWorkerFactory(factory)` | Inject a custom projection worker factory                           |

Workers open their own Postgres pools: the executor pool takes its connection info in `withWorkerPool({ db })`, and `withProjectionShards` takes its own `db` (falling back to the executor pool's when both are configured). See [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling) for worker pools and projection shards, and [Synchronization and remote drives](/academy/Reference/Reactor/Synchronization) for sync.

### Built-in document models

A reactor only knows the document types it was given. Nothing is registered by default. Two built-in modules ship with the platform. Without `driveDocumentModelModule` the reactor cannot create a drive. Without `documentModelDocumentModelModule` the reactor cannot store document-model definitions.

```typescript
import { ReactorBuilder } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([
    documentModelDocumentModelModule, // powerhouse/document-model
    driveDocumentModelModule, // powerhouse/document-drive
    todoListModule,
  ])
  .build();
```

## IReactor API

### Reading documents

```typescript
// By exact ID
const doc = await reactor.get<MyDocument>(docId);

// By slug
const doc = await reactor.getBySlug<MyDocument>("my-document");

// By either ID or slug (throws if ambiguous)
const doc = await reactor.getByIdOrSlug<MyDocument>(identifier);

// With consistency token for read-after-write
const doc = await reactor.get<MyDocument>(docId, undefined, token);

// Outgoing and incoming relationships (returns string[] of IDs, not full documents)
const childIds = await reactor.getOutgoingRelationships(parentId, "child");
const parentIds = await reactor.getIncomingRelationships(childId, "child");

// Search
const results = await reactor.find({ type: "powerhouse/todo-list" });

// Operations: keyed by scope, each a PagedResults<Operation>
// (unlike the client's getOperations, which returns a flat PagedResults)
const ops = await reactor.getOperations(docId);
const globalOps = ops["global"].results;

// Document model modules (the IReactor analogue of the client's
// getDocumentModelModules)
const models = await reactor.getDocumentModels(); // PagedResults<DocumentModelModule>
```

`getDocumentModels(namespace?, paging?, signal?)` returns `Promise<PagedResults<DocumentModelModule>>`. `getOperations` accepts optional `view`, `OperationFilter`, and paging, and returns `Promise<Record<string, PagedResults<Operation>>>` — index it by scope.

### Writing documents

All write methods return `JobInfo` immediately — they do not wait for the job to complete.

```typescript
// Create a document
const job = await reactor.create(document, signer);

// Execute actions
const job = await reactor.execute(docId, "main", actions);

// Load pre-existing operations (e.g., from sync)
const job = await reactor.load(docId, "main", operations);

// Delete
const job = await reactor.deleteDocument(docId, signer);

// Manage relationships
const job = await reactor.addRelationship(parentId, childId1, "child");
const job = await reactor.removeRelationship(parentId, childId1, "child");
```

`create`, `deleteDocument`, `execute`, `load`, `executeBatch`, and `loadBatch` accept an optional trailing `meta?: Record<string, unknown>` that is merged into the job's `JobMeta`. Use it for tracing or correlation.

#### Building the document for `create`

`create` takes a fully formed `PHDocument`. Build the document with the model's creator, which sets the header, type and initial state. The reactor turns the document into a `CREATE_DOCUMENT` and an `UPGRADE_DOCUMENT` action in one `document`-scope job. The built-in models export their creators directly. A codegen'd module exposes the same function as `utils.createDocument`.

```typescript
import { documentModelCreateDocument } from "document-model";
import { driveCreateDocument } from "@powerhousedao/shared/document-drive";

const drive = driveCreateDocument();
const driveJob = await reactor.create(drive, signer);

const modelDefinition = documentModelCreateDocument();
const modelJob = await reactor.create(modelDefinition, signer);

const todoList = todoListModule.utils.createDocument();
const todoJob = await reactor.create(todoList, signer);
```

Each creator takes an optional initial state and falls back to the model's defaults.

### Batch operations

`executeBatch` lets you submit multiple mutation jobs with dependency ordering. Jobs are executed in the order dictated by their `dependsOn` keys.

What it guarantees is ordering, and only ordering. A batch is not atomic and not transactional: each job commits on its own, and there is no batch-level rollback, status, or consistency token.

In particular, a `dependsOn` edge waits for the job before it to *finish*, not to *succeed*. A job that fails leaves the queue exactly as a successful one does, so its dependents still run — against whatever state the failure left behind. Jobs that committed stay committed.

The returned value is a submission receipt rather than a result: every `JobInfo` comes back `PENDING`, with a placeholder consistency token. To find out what actually happened, poll `getJobStatus` for each job id, or subscribe to `JOB_FAILED` and correlate through `job.meta.batchId` and `job.meta.batchJobIds`.

There is no idempotency key on a job plan, so re-submitting a batch after a partial failure re-applies the entries that already succeeded. Any compensation is the caller's to write.

A job plan carries raw `Action` objects, so a batch that creates a document uses action creators rather than `reactor.create`. `@powerhousedao/reactor` exports `createDocumentAction`, `upgradeDocumentAction` and `deleteDocumentAction` for the `document`-scope lifecycle actions. A model's own actions come from its creators, here `addFile` from the drive model.

```typescript
import {
  createDocumentAction,
  upgradeDocumentAction,
} from "@powerhousedao/reactor";
import {
  addFile,
  driveDocumentType,
} from "@powerhousedao/shared/document-drive";
import { generateId } from "document-model";

const driveId = generateId();
const fileId = generateId();

const result = await reactor.executeBatch({
  jobs: [
    {
      key: "create-drive",
      documentId: driveId,
      scope: "document",
      branch: "main",
      actions: [
        createDocumentAction({
          documentId: driveId,
          model: driveDocumentType,
          version: 0,
        }),
        upgradeDocumentAction({
          documentId: driveId,
          model: driveDocumentType,
          fromVersion: 0,
          toVersion: 1,
        }),
      ],
      dependsOn: [],
    },
    {
      key: "add-document",
      documentId: driveId,
      scope: "global",
      branch: "main",
      actions: [
        addFile({ id: fileId, name: "Budget", documentType: "powerhouse/budget" }),
      ],
      dependsOn: ["create-drive"], // Waits for drive creation
    },
  ],
});

// result.jobs["create-drive"] and result.jobs["add-document"] are JobInfo objects
```

A job's `scope` must equal the scope of every action it carries. `executeBatch` checks the scopes on submission and throws `Job '<key>' declares scope '<scope>' but action has scope '<actionScope>'`. `CREATE_DOCUMENT`, `UPGRADE_DOCUMENT` and `DELETE_DOCUMENT` are `document`-scope actions, so creating a document and writing its `global` state are two jobs, as above.

`loadBatch` is the load-side counterpart. It submits batches of pre-existing operations (e.g. from sync) with the same dependency ordering. A `LoadJobPlan` uses `operations` instead of `actions`, and adds `externalDeps: string[]` — pre-resolved job UUIDs from prior batches that are appended to the queue hint without plan-key resolution.

```typescript
const result = await reactor.loadBatch({
  jobs: [
    {
      key: "load-doc",
      documentId: docId,
      scope: "global",
      branch: "main",
      operations: incomingOperations,
      dependsOn: [],
      externalDeps: [],
    },
  ],
});

// result.jobs["load-doc"] is a JobInfo object
```

### Job tracking and shutdown

```typescript
// Check job status
const info = await reactor.getJobStatus(jobId);
// info.status is PENDING | RUNNING | WRITE_READY | READ_READY | FAILED

// Graceful shutdown
const shutdown = reactor.kill();
// shutdown.isShutdown is true immediately
await shutdown.completed; // Resolves when all in-flight jobs finish
```

`kill()` returns a `ShutdownStatus` synchronously (it is not a Promise): `{ get isShutdown(): boolean; completed: Promise<void> }`. `isShutdown` flips to `true` immediately; `await shutdown.completed` to block until in-flight jobs drain. Do not `await reactor.kill()`.

### Awaiting a job with `JobAwaiter`

`IReactorClient` waits for jobs with a `JobAwaiter`. On the `IReactor` path you construct one yourself over the module's event bus instead of polling `getJobStatus`:

```typescript
import { JobAwaiter, ReactorBuilder } from "@powerhousedao/reactor";

const { reactor, eventBus } = await new ReactorBuilder()
  .withDocumentModelSources([todoListModule])
  .buildModule();

const awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
  reactor.getJobStatus(jobId, signal),
);

const job = await reactor.create(document);
const info = await awaiter.waitForJob(job.id); // READ_READY or FAILED, so check info.status

awaiter.shutdown(); // rejects anything still pending
```

`waitForJob` resolves with the terminal `JobInfo`, for `FAILED` as well as `READ_READY`. It reads the current status first, so a job that finished before the call resolves immediately. Resolving means the job reached a terminal status. It does not mean every other `JOB_READ_READY` subscriber has run: subscribers run sequentially in registration order, and the awaiter registers its own subscriber when it is constructed. If your continuation depends on your own subscriber's work, resolve a promise from inside that subscriber and await that promise too.

## Consistency tokens

Every write operation returns a `JobInfo` that includes a `ConsistencyToken`. This token captures the exact operation coordinates that the write produced:

```typescript
type ConsistencyToken = {
  version: 1;
  createdAtUtcIso: string;
  coordinates: Array<{
    documentId: string;
    scope: string;
    branch: string;
    operationIndex: number;
  }>;
};
```

Pass this token to subsequent reads to guarantee you see the effects of your write:

```typescript
const job = await reactor.execute(docId, "main", actions);
const token = job.consistencyToken;

// This read is guaranteed to include the operations from the write above
const doc = await reactor.get(docId, undefined, token);
```

Without a consistency token, reads may return stale data if the read models have not yet indexed the latest operations. `IReactorClient` handles this automatically — it waits for `READ_READY` before returning — but when using `IReactor` directly, consistency tokens give you explicit control.

## ReactorModule

`ReactorBuilder.buildModule()` returns an `InProcessReactorModule` that exposes the full in-process dependency graph:

```typescript
const module = await new ReactorBuilder()
  .withDocumentModelSources([todoListModule])
  .buildModule();

const { reactor, eventBus, processorManager, operationStore } = module;
```

The base `ReactorModule` interface has only three fields (`documentModelRegistry`, `syncModule`, `eventBus`) — the subset a client resolves regardless of where the reactor graph lives. `buildModule()` returns the in-process extension `InProcessReactorModule`, which adds the components below.

### Available components

`InProcessReactorModule`:

| Component              | Interface                     | Purpose                                                  |
| ---------------------- | ----------------------------- | -------------------------------------------------------- |
| `reactor`              | `IReactor`                    | The reactor instance                                     |
| `documentModelRegistry`| `IDocumentModelRegistry`      | Registered document model modules and version upgrades   |
| `eventBus`             | `IEventBus`                   | Internal pub/sub for reactor events                      |
| `queue`                | `IQueue`                      | Job queue with per-document ordering                     |
| `jobTracker`           | `IJobTracker`                 | Tracks job lifecycle (PENDING through READ_READY/FAILED) |
| `executorManager`      | `IJobExecutorManager`         | Manages job executor instances                           |
| `operationStore`       | `IOperationStore`             | Append-only operation log                                |
| `keyframeStore`        | `IKeyframeStore`              | Document state snapshots                                 |
| `writeCache`           | `IWriteCache`                 | Write-path document cache                                |
| `operationIndex`       | `IOperationIndex`             | Global ordinal assignment                                |
| `documentView`         | `IDocumentView`               | Maintains document snapshots for reads                   |
| `documentViewConsistencyTracker` | `IConsistencyTracker` | Tracks document-view indexing for read-after-write     |
| `documentIndexer`      | `IDocumentIndexer`            | Tracks document relationships (parent/child graph)       |
| `documentIndexerConsistencyTracker` | `IConsistencyTracker` | Tracks document-indexer indexing for read-after-write |
| `readModelCoordinator` | `IReadModelCoordinator`       | Dispatches operations to all read models                 |
| `subscriptionManager`  | `IReactorSubscriptionManager` | Manages document change subscriptions                    |
| `processorManager`     | `IProcessorManager`           | Routes operations to user-defined [processors](/academy/Reference/Reactor/Processors) |
| `processorManagerConsistencyTracker` | `IConsistencyTracker` | Tracks processor-manager catch-up                     |
| `database`             | `Kysely<Database>`            | The underlying database connection                       |
| `syncModule`           | `InProcessSyncModule \| undefined` | Sync infrastructure (if configured)                 |
| `pools`                | `PoolInstrumentation[]`       | Instrumented `pg.Pool` handles; empty for PGlite         |

## Subscribing to the event bus

The `IEventBus` lets you listen to internal reactor events. Subscribers are called sequentially in registration order.

```typescript
import {
  ReactorEventTypes,
  SyncEventTypes,
  type JobReadReadyEvent,
  type SyncFailedEvent,
} from "@powerhousedao/reactor";

// Listen for all completed jobs
const unsubscribe = module.eventBus.subscribe(
  ReactorEventTypes.JOB_READ_READY,
  (type, event: JobReadReadyEvent) => {
    console.log("Job completed:", event.jobId);
    console.log("Operations:", event.operations.length);
  },
);

// Listen for sync failures
module.eventBus.subscribe(
  SyncEventTypes.SYNC_FAILED,
  (type, event: SyncFailedEvent) => {
    console.error("Sync failed for job:", event.jobId, event.errors);
  },
);
```

`subscribe<K>(type: number, subscriber: (type: number, event: K) => void | Promise<void>)` cannot infer the payload from the event id, so annotate the callback's `event` parameter (or pass `K` explicitly). Left unannotated, `event` is `unknown` and the handler does not compile. The payload types are exported from `@powerhousedao/reactor`.

Besides `ReactorEventTypes`, `SyncEventTypes`, and `QueueEventTypes`, the executor managers emit `JobExecutorEventTypes` (`JOB_STARTED: 20000`, `JOB_COMPLETED: 20001`, `JOB_FAILED: 20002`, `EXECUTOR_STARTED: 20003`, `EXECUTOR_STOPPED: 20004`).

:::warning
Two distinct job-failed payloads exist. The reactor-level `ReactorEventTypes.JOB_FAILED` (10005) is exported as `ReactorJobFailedEvent` and carries `jobId` and `error: Error`. The executor-level `JobExecutorEventTypes.JOB_FAILED` (20002) is exported as `JobFailedEvent` and carries `job` and `error: string`. Check which enum you subscribed to before reading `error`.
:::

See [Reactor event system](/academy/Reference/Reactor/WorkingWithTheReactor#reactor-event-system) for the full list of event types.

## Working with the operation store

The `IOperationStore` provides direct access to the append-only operation log.

```typescript
const { operationStore } = module;

// Get operations since a specific revision
const ops = await operationStore.getSince(docId, "global", "main", 5);

// Get the latest revision per scope
const revisions = await operationStore.getRevisions(docId, "main");
```

:::warning
Writing directly to the operation store bypasses the job queue, reducers, and read models. In almost all cases, use `reactor.execute()` or `reactor.load()` instead. Direct store access is intended for read-only inspection, debugging, and testing.
:::

## Registering custom read models

A read model receives operations after each job's write phase completes and builds a derived view of the data.

```typescript
import type { IReadModel, OperationWithContext } from "@powerhousedao/reactor";

class MyCustomReadModel implements IReadModel {
  // `name` identifies the read model for lookup via getReadModel
  readonly name = "my-custom-read-model";

  async indexOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      // Build your derived view
    }
  }
}

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([todoListModule])
  .withReadModel(new MyCustomReadModel())
  .build();
```

Read models registered via `withReadModel()` run in the pre-ready phase — they complete before `JOB_READ_READY` fires. This is in contrast to processors (registered via `ProcessorManager`), which run in the post-ready phase.

## Example: integration test setup

A common use case for the low-level API is writing integration tests that need full control over the reactor lifecycle:

`ReactorClientBuilder.buildModule()` returns an `InProcessReactorClientModule`. It holds the `client`, direct references to `reactor`, `eventBus`, `documentIndexer`, `documentView`, `signer`, `subscriptionManager` and `jobAwaiter`, and the `reactorModule`. `reactorModule` is the same `InProcessReactorModule` you get from `ReactorBuilder.buildModule()`, typed `InProcessReactorModule | undefined` because the `withReactor` path has none. Narrow it before use. Hand the builder a `ReactorBuilder` via `withReactorBuilder` and it builds the reactor for you:

```typescript
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { ConsoleLogger } from "document-model";

async function createTestReactor() {
  const builder = new ReactorBuilder()
    .withDocumentModelSources([todoListModule])
    .withLogger(new ConsoleLogger());

  // buildModule returns both the client and the reactor module internals
  const { client, reactorModule } = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  if (!reactorModule) {
    throw new Error("withReactorBuilder always yields a reactorModule");
  }

  return { client, reactorModule };
}

// In your test
const { client, reactorModule } = await createTestReactor();

// Use client for high-level operations
const doc = await client.createEmpty("powerhouse/todo-list");

// Use the reactor module for low-level inspection
const ops = await reactorModule.operationStore.getSince(
  doc.header.id,
  "global",
  "main",
  0,
);
expect(ops.results.length).toBe(1);

// Cleanup
reactorModule.reactor.kill();
```

If you already built a reactor and have its internals, wire them directly instead of passing a builder:

```typescript
const client = await new ReactorClientBuilder()
  .withReactor(
    module.reactor,
    module.eventBus,
    module.documentIndexer,
    module.documentView,
  )
  .build();
```

The `withReactor` path receives no feature flags and no registry, so the client cannot derive a read gate from the reactor (see below).

### ReactorClientBuilder methods

| Method                              | Description                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| `withLogger(logger)`                | Set the logger (defaults to `ConsoleLogger`)                         |
| `withReactorBuilder(builder)`       | Build the reactor from a `ReactorBuilder` (mutually exclusive with `withReactor`) |
| `withReactor(reactor, eventBus, documentIndexer, documentView)` | Wire an already-built reactor and its internals        |
| `withSigner(config)`                | Set an `ISigner` or `SignerConfig` for signing/verification          |
| `withSubscriptionManager(manager)`  | Provide a custom subscription manager                                |
| `withJobAwaiter(awaiter)`           | Provide a custom job awaiter                                         |
| `withDocumentModelLoader(loader)`   | Set a custom document model loader (forwarded to the reactor builder) |
| `withReadGate(gate)`                | Override how reads are gated with an `IReadGate` (see below)         |
| `build()`                           | Build and return the `IReactorClient`                                |
| `buildModule()`                     | Build and return the client plus its reactor module internals        |

You must call exactly one of `withReactorBuilder` or `withReactor` before `build()`/`buildModule()`, or the build throws.

The two wiring paths do not gate reads the same way. A client built with `withReactorBuilder` derives its read gate from that reactor's feature flags and model registry, so `{ group }` principals resolve once `authGroups` is on. A client built with `withReactor(...)` evaluates the policy alone. A `{ group }` grant never matches, and a reader who holds a scope only through a roster loses that scope without an error. To run several per-identity clients over one already-built reactor, pass each the same gate through `withReadGate`. `ModelReadGate`, `BareReadGate` and `readDecisionModel` are exported from `@powerhousedao/reactor`. See [Authorization](/academy/Reference/Reactor/Authorization).
