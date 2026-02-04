# Read Model Coordinator

## Overview

The `ReadModelCoordinator` is responsible for keeping read models synchronized with the operation store. When operations are written to the operation store, the coordinator ensures all read models (DocumentView, DocumentIndexer, etc.) are updated in parallel.

## Architecture

### Components

```
SimpleJobExecutor
    |
    └─> Writes operations to IOperationStore
        └─> Emits OPERATION_WRITTEN event
            |
            └─> ReadModelCoordinator (subscriber)
                |
                ├─> KyselyDocumentView.indexOperations()
                |       └─> Updates DocumentSnapshot table
                |       └─> Updates documentViewConsistencyTracker
                |
                └─> KyselyDocumentIndexer.indexOperations()
                        └─> Updates DocumentRelationship table
                        └─> Updates documentIndexerConsistencyTracker
                |
                └─> Emits OPERATIONS_READY event (after all complete)
```

### Read Models

The system currently has two read models:

1. **KyselyDocumentView** (`src/read-models/document-view.ts`)
   - Maintains document snapshots for efficient queries
   - Powers `reactor.get()`, `reactor.find()`, etc.
   - Updates `documentViewConsistencyTracker`

2. **KyselyDocumentIndexer** (`src/storage/kysely/document-indexer.ts`)
   - Maintains document relationship graph
   - Powers relationship queries (`getChildren`, `getParents`, etc.)
   - Updates `documentIndexerConsistencyTracker`

## Event Flow

### 1. OPERATION_WRITTEN Event

**When**: After operations are successfully written to the operation store

**Emitted by**: `SimpleJobExecutor.executeJob()` (line 106)

**Payload**:
```typescript
type OperationWrittenEvent = {
  operations: OperationWithContext[];
};
```

**Subscribers**:
- `SyncManager` - Routes operations to remote instances
- `ReadModelCoordinator` - Updates all read models

### 2. OPERATIONS_READY Event

**When**: After all read models have finished processing operations

**Emitted by**: `ReadModelCoordinator.handleOperationWritten()` (after `Promise.all()` completes)

**Payload**:
```typescript
type OperationsReadyEvent = {
  operations: OperationWithContext[];
};
```

**Guarantees**:
- All read models have completed `indexOperations()`
- All consistency trackers have been updated
- Queries without consistency tokens will see the updated data

**Use Cases**:
- **Test synchronization**: Wait for read models to be ready before assertions
- **Observability**: Measure read model update latency
- **Event-driven workflows**: Trigger downstream processes after data is queryable

## Implementation

### ReadModelCoordinator Class

Location: `src/read-models/coordinator.ts`

```typescript
export class ReadModelCoordinator implements IReadModelCoordinator {
  constructor(
    private eventBus: IEventBus,
    private readModels: IReadModel[],
  ) {}

  start(): void {
    this.unsubscribe = this.eventBus.subscribe(
      OperationEventTypes.OPERATION_WRITTEN,
      async (type, event: OperationWrittenEvent) => {
        await this.handleOperationWritten(event);
      },
    );
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private async handleOperationWritten(
    event: OperationWrittenEvent,
  ): Promise<void> {
    // Update all read models in parallel
    await Promise.all(
      this.readModels.map((readModel) =>
        readModel.indexOperations(event.operations),
      ),
    );

    // Emit OPERATIONS_READY after all complete
    this.eventBus
      .emit(OperationEventTypes.OPERATIONS_READY, {
        operations: event.operations,
      })
      .catch(() => {
        // Fire-and-forget: Don't block if no subscribers
      });
  }
}
```

### Parallel Execution

Read models are updated **in parallel** using `Promise.all()`. This means:

- Both DocumentView and DocumentIndexer process simultaneously
- Faster overall update time
- If one fails, both fail (atomic boundary)
- The `OPERATIONS_READY` event fires only after **both** complete

### Error Handling

- If any read model throws during `indexOperations()`, the error propagates through the EventBus
- The EventBus collects all errors and throws `EventBusAggregateError`
- `OPERATIONS_READY` is **not emitted** if read models fail
- This ensures the event only fires when all read models successfully updated

## Usage in Tests

### Example: Two-Reactor Sync Test

```typescript
import {
  OperationEventTypes,
  type OperationsReadyEvent,
} from "../../src/events/types.js";

// Helper function
async function waitForOperationsReady(
  reactor: IReactor,
  documentId: string,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for operations ready`));
    }, timeoutMs);

    const unsubscribe = reactor.eventBus.subscribe(
      OperationEventTypes.OPERATIONS_READY,
      (type, event: OperationsReadyEvent) => {
        const hasDocument = event.operations.some(
          (op) => op.context.documentId === documentId,
        );

        if (hasDocument) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      },
    );
  });
}

// In test
it("should sync operations between reactors", async () => {
  // Create document in ReactorA
  const jobInfo = await reactorA.create(document);
  await waitForJobCompletion(reactorA, jobInfo.id);

  // Wait for operations to sync to ReactorB and read models to update
  await waitForOperationsReady(reactorB, document.header.id);

  // Now queries will return updated data
  const docB = await reactorB.get(document.header.id, { branch: "main" });
  expect(docB.document).toEqual(document);
});
```

### Example: Observability

```typescript
// Track read model latency
reactor.eventBus.subscribe(
  OperationEventTypes.OPERATION_WRITTEN,
  (type, event) => {
    const startTime = Date.now();

    reactor.eventBus.subscribe(
      OperationEventTypes.OPERATIONS_READY,
      (type, readyEvent) => {
        if (readyEvent.operations === event.operations) {
          const latency = Date.now() - startTime;
          console.log(`Read models updated in ${latency}ms`);
        }
      },
    );
  },
);
```

## Consistency Tokens vs OPERATIONS_READY

### When to Use Consistency Tokens

Use consistency tokens in production code:

```typescript
const jobInfo = await reactor.create(document);
const completed = await awaiter.waitForJob(jobInfo.id);

// Query with token - guarantees read-after-write consistency
const result = await reactor.get(
  documentId,
  undefined,
  completed.consistencyToken,  // <-- Token ensures consistency
);
```

**Benefits**:
- Works across network boundaries
- Handles distributed read model lag
- Precise control over which operations must be visible
- Can merge multiple tokens for complex queries

### When to Use OPERATIONS_READY Event

Use the event in test code:

```typescript
// Subscribe to event
await waitForOperationsReady(reactor, documentId);

// Query without token - operations are guaranteed to be ready
const result = await reactor.get(documentId);
```

**Benefits**:
- Simpler than consistency tokens (no need to track jobs)
- Event-driven (natural async/await pattern)
- Deterministic (know exactly when read models are done)
- Better test performance (no polling)

**Limitations**:
- Only works within same process (requires shared EventBus)
- Coarser granularity (all operations ready, not specific subset)
- Not suitable for production where read models may lag indefinitely

## Best Practices

1. **Production**: Use consistency tokens for read-after-write guarantees
2. **Tests**: Use OPERATIONS_READY event for deterministic ordering
3. **Observability**: Subscribe to both events to measure latency
4. **Error Handling**: If read models fail, OPERATIONS_READY won't fire - check for errors in event bus
5. **Cleanup**: Always unsubscribe from events to prevent memory leaks
