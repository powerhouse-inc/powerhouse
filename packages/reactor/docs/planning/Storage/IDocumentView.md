# IDocumentView

### Summary

TLDR: Think of this as a smart, materialized view of the command store.

- The intention is that the Reactor listens to `IEventBus` for command store updates, which are passed here to trigger the view to rebuild / update pre-joined, denormalized views for application reads.
- Reads from `IOperationStore` as needed.
- Provides an API for `IReactor` or external systems to read document data from.
- **Handles cross-scope concerns**: Reconstructs document headers by aggregating information from operations across multiple scopes (header, document, global, local, etc.). Headers contain metadata like revision tracking and lastModified timestamps that span all scopes.
- Implements the `waitForConsistency` contract so read calls can block until the view has indexed the coordinates highlighted by a `ConsistencyToken` (see [Shared Interfaces](../Shared/interface.md)).

### Implementations

Only one implementation is provided: `KyselyDocumentIndexer`. This implementation uses Kysely on top of PGLite.

### Snapshots + Cache Invalidation

- The document view keeps an LRU cache of `(document id, ViewFilter)` tuples.
- The cache is invalidated when it receives an operation that affects a related `(document id, ViewFilter)` tuple.
- Snapshots are then re-computed and stored in the cache.

### Eventual Consistency

The `IDocumentView` must ensure that it has the latest information. It may be the case that the system crashed or shutdown after operations were generated, but before the `IDocumentView` was able to process the operations. In this case, the `IOperationStore` would have operations that have not yet been indexed.

The view stores the last operation id it has processed synchronously in memory and also lazily updates the `ViewState` table.

Read models share a [Consistency Tracker](../Shared/consistency-tracker.md) to
record the latest `(documentId, scope, branch)` index. `waitForConsistency`
consults this tracker before deciding whether to block the caller.

### Handling Reshuffles / `skip` Values

- When a load triggers a reshuffle, the regenerated batch’s first operation includes a `skip` value to rewind the log; prior operations remain immutable, and conflict-free batches omit the skip entirely.
- Whenever `IDocumentView` indexes an operation whose `skip` value is greater than zero, it treats this as a signal to rebuild the affected document’s state from the base revision referenced by that skip count.
- The view can issue `IOperationStore.getSinceId` with the id of the operation carrying the skip (or any earlier ancestor) and re-run `indexOperations` on that slice to reconstruct the state deterministically.
- This keeps the view self-sufficient: no snapshots are pushed from the write side—only operations and their metadata.

#### Case 1: At Runtime

If the document view receives an operation that has a later id than the last operation it has processed, it must catch up to the latest operation by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

this.indexOperations(operations);
```

#### Case 2: At Startup

Before any operations have been processed, the document view must ensure that it has the latest operation information. This can be done by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

this.indexOperations(operations);
```

### Dependencies

- [IDocumentIndexer](../Storage/IDocumentIndexer.md)

### Soft Delete Behavior

The `IDocumentView` implements soft delete semantics for deleted documents:

- **DELETE_DOCUMENT Operations**: When indexing a DELETE_DOCUMENT operation, the operation updates the document scope state (setting `document.state.document.isDeleted = true`), and the snapshot is updated to reflect this
- **No Special Validation**: IDocumentView simply applies operations as they arrive - operations have already been validated and reshuffled by the write side (IJobExecutor)
- **State-Derived Fields**: The `isDeleted` and `deletedAt` fields in DocumentSnapshot are derived from the document scope's state (`document.state.document.isDeleted` and `document.state.document.deletedAt`)
- **Query Filtering**: By default, all queries filter out deleted documents (`isDeleted = false`)
- **Explicit Access**: Deleted documents can be included in search results by setting `includeDeleted: true` in the search filter
- **Error Handling**: Single-document retrieval methods (`getHeader`, etc.) throw `DocumentDeletedError` when attempting to access deleted documents
- **Audit Support**: Deleted documents and all their operations remain in the database for audit trails, compliance, and potential recovery

```typescript
class DocumentDeletedError extends Error {
  constructor(
    public documentId: string,
    public deletedAt: Date | null
  ) {
    super(`Document ${documentId} was deleted at ${deletedAt?.toISOString()}`);
    this.name = "DocumentDeletedError";
  }
}
```

### Consistency Guarantees

All read methods accept an optional `consistencyToken` parameter to provide read-after-write consistency guarantees. When a consistency token is provided:

1. The method internally calls `waitForConsistency(token)` before executing the query
2. The call blocks until all coordinates in the token have been indexed by the view
3. This ensures the query will see all effects of the write operations that produced the token

**Usage Pattern:**
```typescript
const queuedJob = await reactor.mutate(documentId, "main", operations);
const completedJob = await reactor.getJobStatus(queuedJob.id); // poll until COMPLETED
const doc = await documentView.get(documentId, view, completedJob.consistencyToken);

const loadQueued = await reactor.load(documentId, "main", importedOperations);
const loadCompleted = await reactor.getJobStatus(loadQueued.id); // same wait
const loadedDoc = await documentView.get(documentId, view, loadCompleted.consistencyToken);
```

This pattern guarantees that the read will see the effects of the write, even if the view is catching up asynchronously.

### Interface

```tsx
interface IDocumentView {
  /**
   * Initializes the view.
   */
  init(): Promise<void>;

  /**
   * Indexes a list of operations.
   */
  indexOperations(operations: Operation[]): Promise<void>;

  /**
   * Retrieves a document header by reconstructing it from operations across all scopes.
   *
   * Headers contain cross-scope metadata (revision tracking, lastModified timestamps)
   * that require aggregating information from multiple scopes, making this a
   * view-layer concern rather than an operation store concern.
   *
   * @param documentId - The document id
   * @param branch - The branch name
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The reconstructed document header
   */
  getHeader(
    documentId: string,
    branch: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader>;

  /**
   * Resolves a list of ids from a list of slugs.
   *
   * @param slugs - Required, the list of document slugs
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of slugs
   */
  resolveIds(
    slugs: string[],
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Resolves a list of slugs from a list of ids.
   *
   * @param ids - Required, the list of document ids
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of ids
   */
  resolveSlugs(
    ids: string[],
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  exists(
    documentIds: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean[]>;

  /**
   * Returns the document with the given id.
   *
   * @param documentId - The id of the document to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  get<TDocument extends PHDocument>(
    documentId: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument>;

  /**
   * Returns the documents with the given ids.
   *
   * @param documentIds - The list of document ids to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument[]>;

  /**
   * Returns the documents with the given slugs.
   *
   * @param slugs - The list of document slugs to get.
   * @param view - Optional filter containing branch and scopes information
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   */
  getManyBySlugs<TDocument extends PHDocument>(
    slugs: string[],
    view: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument[]>;

  /**
   * Filters documents by criteria and returns a list of them
   *
   * @param search - Search filter options (type, parentId, identifiers, includeDeleted)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param consistencyToken - Optional token for read-after-write consistency
   * @param signal - Optional abort signal to cancel the request
   * @returns List of documents matching criteria and pagination cursor
   */
  find<TDocument extends PHDocument>(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<TDocument>>;

  /**
   * Blocks until the view has processed the coordinates referenced by the
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

type SearchFilter = {
  documentType?: string;
  parentId?: string;
  identifiers?: Record<string, any>;

  /**
   * Whether to include deleted documents in search results.
   * Defaults to false (excludes deleted documents).
   * Set to true for audit/admin tools that need to see deleted documents.
   */
  includeDeleted?: boolean;
}
```

### Schema

The `IDocumentView` is a smart, materialized view of the command store.

```prisma
model ViewState {
  lastOperationId Int @id
  lastOperationTimestamp DateTime @default(now())
}

model DocumentSnapshot {
  id                String   @id @default(cuid())

  // Document identity
  documentId        String
  slug              String?
  name              String?

  // View filtering
  scope             String
  branch            String

  // Document state
  content           Json     // The materialized document state
  documentType      String   // Document type for filtering

  // Cache invalidation & staleness detection
  lastOperationIndex Int     // Last operation index this snapshot includes
  lastOperationHash  String  // Hash of the last operation for integrity
  lastUpdatedAt     DateTime @default(now()) @updatedAt
  snapshotVersion   Int      @default(1) // Incremented on each rebuild

  // Metadata for search/filtering
  identifiers       Json?    // Custom identifiers for find() queries
  metadata          Json?    // Additional searchable metadata

  // Soft delete support (derived from document state)
  isDeleted         Boolean  @default(false)  // From document.state.document.isDeleted
  deletedAt         DateTime?                 // From document.state.document.deletedAt

  // Indexes for efficient queries
  @@unique([documentId, scope, branch]) // One snapshot per document+scope+branch
  @@index([slug, scope, branch]) // Fast slug resolution
  @@index([documentType, scope, branch]) // Type filtering
  @@index([lastUpdatedAt]) // Staleness detection
  @@index([isDeleted]) // Active documents only
  @@index([documentId, lastOperationIndex]) // Staleness check by operation index
}

model SlugMapping {
  slug        String   @id
  documentId  String
  scope       String
  branch      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([documentId, scope, branch])
  @@index([documentId])
}
```
