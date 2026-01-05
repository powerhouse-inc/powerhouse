import type { PHDocumentState } from "document-model";

/**
 * Configuration options for the document metadata cache.
 */
export type DocumentMetaCacheConfig = {
  /**
   * Maximum number of document metadata entries to cache (LRU eviction).
   * Default: 1000
   */
  maxDocuments: number;
};

/**
 * Cached document metadata from the "document" scope.
 *
 * This lightweight structure holds essential document information needed by
 * the job executor without fetching full scope state. It provides an explicit
 * cross-scope contract for accessing document scope metadata.
 */
export type CachedDocumentMeta = {
  /**
   * The full PHDocumentState from document.state.document.
   * Contains version, hash, isDeleted, deletedAtUtcIso, etc.
   */
  state: PHDocumentState;

  /**
   * The document type (from header), cached for convenience.
   */
  documentType: string;

  /**
   * The revision of the document scope when this metadata was captured.
   * Used for cache invalidation and consistency checks.
   */
  documentScopeRevision: number;
};

/**
 * Interface for the document metadata cache.
 *
 * This cache provides an explicit cross-scope contract for accessing document
 * scope metadata. It solves the problem where job execution in one scope (e.g.,
 * "global") needs access to document scope state (version, isDeleted, etc.)
 * which may be stale in scope-specific caches or keyframes.
 *
 * The cache supports:
 * - Latest metadata retrieval with LRU caching
 * - Historical metadata reconstruction for reshuffling scenarios
 * - Eager updates after document scope operations
 */
export interface IDocumentMetaCache {
  /**
   * Retrieves the LATEST document metadata from cache or rebuilds from operations.
   *
   * On cache miss, fetches all document scope operations and reconstructs the
   * current PHDocumentState by applying UPGRADE_DOCUMENT and DELETE_DOCUMENT
   * operations.
   *
   * @param documentId - The document identifier
   * @param branch - Branch name
   * @param signal - Optional abort signal to cancel the operation
   * @returns The cached or rebuilt document metadata
   * @throws {Error} "Operation aborted" if signal is aborted
   * @throws {Error} If document not found (no CREATE_DOCUMENT operation)
   */
  getDocumentMeta(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta>;

  /**
   * Rebuilds document metadata at a SPECIFIC revision (always rebuilds, no caching).
   *
   * Used during reshuffling when operations need to be inserted at a previous
   * revision and we need the document scope state as of that point in time.
   *
   * @param documentId - The document identifier
   * @param branch - Branch name
   * @param targetRevision - The document scope revision to reconstruct up to
   * @param signal - Optional abort signal to cancel the operation
   * @returns Document metadata as of the target revision
   * @throws {Error} "Operation aborted" if signal is aborted
   * @throws {Error} If document not found
   */
  rebuildAtRevision(
    documentId: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta>;

  /**
   * Eagerly updates cached metadata after document scope operations.
   *
   * Called by the job executor after CREATE_DOCUMENT, UPGRADE_DOCUMENT, or
   * DELETE_DOCUMENT operations to keep the cache current.
   *
   * @param documentId - The document identifier
   * @param branch - Branch name
   * @param meta - The new metadata to cache
   */
  putDocumentMeta(
    documentId: string,
    branch: string,
    meta: CachedDocumentMeta,
  ): void;

  /**
   * Invalidates cached document metadata.
   *
   * Call before reshuffling operations that modify the document scope, or
   * when document state may have changed externally.
   *
   * @param documentId - The document identifier
   * @param branch - Optional branch to narrow invalidation (if omitted, all branches)
   * @returns Number of entries invalidated
   */
  invalidate(documentId: string, branch?: string): number;

  /**
   * Clears all cached document metadata.
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
