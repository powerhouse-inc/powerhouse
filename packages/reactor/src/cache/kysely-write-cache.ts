import type { CreateDocumentAction, PHDocument } from "document-model";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  createDocumentFromAction,
} from "../executor/util.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IKeyframeStore, IOperationStore } from "../storage/interfaces.js";
import { RingBuffer } from "./buffer/ring-buffer.js";
import { LRUTracker } from "./lru/lru-tracker.js";
import type { CachedSnapshot, WriteCacheConfig } from "./types.js";
import type { IWriteCache } from "./write/interfaces.js";

type DocumentStream = {
  key: string;
  ringBuffer: RingBuffer<CachedSnapshot>;
};

/**
 * In-memory write cache with keyframe persistence for PHDocuments.
 *
 * Caches document snapshots in ring buffers with LRU eviction. On cache miss,
 * rebuilds documents from nearest keyframe or full operation history.
 *
 * **Performance Characteristics:**
 * - Cache hit: O(1) lookup in ring buffer
 * - Cold miss: O(n) where n is total operation count, or O(k) where k is operations since keyframe
 * - Warm miss: O(m) where m is operations since cached revision
 * - Eviction: O(1) for LRU tracking and removal
 *
 * **Thread Safety:**
 * Not thread-safe. Designed for single-threaded job executor environment.
 * External synchronization required for concurrent access across multiple executors.
 *
 * **Example:**
 * ```typescript
 * const cache = new KyselyWriteCache(
 *   keyframeStore,
 *   operationStore,
 *   registry,
 *   { maxDocuments: 1000, ringBufferSize: 10, keyframeInterval: 10 }
 * );
 *
 * await cache.startup();
 *
 * // Retrieve or rebuild document
 * const doc = await cache.getState(docId, docType, scope, branch, revision);
 *
 * // Cache result after job execution
 * cache.putState(docId, docType, scope, branch, newRevision, updatedDoc);
 *
 * await cache.shutdown();
 * ```
 */
export class KyselyWriteCache implements IWriteCache {
  private streams: Map<string, DocumentStream>;
  private lruTracker: LRUTracker<string>;
  private keyframeStore: IKeyframeStore;
  private operationStore: IOperationStore;
  private registry: IDocumentModelRegistry;
  private config: Required<WriteCacheConfig>;

  constructor(
    keyframeStore: IKeyframeStore,
    operationStore: IOperationStore,
    registry: IDocumentModelRegistry,
    config: WriteCacheConfig,
  ) {
    this.keyframeStore = keyframeStore;
    this.operationStore = operationStore;
    this.registry = registry;
    this.config = {
      maxDocuments: config.maxDocuments,
      ringBufferSize: config.ringBufferSize,
      keyframeInterval: config.keyframeInterval,
    };
    this.streams = new Map();
    this.lruTracker = new LRUTracker<string>();
  }

  /**
   * Initializes the write cache.
   * Currently a no-op as keyframe store lifecycle is managed externally.
   */
  async startup(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Shuts down the write cache.
   * Currently a no-op as keyframe store lifecycle is managed externally.
   */
  async shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Retrieves document state at a specific revision from cache or rebuilds it.
   *
   * Cache hit path: Returns cached snapshot if available (O(1))
   * Warm miss path: Rebuilds from cached base revision + incremental ops
   * Cold miss path: Rebuilds from keyframe or from scratch using all operations
   *
   * @param documentId - The document identifier
   * @param scope - The operation scope
   * @param branch - The operation branch
   * @param targetRevision - The target revision, or undefined for newest
   * @param signal - Optional abort signal to cancel the operation
   * @returns The document at the target revision
   * @throws {Error} "Operation aborted" if signal is aborted
   * @throws {ModuleNotFoundError} If document type not registered in registry
   * @throws {Error} "Failed to rebuild document" if operation store fails
   * @throws {Error} If reducer throws during operation application
   * @throws {Error} If document serialization (structuredClone) fails
   */
  async getState(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision?: number,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const streamKey = this.makeStreamKey(documentId, scope, branch);
    const stream = this.streams.get(streamKey);

    if (stream) {
      const snapshots = stream.ringBuffer.getAll();

      if (targetRevision === undefined) {
        if (snapshots.length > 0) {
          const newest = snapshots[snapshots.length - 1];
          this.lruTracker.touch(streamKey);
          return structuredClone(newest.document);
        }
      } else {
        const exactMatch = snapshots.find((s) => s.revision === targetRevision);
        if (exactMatch) {
          this.lruTracker.touch(streamKey);
          return structuredClone(exactMatch.document);
        }

        const newestOlder = this.findNearestOlderSnapshot(
          snapshots,
          targetRevision,
        );
        if (newestOlder) {
          const document = await this.warmMissRebuild(
            newestOlder.document,
            newestOlder.revision,
            documentId,
            scope,
            branch,
            targetRevision,
            signal,
          );

          this.putState(documentId, scope, branch, targetRevision, document);
          this.lruTracker.touch(streamKey);

          return structuredClone(document);
        }
      }
    }

    const document = await this.coldMissRebuild(
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );

    let revision = targetRevision;
    if (revision === undefined) {
      revision = document.header.revision[scope] || 0;
    }

    this.putState(documentId, scope, branch, revision, document);

    return structuredClone(document);
  }

  /**
   * Stores a document snapshot in the cache at a specific revision.
   *
   * The document is deep-copied to prevent external mutations.
   * Updates LRU tracker and may evict least recently used stream if at capacity.
   * Asynchronously persists keyframes at configured intervals (fire-and-forget).
   *
   * @param documentId - The document identifier
   * @param scope - The operation scope
   * @param branch - The operation branch
   * @param revision - The revision number
   * @param document - The document to cache
   * @throws {Error} If document serialization (structuredClone) fails
   */
  putState(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
  ): void {
    const safeCopy = structuredClone(document);
    const streamKey = this.makeStreamKey(documentId, scope, branch);
    const stream = this.getOrCreateStream(streamKey);

    const snapshot: CachedSnapshot = {
      revision,
      document: safeCopy,
    };

    stream.ringBuffer.push(snapshot);

    if (this.isKeyframeRevision(revision)) {
      this.keyframeStore
        .putKeyframe(documentId, scope, branch, revision, safeCopy)
        .catch((err) => {
          console.error(
            `Failed to persist keyframe ${documentId}@${revision}:`,
            err,
          );
        });
    }
  }

  /**
   * Invalidates cached document streams.
   *
   * Supports three invalidation scopes:
   * - Document-level: invalidate(documentId) - removes all streams for document
   * - Scope-level: invalidate(documentId, scope) - removes all branches for scope
   * - Stream-level: invalidate(documentId, scope, branch) - removes specific stream
   *
   * @param documentId - The document identifier
   * @param scope - Optional scope to narrow invalidation
   * @param branch - Optional branch to narrow invalidation (requires scope)
   * @returns The number of streams evicted
   */
  invalidate(documentId: string, scope?: string, branch?: string): number {
    let evicted = 0;

    if (scope === undefined && branch === undefined) {
      for (const [key] of this.streams.entries()) {
        if (key.startsWith(`${documentId}:`)) {
          this.streams.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else if (scope !== undefined && branch === undefined) {
      for (const [key] of this.streams.entries()) {
        if (key.startsWith(`${documentId}:${scope}:`)) {
          this.streams.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else if (scope !== undefined && branch !== undefined) {
      const key = this.makeStreamKey(documentId, scope, branch);
      if (this.streams.has(key)) {
        this.streams.delete(key);
        this.lruTracker.remove(key);
        evicted = 1;
      }
    }

    return evicted;
  }

  /**
   * Clears the entire cache, removing all cached document streams.
   * Resets LRU tracking state. This operation always succeeds.
   */
  clear(): void {
    this.streams.clear();
    this.lruTracker.clear();
  }

  /**
   * Retrieves a specific stream for a document. Exposed on the implementation
   * for testing, but not on the interface.
   */
  getStream(
    documentId: string,
    scope: string,
    branch: string,
  ): DocumentStream | undefined {
    const key = this.makeStreamKey(documentId, scope, branch);
    return this.streams.get(key);
  }

  private async findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined> {
    if (targetRevision === Number.MAX_SAFE_INTEGER || targetRevision <= 0) {
      return undefined;
    }

    return this.keyframeStore.findNearestKeyframe(
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );
  }

  private async coldMissRebuild(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const effectiveTargetRevision = targetRevision || Number.MAX_SAFE_INTEGER;

    const keyframe = await this.findNearestKeyframe(
      documentId,
      scope,
      branch,
      effectiveTargetRevision,
      signal,
    );

    let document: PHDocument | undefined;
    let startRevision: number;
    let documentType: string;

    if (keyframe) {
      document = structuredClone(keyframe.document);
      startRevision = keyframe.revision;
      documentType = keyframe.document.header.documentType;
    } else {
      document = undefined;
      startRevision = 0;
      const createOpResult = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        -1,
        { limit: 1 },
        signal,
      );

      if (createOpResult.items.length === 0) {
        throw new Error(
          `Failed to rebuild document ${documentId}: no CREATE_DOCUMENT operation found in document scope`,
        );
      }

      const createOp = createOpResult.items[0];
      if (createOp.action.type !== "CREATE_DOCUMENT") {
        throw new Error(
          `Failed to rebuild document ${documentId}: first operation in document scope must be CREATE_DOCUMENT, found ${createOp.action.type}`,
        );
      }

      const documentCreateAction = createOp.action as CreateDocumentAction;
      documentType = documentCreateAction.input.model;
      if (!documentType) {
        throw new Error(
          `Failed to rebuild document ${documentId}: CREATE_DOCUMENT action missing model in input`,
        );
      }

      document = createDocumentFromAction(documentCreateAction);

      const docModule = this.registry.getModule(documentType);
      const docScopeOps = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        0,
        undefined,
        signal,
      );

      for (const operation of docScopeOps.items) {
        if (operation.index === 0) {
          continue;
        }

        if (operation.action.type === "UPGRADE_DOCUMENT") {
          applyUpgradeDocumentAction(document, operation.action as never);
        } else if (operation.action.type === "DELETE_DOCUMENT") {
          applyDeleteDocumentAction(document, operation.action as never);
        } else {
          document = docModule.reducer(document, operation.action);
        }
      }
    }

    const module = this.registry.getModule(documentType);
    let cursor: string | undefined = undefined;
    const pageSize = 100;
    let hasMorePages: boolean;

    do {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const paging = cursor ? { cursor, pageSize } : { pageSize };

      try {
        const result = await this.operationStore.getSince(
          documentId,
          scope,
          branch,
          startRevision,
          paging,
          signal,
        );

        for (const operation of result.items) {
          if (
            targetRevision !== undefined &&
            operation.index > targetRevision
          ) {
            break;
          }

          // Fail-fast: if reducer throws, error propagates immediately without caching partial state
          document = module.reducer(document, operation.action);
        }

        const reachedTarget =
          targetRevision !== undefined &&
          result.items.some((op) => op.index >= targetRevision);
        hasMorePages = Boolean(result.nextCursor) && !reachedTarget;

        if (hasMorePages) {
          cursor = result.nextCursor;
        }
      } catch (err) {
        // Wrap errors with context to include document ID for debugging
        throw new Error(
          `Failed to rebuild document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } while (hasMorePages);

    // we let these errors bubble up to jobs
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    document.header.revision = revisions.revision;
    document.header.lastModifiedAtUtcIso = revisions.latestTimestamp;

    return document;
  }

  private async warmMissRebuild(
    baseDocument: PHDocument,
    baseRevision: number,
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const documentType = baseDocument.header.documentType;
    const module = this.registry.getModule(documentType);
    let document = structuredClone(baseDocument);

    try {
      const pagedResults = await this.operationStore.getSince(
        documentId,
        scope,
        branch,
        baseRevision,
        undefined,
        signal,
      );

      for (const operation of pagedResults.items) {
        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }

        if (targetRevision !== undefined && operation.index > targetRevision) {
          break;
        }

        // Fail-fast: if reducer throws, error propagates immediately without caching partial state
        document = module.reducer(document, operation.action);

        if (
          targetRevision !== undefined &&
          operation.index === targetRevision
        ) {
          break;
        }
      }
    } catch (err) {
      // Wrap errors with context to include document ID for debugging
      throw new Error(
        `Failed to rebuild document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // we let these errors bubble up to jobs
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    document.header.revision = revisions.revision;
    document.header.lastModifiedAtUtcIso = revisions.latestTimestamp;

    return document;
  }

  private findNearestOlderSnapshot(
    snapshots: CachedSnapshot[],
    targetRevision: number,
  ): CachedSnapshot | undefined {
    let nearest: CachedSnapshot | undefined = undefined;

    for (const snapshot of snapshots) {
      if (snapshot.revision < targetRevision) {
        if (!nearest || snapshot.revision > nearest.revision) {
          nearest = snapshot;
        }
      }
    }

    return nearest;
  }

  private makeStreamKey(
    documentId: string,
    scope: string,
    branch: string,
  ): string {
    return `${documentId}:${scope}:${branch}`;
  }

  private getOrCreateStream(key: string): DocumentStream {
    let stream = this.streams.get(key);

    if (!stream) {
      if (this.streams.size >= this.config.maxDocuments) {
        const evictKey = this.lruTracker.evict();
        if (evictKey) {
          this.streams.delete(evictKey);
        }
      }

      stream = {
        key,
        ringBuffer: new RingBuffer<CachedSnapshot>(this.config.ringBufferSize),
      };
      this.streams.set(key, stream);
    }

    this.lruTracker.touch(key);
    return stream;
  }

  private isKeyframeRevision(revision: number): boolean {
    return revision > 0 && revision % this.config.keyframeInterval === 0;
  }
}
