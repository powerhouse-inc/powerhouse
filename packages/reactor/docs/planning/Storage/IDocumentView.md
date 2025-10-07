# IDocumentView

### Summary

TLDR: Think of this as a smart, materialized view of the command store.

- The intention is that the Reactor listens to `IEventBus` for command store updates, which are passed here to trigger the view to rebuild / update pre-joined, denormalized views for application reads.
- Reads from `IOperationStore` as needed.
- Provides an API for `IReactor` or external systems to read document data from.
- **Handles cross-scope concerns**: Reconstructs document headers by aggregating information from operations across multiple scopes (header, document, global, local, etc.). Headers contain metadata like revision tracking and lastModified timestamps that span all scopes.

### Implementations

Only one implementation is provided: `KyselyDocumentIndexer`. This implementation uses Kysely on top of PGLite.

### Snapshots + Cache Invalidation

- The document view keeps an LRU cache of `(document id, ViewFilter)` tuples.
- The cache is invalidated when it receives an operation that affects a related `(document id, ViewFilter)` tuple.
- Snapshots are then re-computed and stored in the cache.

### Eventual Consistency

The `IDocumentView` must ensure that it has the latest information. It may be the case that the system crashed or shutdown after operations were generated, but before the `IDocumentView` was able to process the operations. In this case, the `IOperationStore` would have operations that have not yet been indexed.

The view stores the last operation id it has processed synchronously in memory and also lazily updates the `ViewState` table.

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
   * @param signal - Optional abort signal to cancel the request
   * @returns The reconstructed document header
   */
  getHeader(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader>;

  /**
   * Resolves a list of ids from a list of slugs.
   *
   * @param slugs - Required, the list of document slugs
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of slugs
   */
  resolveIds(
    slugs: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Resolves a list of slugs from a list of ids.
   *
   * @param ids - Required, the list of document ids
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of ids
   */
  resolveSlugs(
    ids: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string[]>;

  /**
   * Returns true if and only if the documents exist.
   *
   * @param documentIds - The list of document ids to check.
   * @param signal - Optional abort signal to cancel the request
   */
  exists(documentIds: string[], signal?: AbortSignal): Promise<boolean[]>;

  /**
   * Returns the documents with the given ids.
   *
   * @param documentIds - The list of document ids to get.
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   */
  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument[]>;

  /**
   * Returns the documents with the given slugs.
   *
   * @param slugs - The list of document slugs to get.
   * @param view - Optional filter containing branch and scopes information
   * @param signal - Optional abort signal to cancel the request
   */
  getManyBySlugs<TDocument extends PHDocument>(
    slugs: string[],
    view: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument[]>;

  /**
   * Filters documents by criteria and returns a list of them
   *
   * @param search - Search filter options (type, parentId, identifiers)
   * @param view - Optional filter containing branch and scopes information
   * @param paging - Optional pagination options
   * @param signal - Optional abort signal to cancel the request
   * @returns List of documents matching criteria and pagination cursor
   */
  find<TDocument extends PHDocument>(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<TDocument>>;
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

  // Soft delete support
  isDeleted         Boolean  @default(false)
  deletedAt         DateTime?

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
