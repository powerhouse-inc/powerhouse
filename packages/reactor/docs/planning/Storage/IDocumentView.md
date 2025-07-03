# IDocumentView

### Summary

TLDR: Think of this as a smart, materialized view of the operations store.

- Listens to `IEventBus` for operation store updates, which trigger it to rebuild / update pre-joined, denormalized views for application reads.
- Reads from `IOperationStore` as needed.
- Provides an API for `IReactor` or external systems to read document data from.

### Snapshots + Cache Invalidation

- The document view keeps an LRU cache of `(document id, ViewFilter)` tuples.
- The cache is invalidated when it receives a `DocumentChangeEvent` from the `IEventBus` that affects a related `(document id, ViewFilter)` tuple.
- Snapshots are then re-computed and stored in the cache.

### Eventual Consistency

The `IDocumentView` must ensure that is has the lastest operation information. It may be the case that the system crashed or shutdown after operations were applied, but before the `IDocumentView` was able to process the operations. In this case, the `IOperationStore` would have operations that have not yet been indexed.

The view stores the last operation id it has processed synchronously in memory and also lazily updates the `ViewState` table.

#### Case 1: At Runtime

If the document view receives an event for an operation that has a later id than the last operation it has processed, it must catch up to the latest operation by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

for (const operation of operations) {
  this.indexOperation(operation);
}
```

#### Case 2: At Startup

Before any operation events have fired, the document view must ensure that it has the latest operation information. This can be done by querying the `IOperationStore`for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

for (const operation of operations) {
  this.indexOperation(operation);
}
```

### Dependencies

- [IOperationStore](../Reactor/Interfaces/IOperationStore.md)
- [IDocumentIndexer](../Reactor/Interfaces/IDocumentIndexer.md)

### Interface

```tsx
interface IDocumentView {
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

  /**
   * Returns the children of the given documents.
   *
   * @param parentIds - The list of parent document ids.
   * @param signal - Optional abort signal to cancel the request
   */
  getChildren(parentIds: string[], signal?: AbortSignal): Promise<string[][]>;

  /**
   * Returns the parents of the given documents.
   *
   * @param childIds - The list of child document ids.
   * @param signal - Optional abort signal to cancel the request
   */
  getParents(childIds: string[], signal?: AbortSignal): Promise<string[][]>;
}
```

### Schema

The `IDocumentView` is a smart, materialized view of the operations store.

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
  
  // Hierarchy (for getChildren/getParents - not general relationships)
  parentId          String?
  
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
  
  // Relations
  parent            DocumentSnapshot? @relation("DocumentHierarchy", fields: [parentId], references: [documentId])
  children          DocumentSnapshot[] @relation("DocumentHierarchy")
  
  // Indexes for efficient queries
  @@unique([documentId, scope, branch]) // One snapshot per document+scope+branch
  @@index([slug, scope, branch]) // Fast slug resolution
  @@index([documentType, scope, branch]) // Type filtering
  @@index([parentId]) // Hierarchy queries
  @@index([lastUpdatedAt]) // Staleness detection
  @@index([isDeleted]) // Active documents only
  @@index([documentId, lastOperationIndex]) // Staleness check by operation index
}

model DocumentViewCache {
  id              String   @id @default(cuid())
  
  // Cache key components
  documentId      String
  viewFilterHash  String   // Hash of the ViewFilter for this cached entry
  
  // Cache data
  cachedResult    Json     // The cached query result
  resultType      String   // Type of cached result (e.g., "document", "children", "search")
  
  // Cache invalidation
  lastValidAt     DateTime @default(now())
  expiresAt       DateTime? // Optional TTL
  hitCount        Int      @default(0)
  
  // LRU tracking
  lastAccessedAt  DateTime @default(now())
  
  @@unique([documentId, viewFilterHash, resultType])
  @@index([lastAccessedAt]) // LRU eviction
  @@index([expiresAt]) // TTL cleanup
  @@index([documentId]) // Invalidation by document
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
