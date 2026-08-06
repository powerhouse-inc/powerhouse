import type {
  CreateDocumentAction,
  Operation,
  PHDocument,
  UpgradeDocumentAction,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  appendWithoutApplying,
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  baseReducerVersion,
  isDenied,
} from "@powerhousedao/shared/document-model";
import { createDocumentFromAction } from "../executor/util.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import type { IKeyframeStore, IOperationStore } from "../storage/interfaces.js";
import { RingBuffer } from "./buffer/ring-buffer.js";
import { LRUTracker } from "./lru/lru-tracker.js";
import type { CachedSnapshot, WriteCacheConfig } from "./write-cache-types.js";
import { SnapshotPosition } from "./write-cache-types.js";
import type { IWriteCache } from "./write/interfaces.js";

type DocumentStream = {
  key: string;
  ringBuffer: RingBuffer<CachedSnapshot>;
};

/**
 * An UPGRADE_DOCUMENT spine event validated as version-changing
 * (fromVersion > 0 and fromVersion < toVersion), as opposed to the
 * creation-time 0->N seed upgrade. Used to segment scope replay.
 */
type ValidatedUpgrade = {
  fromVersion: number;
  toVersion: number;
  revision: Record<string, number> | undefined;
  timestampUtcMs: string;
};

/**
 * A validated upgrade held back by the document scope pass so its transitions
 * run against the state the requested scope has reached at the upgrade's
 * boundary, rather than the state the pass starts from.
 */
type PendingUpgrade = {
  action: UpgradeDocumentAction;
  upgradePath: UpgradeTransition[] | undefined;
};

/**
 * The last operation index a keyframe's document reflects for the scope. A
 * keyframe only exists for a scope that has operations, so a missing entry
 * means the stored row is corrupt.
 */
function keyframeRevision(
  keyframe: { revision: number; document: PHDocument },
  documentId: string,
  scope: string,
): number {
  const nextIndex = keyframe.document.header.revision[scope];

  if (typeof nextIndex !== "number") {
    throw new Error(
      `Corrupt keyframe for document ${documentId} at revision ${keyframe.revision}: header carries no ${scope} revision`,
    );
  }

  return nextIndex - 1;
}

/** Version 0 means unversioned, which the registry expresses as undefined. */
function normalizeModuleVersion(
  version: number | undefined,
): number | undefined {
  return version === 0 ? undefined : version;
}

function extractModuleVersion(doc: PHDocument): number | undefined {
  const v = (doc.state as Record<string, Record<string, unknown>>).document
    .version as number | undefined;
  return normalizeModuleVersion(v);
}

/** The highest revision held, latest push winning a tie. */
function highestRevision(
  snapshots: CachedSnapshot[],
): CachedSnapshot | undefined {
  let newest: CachedSnapshot | undefined = undefined;
  for (const snapshot of snapshots) {
    if (!newest || snapshot.revision >= newest.revision) {
      newest = snapshot;
    }
  }
  return newest;
}

/**
 * Copies a document far enough that the caller cannot write through it. Inside
 * this class, callers only ever replace whole fields on these four, so one
 * level each is enough.
 */
function copyDocument(document: PHDocument): PHDocument {
  return {
    ...document,
    header: { ...document.header },
    state: { ...document.state },
    operations: { ...document.operations },
  };
}

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

  withScopedStores(
    operationStore: IOperationStore,
    keyframeStore: IKeyframeStore,
  ): KyselyWriteCache {
    const scoped = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      this.registry,
      this.config,
    );
    scoped.streams = this.streams;
    scoped.lruTracker = this.lruTracker;
    return scoped;
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
   * Note: this returns a _shallow_ copy of the document.
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
   * @throws {Error} If document serialization fails
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
        const newest = highestRevision(snapshots);

        // Only the topmost snapshot can be the head, and only if it was stored
        // as one: anything above it proves the stream has grown since.
        if (newest?.position === SnapshotPosition.Head) {
          this.lruTracker.touch(streamKey);
          return copyDocument(newest.document);
        }

        if (newest) {
          const document = await this.warmMissRebuild(
            newest.document,
            newest.revision,
            documentId,
            scope,
            branch,
            undefined,
            signal,
          );

          this.store(
            documentId,
            scope,
            branch,
            (document.header.revision[scope] ?? 0) - 1,
            document,
            SnapshotPosition.Head,
          );
          this.lruTracker.touch(streamKey);

          return document;
        }
      } else {
        const exactMatch = snapshots.findLast(
          (s) => s.revision === targetRevision,
        );
        if (exactMatch) {
          this.lruTracker.touch(streamKey);
          return copyDocument(exactMatch.document);
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

          this.store(
            documentId,
            scope,
            branch,
            targetRevision,
            document,
            SnapshotPosition.Historical,
          );
          this.lruTracker.touch(streamKey);

          return document;
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

    // header.revision is a next index; a snapshot is labelled by last index.
    const revision =
      targetRevision ?? (document.header.revision[scope] ?? 0) - 1;

    this.store(
      documentId,
      scope,
      branch,
      revision,
      document,
      targetRevision === undefined
        ? SnapshotPosition.Head
        : SnapshotPosition.Historical,
    );

    return document;
  }

  /**
   * Stores a document snapshot in the cache at a specific revision.
   *
   * The cached document is a shallow copy of the input with its operation history
   * truncated to the last operation per scope and its clipboard cleared. This keeps
   * memory use and copy costs constant regardless of operation count. Consumers of
   * getState() must not rely on the full operation history being present; the only
   * guaranteed invariant is that operations[scope].at(-1) reflects the latest
   * operation index for each scope.
   *
   * Updates LRU tracker and may evict least recently used stream if at capacity.
   * Asynchronously persists keyframes at configured intervals (fire-and-forget).
   *
   * @param documentId - The document identifier
   * @param scope - The operation scope
   * @param branch - The operation branch
   * @param revision - The revision number
   * @param document - The document to cache
   * @throws {Error} If document serialization fails
   */
  putState(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    position: SnapshotPosition,
  ): void {
    this.store(documentId, scope, branch, revision, document, position);
  }

  private store(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    position: SnapshotPosition,
  ): void {
    const streamKey = this.makeStreamKey(documentId, scope, branch);
    const stream = this.getOrCreateStream(streamKey);

    // Keep only the last operation per scope in the ring buffer. The reducer
    // only needs at(-1).index to determine the next index, so carrying the
    // full history causes O(n²) array copies across n operations. UNDO, REDO,
    // and PRUNE bypass this by forcing a cold-miss rebuild in the job executor.
    // Copied so a caller still holding the document cannot change what we
    // stored.
    const slicedDocument: PHDocument = {
      ...copyDocument(document),
      operations: Object.fromEntries(
        Object.entries(document.operations).map(([k, ops]) => [
          k,
          ops.length ? [ops.at(-1)!] : [],
        ]),
      ),
      clipboard: [],
    };

    const snapshot: CachedSnapshot = {
      revision,
      document: slicedDocument,
      position,
    };

    stream.ringBuffer.push(snapshot);

    if (this.isKeyframeRevision(revision)) {
      this.keyframeStore
        .putKeyframe(documentId, scope, branch, revision, {
          ...document,
          operations: {},
          clipboard: [],
        })
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
   *
   * @internal
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

    const keyframe = await this.keyframeStore.findNearestKeyframe(
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );

    if (!keyframe) {
      return undefined;
    }

    // Where a replay resumes comes from the stored document, not the row's
    // label: rows written before the label convention settled are off by one.
    // Clamped: a legacy positional row advertises the store head, far above
    // the position it holds. The label is the bound both error modes respect.
    return {
      revision: Math.min(
        keyframeRevision(keyframe, documentId, scope),
        keyframe.revision,
      ),
      document: keyframe.document,
    };
  }

  /**
   * Rebuilds a scope from a keyframe or from the whole operation history.
   *
   * The document scope is always rebuilt first, because it carries the type,
   * the upgrades and the deletion marker. Its version-changing upgrades are not
   * applied there though: an upgrade reducer must see the state the requested
   * scope has reached at that upgrade's boundary, so each one is held back and
   * applied when the replay below crosses the boundary that
   * resolveModuleVersionForOp derives from it. Upgrades whose boundary lies past
   * the last replayed operation are applied at the end. Creation-time 0->N seed
   * upgrades carry the initial state, so they still apply immediately.
   */
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

    // all scope rebuilds need the document scope for type, upgrades and deletion,
    // but we need to special case for document scope rebuilds
    const documentScopeBound =
      scope === "document" ? targetRevision : undefined;

    let document: PHDocument | undefined;
    let startRevision: number;
    let documentType: string;

    const validatedUpgrades: ValidatedUpgrade[] = [];
    const pendingUpgrades: PendingUpgrade[] = [];

    let lastDocumentScopeOperation: Operation | undefined;

    if (keyframe) {
      document = keyframe.document;
      startRevision = keyframe.revision;
      documentType = keyframe.document.header.documentType;

      // The keyframe's label indexes the scope it was written for, a different
      // stream unless that scope is the document one.
      const documentScopeResume =
        scope === "document"
          ? keyframe.revision
          : keyframeRevision(keyframe, documentId, "document");

      const docScopeOpsAfterKeyframe = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        documentScopeResume,
        undefined,
        undefined,
        signal,
      );

      for (const operation of docScopeOpsAfterKeyframe.results) {
        if (
          documentScopeBound !== undefined &&
          operation.index > documentScopeBound
        ) {
          break;
        }

        lastDocumentScopeOperation = operation;

        if (operation.error || isDenied(operation)) {
          continue;
        }

        if (operation.action.type === "UPGRADE_DOCUMENT") {
          const upgradeAction = operation.action as UpgradeDocumentAction;
          const fromVersion = upgradeAction.input.fromVersion;
          const toVersion = upgradeAction.input.toVersion;

          if (fromVersion > 0 && fromVersion < toVersion) {
            let upgradePath: UpgradeTransition[] | undefined;
            try {
              upgradePath = this.registry.computeUpgradePath(
                documentType,
                fromVersion,
                toVersion,
              );
            } catch (err) {
              const upgradeInput = upgradeAction.input as {
                initialState?: unknown;
              };
              if (upgradeInput.initialState !== undefined) {
                upgradePath = undefined;
              } else {
                throw new Error(
                  `Failed to rebuild document ${documentId}: no upgrade manifest for ${documentType} v${fromVersion}→v${toVersion} and no initialState snapshot. ${err instanceof Error ? err.message : String(err)}`,
                  { cause: err },
                );
              }
            }
            validatedUpgrades.push({
              fromVersion,
              toVersion,
              revision: upgradeAction.input.revision,
              timestampUtcMs: operation.timestampUtcMs,
            });
            pendingUpgrades.push({ action: upgradeAction, upgradePath });
          }
        } else if (operation.action.type === "DELETE_DOCUMENT") {
          applyDeleteDocumentAction(document, operation.action as never);
        }
      }
    } else {
      startRevision = -1;
      const createOpResult = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        -1,
        undefined,
        { cursor: "0", limit: 1 },
        signal,
      );

      // Typed, so the executor defers the job until the document arrives.
      if (createOpResult.results.length === 0) {
        throw new DocumentNotFoundError(documentId);
      }

      const createOp = createOpResult.results[0];
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
      lastDocumentScopeOperation = createOp;

      let docModule = this.registry.getModule(
        documentType,
        extractModuleVersion(document),
      );
      const docScopeOps = await this.operationStore.getSince(
        documentId,
        "document",
        branch,
        0,
        undefined,
        undefined,
        signal,
      );

      for (const operation of docScopeOps.results) {
        if (
          // in the case that the document scope was requested, we can exit early
          documentScopeBound !== undefined &&
          operation.index > documentScopeBound
        ) {
          break;
        }

        lastDocumentScopeOperation = operation;

        if (operation.index === 0) {
          continue;
        }

        if (operation.error || isDenied(operation)) {
          continue;
        }

        if (operation.action.type === "UPGRADE_DOCUMENT") {
          const upgradeAction = operation.action as UpgradeDocumentAction;
          const fromVersion = upgradeAction.input.fromVersion;
          const toVersion = upgradeAction.input.toVersion;

          if (fromVersion > 0 && fromVersion < toVersion) {
            let upgradePath: UpgradeTransition[] | undefined;
            try {
              upgradePath = this.registry.computeUpgradePath(
                documentType,
                fromVersion,
                toVersion,
              );
            } catch (err) {
              const upgradeInput = upgradeAction.input as {
                initialState?: unknown;
              };
              if (upgradeInput.initialState !== undefined) {
                upgradePath = undefined;
              } else {
                throw new Error(
                  `Failed to rebuild document ${documentId}: no upgrade manifest for ${documentType} v${fromVersion}→v${toVersion} and no initialState snapshot. ${err instanceof Error ? err.message : String(err)}`,
                  { cause: err },
                );
              }
            }
            validatedUpgrades.push({
              fromVersion,
              toVersion,
              revision: upgradeAction.input.revision,
              timestampUtcMs: operation.timestampUtcMs,
            });
            pendingUpgrades.push({ action: upgradeAction, upgradePath });
          } else {
            document = applyUpgradeDocumentAction(
              document,
              upgradeAction,
              undefined,
            );
          }

          docModule = this.registry.getModule(
            documentType,
            normalizeModuleVersion(toVersion),
          );
        } else if (operation.action.type === "DELETE_DOCUMENT") {
          applyDeleteDocumentAction(document, operation.action as never);
        } else {
          const protocolVersion = baseReducerVersion(document.header);
          document = docModule.reducer(document, operation.action, undefined, {
            skip: operation.skip,
            protocolVersion,
          });
        }
      }
    }

    // we rebuild the document scope all the time, so if that is the scope
    // requested, we're already done
    if (scope === "document") {
      document = this.applyPendingUpgrades(
        document,
        pendingUpgrades,
        Number.MAX_SAFE_INTEGER,
      );

      const last =
        lastDocumentScopeOperation ??
        (await this.operationAt(
          documentId,
          "document",
          branch,
          startRevision,
          signal,
        ));

      document.operations = {
        ...document.operations,
        document: last ? [last] : [],
      };

      return this.stampRevisions(
        document,
        documentId,
        scope,
        branch,
        targetRevision,
        signal,
      );
    }

    // keyframes carry no operations, so we need to fill the operations list
    if (keyframe) {
      const resumeOperation = await this.operationAt(
        documentId,
        scope,
        branch,
        startRevision,
        signal,
      );

      if (resumeOperation) {
        document.operations = {
          ...document.operations,
          [scope]: [resumeOperation],
        };
      }
    }

    const moduleCache = new Map<
      number,
      ReturnType<typeof this.registry.getModule>
    >();

    const getModuleCached = (version: number | undefined) => {
      const key = version ?? 0;
      let mod = moduleCache.get(key);
      if (!mod) {
        mod = this.registry.getModule(documentType, version);
        moduleCache.set(key, mod);
      }
      return mod;
    };

    const finalVersion =
      validatedUpgrades.at(-1)?.toVersion ?? extractModuleVersion(document);

    let cursor: string | undefined = undefined;
    const pageSize = 100;
    let hasMorePages: boolean;

    do {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const paging = { cursor: cursor || "0", limit: pageSize };

      try {
        const result = await this.operationStore.getSince(
          documentId,
          scope,
          branch,
          startRevision,
          undefined,
          paging,
          signal,
        );

        for (const operation of result.results) {
          if (
            targetRevision !== undefined &&
            operation.index > targetRevision
          ) {
            break;
          }

          const moduleVersion = this.resolveModuleVersionForOp(
            operation.index,
            operation.timestampUtcMs,
            scope,
            validatedUpgrades,
            finalVersion,
          );

          document = this.applyPendingUpgrades(
            document,
            pendingUpgrades,
            moduleVersion ?? Number.MAX_SAFE_INTEGER,
          );

          // A denied operation still carries a potentially valid action, so
          // we must specifically skip without applying.
          if (isDenied(operation)) {
            document = appendWithoutApplying(document, operation, scope);
          } else {
            // Fail-fast: if reducer throws, error propagates immediately without caching partial state
            const protocolVersion = baseReducerVersion(document.header);
            document = getModuleCached(moduleVersion).reducer(
              document,
              operation.action,
              undefined,
              {
                skip: operation.skip,
                protocolVersion,
              },
            );
          }
        }

        const reachedTarget =
          targetRevision !== undefined &&
          result.results.some((op) => op.index >= targetRevision);
        hasMorePages = Boolean(result.nextCursor) && !reachedTarget;

        if (hasMorePages) {
          cursor = result.nextCursor;
        }
      } catch (err) {
        // Wrap errors with context to include document ID for debugging
        throw new Error(
          `Failed to rebuild document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    } while (hasMorePages);

    document = this.applyPendingUpgrades(
      document,
      pendingUpgrades,
      Number.MAX_SAFE_INTEGER,
    );

    return this.stampRevisions(
      document,
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );
  }

  /**
   * Applies and removes every held-back upgrade whose target version is at or
   * below `throughVersion`, in the order the document scope recorded them.
   */
  private applyPendingUpgrades(
    document: PHDocument,
    pendingUpgrades: PendingUpgrade[],
    throughVersion: number,
  ): PHDocument {
    while (pendingUpgrades.length > 0) {
      const pending = pendingUpgrades[0];

      if (throughVersion < pending.action.input.toVersion) {
        break;
      }

      pendingUpgrades.shift();
      document = applyUpgradeDocumentAction(
        document,
        pending.action,
        pending.upgradePath,
      );
    }

    return document;
  }

  /**
   * Copies the current document revisions onto the document. Overwrites the
   * requested scope revision with the target revision, if provided.
   */
  private async stampRevisions(
    document: PHDocument,
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    // we let these errors bubble up to jobs
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    document.header.revision = revisions.revision;

    if (targetRevision !== undefined) {
      document.header.revision = {
        ...document.header.revision,
        [scope]: targetRevision + 1,
      };
    }
    document.header.lastModifiedAtUtcIso = revisions.latestTimestamp;

    return document;
  }

  /** The stored operation at `index`, or undefined if it is no longer there. */
  private async operationAt(
    documentId: string,
    scope: string,
    branch: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Operation | undefined> {
    if (index < 0) {
      return undefined;
    }

    const result = await this.operationStore.getSince(
      documentId,
      scope,
      branch,
      index - 1,
      undefined,
      { cursor: "0", limit: 1 },
      signal,
    );

    const operation = result.results[0];
    return operation && operation.index === index ? operation : undefined;
  }

  /**
   * Resolves which module version to use for a given operation in phase 2.
   *
   * Uses the validated-upgrade boundary rules from D7:
   * - If `input.revision` is present: op.index < revision[scope] → before the upgrade boundary
   * - Otherwise: timestamp fallback
   * - Falls back to final module version when neither is decidable
   */
  private resolveModuleVersionForOp(
    opIndex: number,
    opTimestamp: string,
    scope: string,
    validatedUpgrades: ValidatedUpgrade[],
    finalVersion: number | undefined,
  ): number | undefined {
    if (validatedUpgrades.length === 0) {
      return finalVersion;
    }

    let currentVersion: number | undefined = validatedUpgrades[0]?.fromVersion;

    for (const upgrade of validatedUpgrades) {
      let beforeUpgrade: boolean;

      if (upgrade.revision !== undefined) {
        const boundary = upgrade.revision[scope] ?? 0;
        beforeUpgrade = opIndex < boundary;
      } else {
        beforeUpgrade = opTimestamp < upgrade.timestampUtcMs;
      }

      if (beforeUpgrade) {
        return currentVersion;
      }

      currentVersion = upgrade.toVersion;
    }

    return currentVersion;
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
    const docScopeNextIndex = baseDocument.header.revision["document"] ?? 0;

    const docScopeNewOps = await this.operationStore.getSince(
      documentId,
      "document",
      branch,
      docScopeNextIndex - 1,
      undefined,
      undefined,
      signal,
    );

    // Only a cold rebuild applies document-scope operations properly; the model
    // reducer below ignores them, so a delete or an upgrade since the base
    // would go missing.
    if (docScopeNewOps.results.length > 0) {
      return this.coldMissRebuild(
        documentId,
        scope,
        branch,
        targetRevision,
        signal,
      );
    }

    const module = this.registry.getModule(
      documentType,
      extractModuleVersion(baseDocument),
    );
    // The base is a cached snapshot and the revisions below are written in
    // place, so copy it first or a rebuild that applies nothing rewrites it.
    let document = copyDocument(baseDocument);

    try {
      const pagedResults = await this.operationStore.getSince(
        documentId,
        scope,
        branch,
        baseRevision,
        undefined,
        undefined,
        signal,
      );

      for (const operation of pagedResults.results) {
        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }

        if (targetRevision !== undefined && operation.index > targetRevision) {
          break;
        }

        // A denied operation still carries a potentially valid action, so
        // we must specifically skip without applying.
        if (isDenied(operation)) {
          document = appendWithoutApplying(document, operation, scope);
        } else {
          // Fail-fast: if reducer throws, error propagates immediately without caching partial state
          const protocolVersion = baseReducerVersion(document.header);
          document = module.reducer(document, operation.action, undefined, {
            skip: operation.skip,
            protocolVersion,
          });
        }

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
        { cause: err },
      );
    }

    // we let these errors bubble up to jobs
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    document.header.revision = revisions.revision;

    // Positional rebuild: this scope's revision is the target, not the head.
    if (targetRevision !== undefined) {
      document.header.revision = {
        ...document.header.revision,
        [scope]: targetRevision + 1,
      };
    }
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
