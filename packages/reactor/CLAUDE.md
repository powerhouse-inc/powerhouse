# Reactor

The Reactor is a document management system that provides event-sourced storage, synchronization, and query capabilities for PHDocuments. It processes Actions through a job queue, persists Operations, and maintains read models for efficient querying.

## Architecture Overview

```
                              +-----------------+
                              |  ReactorClient  |
                              |  (ISigner)      |
                              +--------+--------+
                                       |
                    execute/create     |     get/find
                    +------------------+------------------+
                    |                                     |
                    v                                     v
            +-------+-------+                    +--------+--------+
            |    IQueue     |                    | IDocumentView   |
            | (Job Queue)   |                    | IDocumentIndexer|
            +-------+-------+                    +--------+--------+
                    |                                     ^
                    v                                     |
        +-----------+-----------+                         |
        | IJobExecutorManager   |                         |
        | +-------------------+ |                         |
        | | IJobExecutor (x N)| |                         |
        | +-------------------+ |        +----------------+
        +-----------+-----------+        |
                    |                    |
      +-------------+-------------+      |
      |                           |      |
      v                           v      |
+-----+------+           +--------+------+--------+
| IWriteCache|           | IOperationStore       |
+------------+           | (Operations + Index)  |
                         +--------+---------------+
                                  |
                                  v
                         +--------+--------+
                         |   IEventBus     |
                         | (JOB_WRITE_READY)
                         +--------+--------+
                                  |
              +-------------------+-------------------+
              |                                       |
              v                                       v
     +--------+--------+                    +---------+---------+
     |IReadModelCoordinator|                | ISyncManager      |
     | -> IDocumentView  |                  | -> IChannel       |
     | -> IDocumentIndexer|                 | (inbox/outbox)    |
     +-------------------+                  +-------------------+
```

## Core Concepts

### PHDocument
An event-sourced document with a header (id, type, slug, branch) and state. Documents are modified exclusively through Actions that produce Operations.

### Operation
An immutable record of a state change. Operations are stored sequentially per document/scope/branch with an index. The operation contains an `action` object plus metadata like `id`, `skip`, `timestampUtcMs`, `hash`, and optional `resultingState`. Scope and branch live in OperationContext, not on the operation.

### Job
A unit of work submitted to the queue. Jobs can be mutations (actions to apply) or loads (operations from sync). Jobs are tracked through PENDING -> RUNNING -> WRITE_READY -> READ_READY, and may transition to FAILED.

### Scope
Operations are partitioned by scope (e.g., "global", "local", "document"). Different scopes can have independent operation histories on the same document.

### Branch
Documents support branching for draft/published workflows. Operations are isolated per branch.

### ConsistencyToken
A token capturing operation coordinates, used for read-after-write consistency. Returned from mutations and passed to reads.

## Data Flow

### Write Path
1. Client calls `reactor.execute(docId, branch, actions)` or `reactor.create(doc)`
2. A Job is created and enqueued in IQueue
3. IJobExecutorManager pulls jobs and dispatches to IJobExecutor
4. Executor loads document state via IWriteCache (backed by IOperationStore)
5. Actions are reduced to produce Operations
6. Operations are written to IOperationStore atomically
7. IEventBus emits `JOB_WRITE_READY`
8. Job status updated to WRITE_READY, then READ_READY after indexing

### Read Path
1. Client calls `reactor.get(id)` or `reactor.find(search)` with optional ConsistencyToken
2. IDocumentView.waitForConsistency() blocks if token coordinates not yet indexed
3. Document snapshot returned from IDocumentView

### Sync Path
1. ISyncManager listens to `JOB_WRITE_READY` events
2. Operations matching remote filters are added to IChannel.outbox
3. Remote operations arrive in IChannel.inbox
4. Inbox items are loaded via `reactor.load()` as sync jobs
5. Cursors track sync progress per remote

## LLM Gotchas And Invariants

- IDocumentView requires `resultingState` in OperationContext and never rebuilds documents from operations.
- Operation scope and branch are stored in OperationContext, not on Operation.
- `IEventBus.emit()` is sequential and aggregates subscriber errors.
- Queue execution is serialized per document even across scopes and branches.
- Operation `ordinal` values come from `IOperationIndex`, not the operation store.
- `JOB_READ_READY` fires after pre-ready read models complete; post-ready models run after that.

## Key Components

| Component | Interface | Location | Purpose |
|-----------|-----------|----------|---------|
| Reactor | IReactor | `src/core/reactor.ts` | Main entry point, orchestrates all operations |
| ReactorBuilder | ReactorBuilder | `src/core/reactor-builder.ts` | Default wiring for storage, caches, read models, executors |
| Queue | IQueue | `src/queue/` | Job queue with per-document ordering |
| JobExecutor | IJobExecutor | `src/executor/` | Executes individual jobs |
| OperationStore | IOperationStore | `src/storage/` | Persists operations, handles revisions |
| DocumentView | IDocumentView | `src/read-models/document-view.ts` | Maintains document snapshots for reads |
| DocumentIndexer | IDocumentIndexer | `src/storage/kysely/document-indexer.ts` | Tracks document relationships |
| EventBus | IEventBus | `src/events/` | Pub/sub for internal events |
| SyncManager | ISyncManager | `src/sync/` | Orchestrates remote synchronization |
| Registry | IDocumentModelRegistry | `src/registry/` | Stores document model modules |

## Where to Start

- `src/core/reactor.ts`
- `src/core/reactor-builder.ts`
- `src/executor/simple-job-executor.ts`
- `src/read-models/coordinator.ts`
- `src/storage/interfaces.ts`
- `src/sync/sync-manager.ts`

## Common Tasks

### Adding a new document model
1. Create the model using document-model tools
2. Register via `ReactorBuilder.withDocumentModels([module])`

### Adding a new storage backend
1. Implement IOperationStore interface
2. Implement IKeyframeStore if snapshots needed
3. Wire via ReactorBuilder

### Modifying sync behavior
1. Create new IChannelFactory for transport (see `src/sync/channels/`)
2. Register with ISyncManager via `syncManager.add()`

### Adding a new read model
1. Implement IReadModel interface
2. Register with IReadModelCoordinator

## Search Filters

- `IReactor.find` uses `SearchFilter` from `src/shared/types.ts` (type, parentId, ids, slugs).
- Storage read models use `SearchFilter` from `src/storage/interfaces.ts` (documentType, identifiers, includeDeleted).

## Event Types

| Event | Payload | When |
|-------|---------|------|
| JOB_PENDING | { jobId, jobMeta } | Job enqueued |
| JOB_RUNNING | { jobId, jobMeta } | Job execution started |
| JOB_AVAILABLE | { documentId, scope, branch, jobId } | Queue has work (queue event) |
| JOB_WRITE_READY | { jobId, operations, jobMeta } | Write phase complete |
| JOB_READ_READY | { jobId, operations } | Read models indexed |
| JOB_FAILED | { jobId, error, job } | Job failed |
| SYNC_PENDING | { jobId, syncOperationCount, remoteNames } | Sync operations queued |
| SYNC_SUCCEEDED | { jobId, syncOperationCount } | All sync operations succeeded |
| SYNC_FAILED | { jobId, successCount, failureCount, errors } | One or more sync operations failed |

---

## Module Conventions

- Use ESM import paths with `.js` extensions.

## Coding Guidelines

- Before writing tests, run `pnpm vitest list` to understand test coverage.

- Always use pnpm, never use npm or yarn.
- Avoid adding new inline comments. Prefer comments on function and class declarations when they add clarity.
- Do not add comments to interface implementations unless the behavior is non-obvious.
- When making changes to a package, but running tests in a different package, always run `pnpm tsc --build` in the package you are working on first.
- After making changes, run relevant tests or ask before running `pnpm build && pnpm lint`.

- Avoid `any`. Use `unknown` only with runtime checks, and prefer named types over ad-hoc utility types.
- Prefer named types and classical OOP over Pick, Omit, etc.
- When handling async operations, do not put more than one `await` inside a single try/catch block. Use separate try/catch blocks for each await so that errors can be made explicit.
- When working on a class implementation, always group public functions together, and private functions together. Public functions should come first.
- Prefer required fields and parameters over optional fields and parameters.
- Prefer default values, empty implementations, etc. instead of using null or undefined.
- Never use emojis in comments, code, or documentation.
- If you are working from a checklist or implementation plan, always check the boxes as you complete the tasks.
