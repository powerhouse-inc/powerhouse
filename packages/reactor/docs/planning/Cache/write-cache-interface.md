# IWriteCache Interface

### Summary

The `IWriteCache` interface defines an in-memory LRU cache that stores ring buffers of `PHDocument` snapshots. The cache requires `IOperationStore` for loading operations on cache misses and `IDocumentModelRegistry` for accessing reducers to rebuild document state. The cache handles all retrieval, storage, and eviction automatically through the `getState()` method. When the job executor requests a document at a specific revision (or latest if not specified), the cache either returns a cached snapshot or rebuilds the document from operations and caches it automatically. Each document stream maintains a ring buffer of recent snapshots, and entire ring buffers are evicted as a unit when the LRU policy triggers.

### Interface

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
};

/**
 * Statistics about cache performance
 */
export type CacheStats = {
  /** Total number of getState() calls */
  totalGets: number;

  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Number of cold misses (no cached document for stream) */
  coldMisses: number;

  /** Number of warm misses (had older revision, applied incremental operations) */
  warmMisses: number;

  /** Hit rate (hits / totalGets) */
  hitRate: number;

  /** Current number of cached document streams */
  cachedDocuments: number;

  /** Total number of cached snapshots across all ring buffers */
  totalSnapshots: number;

  /** Number of evictions performed */
  evictions: number;

  /** Total memory usage estimate in bytes */
  estimatedMemoryBytes?: number;
};

/**
 * In-memory LRU cache for document snapshots with ring buffer per document
 */
export interface IWriteCache {
  /**
   * Retrieves or builds the document at the specified revision.
   * If targetRevision is not provided, retrieves the latest state.
   *
   * Cache miss handling:
   * - Cold miss (no cached document): Streams operations using getSince(0, paging)
   *   with cursor-based paging and replays them through reducer from scratch
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
   * Resets statistics.
   */
  clear(): void;

  /**
   * Returns cache statistics for monitoring and optimization.
   *
   * @returns Current cache statistics
   */
  getStats(): CacheStats;

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
const cache = new MemoryWriteCache(
  operationStore,    // IOperationStore for loading operations on cache miss
  registry,          // IDocumentModelRegistry for accessing reducers on cache miss
  {
    maxDocuments: 1000,    // Cache up to 1000 document streams
    ringBufferSize: 10     // Keep 10 snapshots per document stream
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

// Check cache performance
const stats = cache.getStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cached documents: ${stats.cachedDocuments}`);

// Invalidate cache when document is deleted or significant changes occur
cache.invalidate(documentId);

// Or invalidate specific scope
cache.invalidate(documentId, 'global');

// Or invalidate specific stream
cache.invalidate(documentId, 'global', 'main');
```

### Monitoring and Management

```tsx
// Monitor memory usage
const stats = cache.getStats();
if (stats.estimatedMemoryBytes && stats.estimatedMemoryBytes > MAX_MEMORY) {
  console.warn('Cache memory usage exceeds threshold');
  // Consider reducing maxDocuments or ringBufferSize, or clear cache
  cache.clear();
}

// Periodic stats logging
setInterval(() => {
  const stats = cache.getStats();
  logger.info('Write cache stats', {
    hitRate: stats.hitRate,
    cachedDocs: stats.cachedDocuments,
    totalSnapshots: stats.totalSnapshots,
    evictions: stats.evictions,
    coldMisses: stats.coldMisses,
    warmMisses: stats.warmMisses
  });

  // Warm miss ratio indicates ring buffer effectiveness
  const warmMissRatio = stats.warmMisses / (stats.coldMisses + stats.warmMisses);
  if (warmMissRatio < 0.5) {
    logger.warn('Low warm miss ratio - consider increasing ringBufferSize');
  }

  // Reset stats for next period
  cache.resetStats();
}, 60000);

// Clear cache during low-traffic periods or high memory pressure
if (memoryPressure === 'critical') {
  cache.clear();
  console.log('Cache cleared due to memory pressure');
}
```

### Links

* [Overview](./write-cache.md) - Detailed architectural overview
* [Operation Index](./operation-index.md) - Related indexing system for operations
