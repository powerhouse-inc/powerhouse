import type { PHDocument } from "@powerhousedao/shared/document-model";

/**
 * IWriteCache is a write-side projection that optimizes document state retrieval
 * for the job executor. This is separate from IDocumentView (read-side projection) which optimizes
 * queries and searches.
 */
export interface IWriteCache {
  /**
   * Retrieves or builds the document at the specified revision.
   * If targetRevision is not provided, retrieves the latest state.
   *
   * @param documentId - The document identifier
   * @param scope - Operation scope
   * @param branch - Branch name
   * @param targetRevision - The exact revision to retrieve (optional, defaults to latest)
   * @param signal - Optional abort signal to cancel the operation
   * @returns The complete document at the specified revision
   *
   * @example
   * ```typescript
   * // Get latest document state
   * const doc = await cache.getState(docId, 'global', 'main');
   *
   * // Get document at specific revision
   * const doc = await cache.getState(docId, 'global', 'main', 42);
   * ```
   */
  getState(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision?: number,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /**
   * Stores a document snapshot in the cache at the specified revision.
   * Implementations may truncate the stored document (e.g. strip operation
   * history beyond the last entry per scope, clear clipboard) to bound memory
   * and copy cost. Callers must not assume that the document returned by a
   * subsequent getState() call will have a complete operations array; the only
   * guaranteed invariant is that operations[scope].at(-1) holds the latest
   * operation index for each scope present in the cached document.
   *
   * @param documentId - The document identifier
   * @param scope - Operation scope
   * @param branch - Branch name
   * @param revision - The revision this document represents
   * @param document - The document to cache
   *
   * @example
   * ```typescript
   * cache.putState(docId, 'global', 'main', 42, document);
   * ```
   */
  putState(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
  ): void;

  /**
   * Invalidates (removes) cached entries for a document stream.
   *
   * - If only documentId is provided: invalidates all scopes and branches for that document
   * - If documentId + scope provided: invalidates all branches for that document and scope
   * - If all parameters provided: invalidates the specific stream
   *
   * @param documentId - The document identifier
   * @param scope - Optional scope to narrow invalidation
   * @param branch - Optional branch to narrow invalidation
   * @returns Number of ring buffers evicted
   *
   * @example
   * ```typescript
   * // Invalidate all streams for a document
   * cache.invalidate(docId);
   *
   * // Invalidate all branches for a specific scope
   * cache.invalidate(docId, 'global');
   *
   * // Invalidate specific stream
   * cache.invalidate(docId, 'global', 'main');
   * ```
   */
  invalidate(documentId: string, scope?: string, branch?: string): number;

  /**
   * Clears all cached data from the in-memory cache.
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
