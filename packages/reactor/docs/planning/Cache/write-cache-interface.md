# IWriteCache Interface

```tsx
// Import from other interfaces
import type { IOperationStore } from '../Storage/IOperationStore';
import type { IDocumentModelRegistry } from '../Registry/IDocumentModelRegistry';
import type { PHDocument } from 'document-model';

/**
 * Configuration options for the write cache
 */
export type WriteCacheConfig = {
  /** Maximum number of document streams to cache (LRU eviction) */
  maxDocuments?: number;

  /** Number of snapshots to keep in each document's ring buffer */
  ringBufferSize?: number;

  /** Interval for persisting keyframes (e.g., every 10 revisions) */
  keyframeInterval?: number;
};

export interface IWriteCache {
  /**
   * Retrieves or builds the document at the specified revision.
   * If targetRevision is not provided, retrieves the latest state.
   *
   * Cache miss handling:
   * - Cold miss (no cached document): Checks IKeyframeStore for nearest keyframe using indexed
   *   SQL query (O(log n)), then streams operations from keyframe revision (or 0 if no keyframe)
   *   using getSince with cursor-based paging and replays them through reducer
   * - Warm miss (has older revision): Loads only operations since cached revision
   *   using getSince(cachedRevision) and applies them incrementally to the cached document
   *
   * @param documentId - The document identifier
   * @param documentType - The document type (needed for reducer lookup on cache miss)
   * @param scope - Operation scope
   * @param branch - Branch name
   * @param targetRevision - The exact revision to retrieve (optional, defaults to latest)
   * @param signal - Optional abort signal
   * @returns The complete document at the specified revision
   */
  getState(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    targetRevision?: number,
    signal?: AbortSignal
  ): Promise<PHDocument>;

  /**
   * Stores a document snapshot in the cache at the specified revision.
   *
   * @param documentId - The document identifier
   * @param documentType - The document type
   * @param scope - Operation scope
   * @param branch - Branch name
   * @param revision - The revision this document represents
   * @param document - The complete document to cache
   */
  putState(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument
  ): void;

  /**
   * Invalidates (removes) cached entries for a document stream.
   * If only documentId is provided, invalidates all scopes and branches for that document.
   * If scope is provided, invalidates all branches for that document and scope.
   * If all parameters provided, invalidates the specific stream.
   *
   * @param documentId - The document identifier
   * @param scope - Optional scope to narrow invalidation
   * @param branch - Optional branch to narrow invalidation
   * @returns Number of ring buffers evicted
   */
  invalidate(documentId: string, scope?: string, branch?: string): number;

  /**
   * Clears all cached data.
   */
  clear(): void;

  /**
   * Performs startup initialization.
   */
  startup(): Promise<void>;

  /**
   * Performs graceful shutdown.
   */
  shutdown(): Promise<void>;
}
```

### Usage

```tsx
// Initialize cache with configuration and dependencies
const cache = new KyselyWriteCache(
  keyframeStore,     // IKeyframeStore for persisting/retrieving keyframes
  operationStore,    // IOperationStore for loading operations on cache miss
  registry,          // IDocumentModelRegistry for accessing reducers on cache miss
  {
    maxDocuments: 1000,    // Cache up to 1000 document streams
    ringBufferSize: 10,    // Keep 10 snapshots per document stream
    keyframeInterval: 10   // Persist keyframe every 10 revisions
  }
);

await cache.startup();

// In job executor: Get document at specific revision (or latest if not specified)
const document = await cache.getState(
  documentId,
  documentType,
  scope,
  branch,
  targetRevision  // Optional - omit to get latest
);

// Apply operations starting from cached document
const module = registry.getModule(documentType);
const updatedDocument = module.reducer(document, action);

// Store the resulting document in cache for future executions
cache.putState(documentId, documentType, scope, branch, finalRevision, updatedDocument);

// Invalidate cache when document is deleted or significant changes occur
cache.invalidate(documentId);

// Or invalidate specific scope
cache.invalidate(documentId, 'global');

// Or invalidate specific stream
cache.invalidate(documentId, 'global', 'main');
```

### Links

* [Overview](./write-cache.md) - Detailed architectural overview
* [Operation Index](./operation-index.md) - Related indexing system for operations
