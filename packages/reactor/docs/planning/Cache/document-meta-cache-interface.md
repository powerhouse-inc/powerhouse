# IDocumentMetaCache Interface

```typescript
import type { PHDocumentState } from "document-model";

/**
 * Configuration options for the document metadata cache
 */
export type DocumentMetaCacheConfig = {
  /** Maximum number of (documentId, branch) pairs to cache (LRU eviction) */
  maxDocuments: number;
};

/**
 * Cached document metadata containing document scope state
 */
export type CachedDocumentMeta = {
  /** The PHDocumentState from document.state.document */
  state: PHDocumentState;

  /** The document type (cached from header for convenience) */
  documentType: string;

  /** Revision of document scope when this was captured */
  documentScopeRevision: number;
};

/**
 * In-memory document metadata cache with LRU eviction.
 *
 * Caches PHDocumentState per (documentId, branch) key. On cache miss,
 * rebuilds from document scope operations. Provides an explicit cross-scope
 * contract for accessing document scope metadata.
 *
 * Thread Safety:
 * Not thread-safe. Designed for single-threaded job executor environment.
 */
export interface IDocumentMetaCache {
  /**
   * Gets the latest document metadata for a document on a branch.
   * Returns cached value on hit, rebuilds from operations on miss.
   *
   * @param documentId - The document identifier
   * @param branch - The branch name
   * @param signal - Optional abort signal
   * @returns The cached or rebuilt document metadata
   * @throws {Error} "Operation aborted" if signal is aborted
   * @throws {Error} If document not found (no CREATE_DOCUMENT operation)
   * @throws {Error} If first operation is not CREATE_DOCUMENT
   */
  getDocumentMeta(
    documentId: string,
    branch: string,
    signal?: AbortSignal
  ): Promise<CachedDocumentMeta>;

  /**
   * Rebuilds document metadata at a specific revision.
   * Always rebuilds from operations (no caching of historical state).
   * Used during reshuffling when historical document scope state is needed.
   *
   * @param documentId - The document identifier
   * @param branch - The branch name
   * @param targetRevision - The revision to rebuild to
   * @param signal - Optional abort signal
   * @returns Document metadata at the specified revision
   * @throws {Error} "Operation aborted" if signal is aborted
   * @throws {Error} If document not found
   */
  rebuildAtRevision(
    documentId: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal
  ): Promise<CachedDocumentMeta>;

  /**
   * Eagerly updates the cached metadata for a document.
   * Called after document scope operations (CREATE, UPGRADE, DELETE).
   *
   * @param documentId - The document identifier
   * @param branch - The branch name
   * @param meta - The metadata to cache
   */
  putDocumentMeta(
    documentId: string,
    branch: string,
    meta: CachedDocumentMeta
  ): void;

  /**
   * Invalidates cached metadata for a document.
   * If branch is not provided, invalidates all branches for that document.
   *
   * @param documentId - The document identifier
   * @param branch - Optional branch to narrow invalidation
   * @returns Number of entries evicted
   */
  invalidate(documentId: string, branch?: string): number;

  /**
   * Clears all cached metadata.
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

```typescript
// Initialize cache with configuration
const metaCache = new DocumentMetaCache(operationStore, {
  maxDocuments: 1000, // Cache up to 1000 (documentId, branch) pairs
});

await metaCache.startup();

// In job executor: Get current document metadata for cross-scope access
const meta = await metaCache.getDocumentMeta(documentId, branch);

// Check if document is deleted before processing actions
if (meta.state.isDeleted) {
  throw new DocumentDeletedError(documentId, meta.state.deletedAtUtcIso);
}

// Access document version for multi-version document models
const version = meta.state.version;

// After CREATE_DOCUMENT operation
metaCache.putDocumentMeta(documentId, branch, {
  state: document.state.document,
  documentType: document.header.documentType,
  documentScopeRevision: 1,
});

// After UPGRADE_DOCUMENT operation
metaCache.putDocumentMeta(documentId, branch, {
  state: updatedDocument.state.document,
  documentType: updatedDocument.header.documentType,
  documentScopeRevision: operation.index + 1,
});

// After DELETE_DOCUMENT operation
metaCache.putDocumentMeta(documentId, branch, {
  state: { ...document.state.document, isDeleted: true, deletedAtUtcIso: timestamp },
  documentType: document.header.documentType,
  documentScopeRevision: operation.index + 1,
});

// During reshuffling: Get historical document state at specific revision
const historicalMeta = await metaCache.rebuildAtRevision(documentId, branch, targetRevision);
```

### Links

* [Overview](./document-meta-cache.md) - Detailed architectural overview
* [Write Cache Interface](./write-cache-interface.md) - Related scope-specific caching system
