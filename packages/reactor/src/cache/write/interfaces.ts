import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { SnapshotPosition } from "../write-cache-types.js";

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
   * @param targetRevision - Index of the last operation to apply, defaulting
   *   to latest. An operation index, never `header.revision[scope]`.
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
   * @param revision - Index of the last operation this document reflects, so
   *   `header.revision[scope]` is one greater. -1 for an empty scope.
   * @param document - The document to cache
   * @param position - Whether `revision` is the stream's head. Nothing checks
   *   it: claiming `Head` for an earlier revision makes a getState() with no
   *   target return stale state.
   *
   * @example
   * ```typescript
   * cache.putState(docId, 'global', 'main', 42, document, SnapshotPosition.Head);
   * ```
   */
  putState(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    position: SnapshotPosition,
  ): void;

  /**
   * Records a run of revisions written together, the last of which is the
   * stream's head. Only the head is cached as state: an earlier revision in
   * the run is not the head, and caching it as one would answer a later head
   * read with state from the middle of the run. The earlier ones are still
   * offered to whatever the implementation persists at intervals, because a
   * run that writes past a boundary passed through it just the same.
   *
   * @param documentId - The document identifier
   * @param scope - Operation scope
   * @param branch - Branch name
   * @param run - Each revision the run produced, in order, with the document
   *   as it stood at that revision. The last entry is the head.
   *
   * @example
   * ```typescript
   * cache.putRun(docId, 'global', 'main', [
   *   { revision: 9, document: at9 },
   *   { revision: 10, document: at10 },
   * ]);
   * ```
   */
  putRun(
    documentId: string,
    scope: string,
    branch: string,
    run: readonly { revision: number; document: PHDocument }[],
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
