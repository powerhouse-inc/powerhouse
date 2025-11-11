# IDocumentIndexer

### Summary

- The Reactor listens for Operations updates from the event bus and passes them here to index relationships between documents.
- Indexes relationships between documents.
- Forms a graph of documents and relationships.
- Generally just needs to listen to the System Stream.
- Exposes `waitForConsistency` so callers can block until specific coordinates from a `ConsistencyToken` are visible (see [Shared Interfaces](../Shared/interface.md)).

### Implementations

Only one implementation is provided: `KyselyDocumentIndexer`. This implementation uses Kysely on top of PGLite.

### Eventual Consistency

The `IDocumentIndexer` must ensure that is has the lastest operation information. It may be the case that the system crashed or shutdown after operations were applied, but before the `IDocumentIndexer` was able to process the operations. In this case, the `IOperationStore` would have operations that have not yet been indexed.

The indexer stores the last operation id it has processed synchronously in memory and also lazily updates the `IndexerState` table.

To support read-after-write guarantees, the indexer shares the
[Consistency Tracker](../Shared/consistency-tracker.md) with other read models.
It updates the tracker after committing relationship changes and consults it
inside `waitForConsistency` to decide whether callers need to block.

### Handling Reshuffles / `skip` Values

- When a load conflict forces a reshuffle, the regenerated operations’ first entry carries a `skip` value to rewind the log; conflict-free imports append operations without any skip metadata, and earlier log entries stay immutable.
- When the indexer processes an operation with `skip > 0`, it uses that signal to locate the base revision and replays operations starting from that point via `IOperationStore.getSinceId` (or another suitable range query).
- Reprocessing that slice allows the relationship graph to drop superseded edges and apply the regenerated operations deterministically without needing additional state from the write side.

#### Case 1: At Runtime

If the document indexer receives an operation that has a later id than the last operation it has processed, it must catch up to the latest operation by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

this.indexOperations(operations);
```

#### Case 2: At Startup

Before any operations have been processed, the document indexer must ensure that it has the latest operation information. This can be done by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

this.indexOperations(operations);
```

### Dependencies

- [IOperationStore](IOperationStore.md)

### Consistency Guarantees

All query methods accept an optional `consistencyToken` parameter to provide read-after-write consistency guarantees. When a consistency token is provided:

1. The method internally calls `waitForConsistency(token)` before executing the query
2. The call blocks until all coordinates in the token have been indexed
3. This ensures the query will see all effects of the write operations that produced the token

**Usage Pattern:**
```typescript
const queuedJob = await reactor.addChildren(parentId, childIds);
const completedJob = await reactor.getJobStatus(queuedJob.id); // ensure COMPLETED
const path = await documentIndexer.findPath(parentId, childId, undefined, completedJob.consistencyToken);

const loadQueued = await reactor.load(parentId, "main", importedOperations);
const loadCompleted = await reactor.getJobStatus(loadQueued.id);
await documentIndexer.waitForConsistency(loadCompleted.consistencyToken);
```

This pattern guarantees that the relationship query will see the effects of the write, even if the indexer is catching up asynchronously.

### Interface

```tsx
interface DocumentRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface IDocumentGraph {
  get all(): string[];

  /**
   * Traverses the graph using breadth-first or depth-first search.
   *
   * @param startDocumentId - The ID of the starting document.
   * @param strategy - The traversal strategy: 'breadth-first' or 'depth-first'.
   * @param visitor - Function called for each visited document.
   *
   * @returns Array of document IDs in traversal order.
   */
  traverse(
    startDocumentId: string,
    strategy: "breadth-first" | "depth-first",
    visitor?: (documentId: string) => void,
  ): string[];

  /**
   * Aggregates the graph into a single value by combining parent and child values.
   * Similar to Array.reduce, but for hierarchical graph structures.
   *
   * @param reducer - Function that combines a parent value with a child value.
   * @param initialValue - The initial value for the aggregation.
   * @param rootDocumentId - The root document to start aggregation from (optional, uses first root if not provided).
   *
   * @returns The aggregated result.
   */
  aggregate<T>(
    reducer: (
      parentValue: T,
      childDocumentId: string,
      parentDocumentId?: string,
    ) => T,
    initialValue: T,
    rootDocumentId?: string,
  ): T;
}

interface IDocumentIndexer {
  /**
   * Initializes the indexer.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations.
   */
  indexOperations(operations: Operation[]): Promise<void>;

  /**
   * Retrieves all relationships between two documents.
   *
   * @param a - The ID of the first document.
   * @param b - The ID of the second document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The relationships between the two documents.
   */
  getUndirectedRelationships(
    a: string,
    b: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships from a document to another document.
   *
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The relationships from the document to the other document.
   */
  getDirectedRelationships(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships from a document.
   *
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The relationships from the document.
   */
  getOutgoing(
    documentId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships into a document.
   *
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The relationships into the document.
   */
  getIncoming(
    documentId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]>;

  /**
   * Finds a path between two documents.
   *
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The path between the two documents, or null if no path exists.
   */
  findPath(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[] | null>;

  /**
   * Finds the ancestor graph of a document.
   *
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns The ancestor graph of the document.
   */
  findAncestors(
    documentId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<IDocumentGraph>;

  /**
   * Checks if a relationship exists between two documents.
   *
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   *
   * @returns True if a relationship exists, false otherwise.
   */
  hasRelationship(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean>;

  /**
   * Retrieves all possible relationship types.
   *
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getRelationshipTypes(
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Blocks until the indexer has processed the coordinates referenced by the
   * provided consistency token.
   *
   * @param token - Consistency token derived from the originating job
   * @param timeoutMs - Optional timeout window in milliseconds
   * @param signal - Optional abort signal to cancel the wait
   */
  waitForConsistency(
    token: ConsistencyToken,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void>;
}
```

### Schema

```prisma

model IndexerState {
  lastOperationId Int @id
  lastOperationTimestamp DateTime @default(now())
}

model Document {
  id           String @id

  // Outgoing relationships from this document
  outgoing     DocumentRelationship[] @relation("SourceDocument")

  // Incoming relationships to this document
  incoming     DocumentRelationship[] @relation("TargetDocument")

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model DocumentRelationship {
  id              String @id @default(cuid())

  sourceId        String
  targetId        String
  relationshipType String // e.g., "parent-child", "references", "depends-on", etc.
  metadata        Json?  // Additional metadata about the relationship
  weight          Float? // Optional weight for weighted relationships

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  source          Document @relation("SourceDocument", fields: [sourceId], references: [id])
  target          Document @relation("TargetDocument", fields: [targetId], references: [id])

  // Prevent duplicate relationships of the same type between the same documents
  @@unique([sourceId, targetId, relationshipType])
  @@index([sourceId])
  @@index([targetId])
  @@index([relationshipType])
}
```
