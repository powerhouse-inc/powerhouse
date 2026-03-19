---
toc_max_heading_level: 3
---

# Advanced reactor usage

This page covers the low-level `IReactor` interface and the internal components you can access through `ReactorModule`. Most developers should use `IReactorClient` (see [IReactorClient API Reference](/academy/APIReferences/ReactorClient)) — the information here is for advanced scenarios such as:

- Building custom tooling or infrastructure on top of the reactor
- Working with consistency tokens for read-after-write guarantees
- Subscribing directly to internal event bus events
- Constructing a reactor with custom storage or executor configurations
- Writing integration tests that need access to internals

## IReactor vs IReactorClient

`IReactorClient` is a high-level wrapper around `IReactor`. The table below summarizes the key differences:

| Aspect                  | `IReactor`                                                 | `IReactorClient`                                                                                    |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Write return values** | Returns `JobInfo` immediately (fire-and-forget)            | Waits for job completion, returns the final document                                                |
| **Signing**             | Caller passes an `ISigner` explicitly                      | Client manages signing internally                                                                   |
| **Document lookup**     | Separate `get()`, `getBySlug()`, `getByIdOrSlug()` methods | Single `get(identifier)` that accepts either                                                        |
| **Children/parents**    | Returns `string[]` (document IDs only)                     | Returns `PagedResults<PHDocument>` (full documents)                                                 |
| **Convenience methods** | Basic CRUD                                                 | Plus: `createEmpty()`, `createDocumentInDrive()`, `rename()`, `moveChildren()`, `deleteDocuments()` |
| **Subscriptions**       | Not available (use the event bus directly)                 | `subscribe(search, callback, view?)` for real-time document changes                                 |
| **Consistency tokens**  | Explicit — pass tokens to reads after writes               | Handled internally by the client                                                                    |

**When to use `IReactor` directly:**

- You need fire-and-forget job submission without waiting for completion
- You want explicit control over consistency tokens
- You are building infrastructure that manages its own signing
- You need access to `executeBatch()` for multi-document atomic operations with dependency ordering

## Building a reactor with ReactorBuilder

`ReactorBuilder` uses a fluent API to construct and wire all internal components.

```typescript
import {
  ReactorBuilder,
  ConsoleLogger,
  ChannelScheme,
} from "@powerhousedao/reactor";

const reactor = await new ReactorBuilder()
  .withDocumentModels([todoListModule, invoiceModule])
  .withLogger(new ConsoleLogger())
  .withExecutorConfig({ maxConcurrency: 4, jobTimeoutMs: 30_000 })
  .withWriteCacheConfig({ maxDocuments: 100, ringBufferSize: 10 })
  .withMigrationStrategy("auto")
  .withChannelScheme(ChannelScheme.CONNECT)
  .build();
```

`build()` returns an `IReactor`. If you need access to internal components, use `buildModule()` instead — it returns a `ReactorModule` containing the reactor plus all its internals (see [ReactorModule](#reactormodule)).

### Builder methods

| Method                            | Description                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `withDocumentModels(models)`      | Register document model modules                                          |
| `withUpgradeManifests(manifests)` | Register upgrade manifests for document model versioning                 |
| `withLogger(logger)`              | Set the logger (defaults to `ConsoleLogger`)                             |
| `withExecutorConfig(config)`      | Configure `maxConcurrency` and `jobTimeoutMs`                            |
| `withWriteCacheConfig(config)`    | Configure `maxDocuments` and `ringBufferSize` for the write cache        |
| `withMigrationStrategy(strategy)` | Set to `"auto"` to run database migrations on build                      |
| `withKysely(kysely)`              | Provide a custom Kysely database instance (defaults to in-memory PGlite) |
| `withQueue(queue)`                | Provide a custom job queue (defaults to `InMemoryQueue`)                 |
| `withEventBus(eventBus)`          | Provide a custom event bus                                               |
| `withExecutor(executor)`          | Provide a custom job executor manager                                    |
| `withReadModel(readModel)`        | Register an additional read model                                        |
| `withSync(syncBuilder)`           | Enable synchronization with remote reactors                              |
| `withChannelScheme(scheme)`       | Set the sync channel scheme                                              |
| `withFeatures(features)`          | Set feature flags                                                        |
| `withSignatureVerifier(verifier)` | Set a signature verification handler                                     |
| `withJwtHandler(handler)`         | Set a JWT handler for authentication                                     |
| `withDocumentModelLoader(loader)` | Set a custom document model loader                                       |
| `withSignalHandlers()`            | Register OS signal handlers for graceful shutdown                        |

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

// Children and parents (returns string[] of IDs, not full documents)
const childIds = await reactor.getChildren(parentId);
const parentIds = await reactor.getParents(childId);

// Search
const results = await reactor.find({ type: "powerhouse/todo-list" });

// Operations
const ops = await reactor.getOperations(docId);
```

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
const job = await reactor.addChildren(parentId, [childId1, childId2]);
const job = await reactor.removeChildren(parentId, [childId1]);
```

### Batch operations

`executeBatch` lets you submit multiple mutation jobs with dependency ordering. Jobs are executed in the order dictated by their `dependsOn` keys.

```typescript
const result = await reactor.executeBatch({
  jobs: [
    {
      key: "create-drive",
      documentId: driveId,
      scope: "global",
      branch: "main",
      actions: [createDriveAction],
      dependsOn: [],
    },
    {
      key: "add-document",
      documentId: driveId,
      scope: "global",
      branch: "main",
      actions: [addFileAction],
      dependsOn: ["create-drive"], // Waits for drive creation
    },
  ],
});

// result.jobs["create-drive"] and result.jobs["add-document"] are JobInfo objects
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

`ReactorBuilder.buildModule()` returns a `ReactorModule` that exposes all internal components:

```typescript
const module = await new ReactorBuilder()
  .withDocumentModels([todoListModule])
  .buildModule();

const { reactor, eventBus, processorManager, operationStore } = module;
```

### Available components

| Component              | Interface                     | Purpose                                                  |
| ---------------------- | ----------------------------- | -------------------------------------------------------- |
| `reactor`              | `IReactor`                    | The reactor instance                                     |
| `eventBus`             | `IEventBus`                   | Internal pub/sub for reactor events                      |
| `queue`                | `IQueue`                      | Job queue with per-document ordering                     |
| `jobTracker`           | `IJobTracker`                 | Tracks job lifecycle (PENDING through READ_READY/FAILED) |
| `executorManager`      | `IJobExecutorManager`         | Manages job executor instances                           |
| `operationStore`       | `IOperationStore`             | Append-only operation log                                |
| `keyframeStore`        | `IKeyframeStore`              | Document state snapshots                                 |
| `writeCache`           | `IWriteCache`                 | Write-path document cache                                |
| `operationIndex`       | `IOperationIndex`             | Global ordinal assignment                                |
| `documentView`         | `IDocumentView`               | Maintains document snapshots for reads                   |
| `documentIndexer`      | `IDocumentIndexer`            | Tracks document relationships (parent/child graph)       |
| `readModelCoordinator` | `IReadModelCoordinator`       | Dispatches operations to all read models                 |
| `subscriptionManager`  | `IReactorSubscriptionManager` | Manages document change subscriptions                    |
| `processorManager`     | `IProcessorManager`           | Routes operations to user-defined processors             |
| `database`             | `Kysely<Database>`            | The underlying database connection                       |
| `syncModule`           | `SyncModule \| undefined`     | Sync infrastructure (if configured)                      |

## Subscribing to the event bus

The `IEventBus` lets you listen to internal reactor events. Subscribers are called sequentially in registration order.

```typescript
import { ReactorEventTypes, SyncEventTypes } from "@powerhousedao/reactor";

// Listen for all completed jobs
const unsubscribe = module.eventBus.subscribe(
  ReactorEventTypes.JOB_READ_READY,
  (type, event) => {
    console.log("Job completed:", event.jobId);
    console.log("Operations:", event.operations.length);
  },
);

// Listen for sync failures
module.eventBus.subscribe(SyncEventTypes.SYNC_FAILED, (type, event) => {
  console.error("Sync failed for job:", event.jobId, event.errors);
});
```

See [Reactor event system](/academy/Architecture/WorkingWithTheReactor#reactor-event-system) for the full list of event types.

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
import type { IReadModel } from "@powerhousedao/reactor";

class MyCustomReadModel implements IReadModel {
  async indexOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      // Build your derived view
    }
  }
}

const reactor = await new ReactorBuilder()
  .withDocumentModels([todoListModule])
  .withReadModel(new MyCustomReadModel())
  .build();
```

Read models registered via `withReadModel()` run in the pre-ready phase — they complete before `JOB_READ_READY` fires. This is in contrast to processors (registered via `ProcessorManager`), which run in the post-ready phase.

## Example: integration test setup

A common use case for the low-level API is writing integration tests that need full control over the reactor lifecycle:

```typescript
import {
  ReactorBuilder,
  ConsoleLogger,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";

async function createTestReactor() {
  // Build with full access to internals
  const module = await new ReactorBuilder()
    .withDocumentModels([todoListModule])
    .withLogger(new ConsoleLogger())
    .buildModule();

  // Optionally wrap with a client for convenience
  const client = await new ReactorClientBuilder()
    .withReactorModule(module)
    .build();

  return { module, client };
}

// In your test
const { module, client } = await createTestReactor();

// Use client for high-level operations
const doc = await client.createEmpty("powerhouse/todo-list");

// Use module for low-level inspection
const ops = await module.operationStore.getSince(
  doc.header.id,
  "global",
  "main",
  0,
);
expect(ops.results.length).toBe(1);

// Cleanup
module.reactor.kill();
```
