import type {
  DeleteDocumentAction,
  Operation,
  PHDocument,
  PurgeDocumentAction,
  UpgradeDocumentAction,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  appendRows,
  appendWithoutApplying,
  applyDeleteDocumentAction,
  deriveScopeVersioned,
  derivesByRule,
  tailAppliesIncrementally,
  isDenied,
  PURGE_DOCUMENT,
  withProtocolVersions,
} from "@powerhousedao/shared/document-model";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import {
  applyPendingUpgrades,
  applyRowsByRule,
  applyTailPendingUpgrades,
  extractModuleVersion,
  readDocumentScope,
  resolveModuleVersionForOp,
  scopeVersions,
  singleVersion,
  type PendingUpgrade,
  type ValidatedUpgrade,
} from "../derivation/index.js";
import {
  stateReducerOrRefusal,
  UNGATED,
  type BaseReducerResolver,
  type IProtocolGate,
} from "../protocol/gate.js";
import { UnsupportedProtocolVersionError } from "../shared/errors.js";
import { findReferencing } from "../storage/find-referencing.js";
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

/** Wraps a rebuild failure with the document id; a protocol refusal stays typed. */
function rebuildFailure(documentId: string, err: unknown): Error {
  if (UnsupportedProtocolVersionError.isError(err)) return err;
  return new Error(
    `Failed to rebuild document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
    { cause: err },
  );
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
type PendingRead = { evicted: boolean };

/**
 * An invalidation's promise that the next head read of each stream it covers
 * replays the whole log. Callers invalidate before an UNDO, REDO or skip because
 * reducing one needs the full operation history, which a keyframe does not carry.
 * `done` holds the streams that have had their full replay since.
 */
type FullReplayMark = { prefix: string; done: Set<string> };

export class KyselyWriteCache implements IWriteCache {
  private streams: Map<string, DocumentStream>;
  private lruTracker: LRUTracker<string>;
  private keyframeStore: IKeyframeStore;
  private operationStore: IOperationStore;
  private registry: IDocumentModelRegistry;
  private config: Required<Omit<WriteCacheConfig, "gate">>;
  private gate: IProtocolGate | undefined;
  private resolver: BaseReducerResolver;
  private reads = new Map<string, Set<PendingRead>>();
  private fullReplays = new Map<string, FullReplayMark[]>();

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
    this.gate = config.gate;
    this.resolver = config.gate ?? UNGATED;
    this.streams = new Map();
    this.lruTracker = new LRUTracker<string>();
  }

  /** Whether the version `header` runs under here derives `scope` by the rule. */
  private derivesByRule(header: PHDocument["header"], scope: string): boolean {
    return derivesByRule(
      this.resolver.capabilities(header.protocolVersions),
      scope,
    );
  }

  /**
   * Refuses a document stored at an unsupported base-reducer version by name,
   * so read paths can tell it from a failed rebuild. Protocol-only: the hot
   * path does no registry work, and derivation refuses an unrunnable model typed.
   */
  private assertSupported(documentId: string, document: PHDocument): void {
    this.gate?.assertReadable(documentId, document.header.protocolVersions);
  }

  withScopedStores(
    operationStore: IOperationStore,
    keyframeStore: IKeyframeStore,
  ): KyselyWriteCache {
    const scoped = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      this.registry,
      { ...this.config, gate: this.gate },
    );
    scoped.streams = this.streams;
    scoped.lruTracker = this.lruTracker;
    scoped.reads = this.reads;
    scoped.fullReplays = this.fullReplays;
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
   * @throws {DocumentPurgedError} If the stream's only row is a purge marker
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
    const read: PendingRead = { evicted: false };
    let pending = this.reads.get(documentId);
    if (!pending) {
      pending = new Set();
      this.reads.set(documentId, pending);
    }
    pending.add(read);
    try {
      return await this.readState(
        documentId,
        scope,
        branch,
        targetRevision,
        signal,
        read,
      );
    } finally {
      pending.delete(read);
      if (pending.size === 0) {
        this.reads.delete(documentId);
      }
    }
  }

  // A read an invalidation overtook returns its state but must not cache it.
  private async readState(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal: AbortSignal | undefined,
    read: PendingRead,
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
          this.assertSupported(documentId, newest.document);
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

          this.storeUnlessEvicted(
            read,
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
          this.assertSupported(documentId, exactMatch.document);
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

          this.storeUnlessEvicted(
            read,
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

    const owedReplays =
      targetRevision === undefined
        ? this.owedFullReplays(documentId, streamKey)
        : [];

    const document = await this.coldMissRebuild(
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
      owedReplays.length === 0,
    );

    if (!read.evicted) {
      this.settleFullReplays(documentId, streamKey, owedReplays);
    }

    // header.revision is a next index; a snapshot is labelled by last index.
    const revision =
      targetRevision ?? (document.header.revision[scope] ?? 0) - 1;

    this.storeUnlessEvicted(
      read,
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

  /**
   * Stores the run's head and mints a keyframe for every interval the run
   * crossed on its way there. Only the head enters the ring buffer; the
   * earlier revisions are keyframe candidates and nothing more.
   */
  putRun(
    documentId: string,
    scope: string,
    branch: string,
    run: readonly { revision: number; document: PHDocument }[],
  ): void {
    if (run.length === 0) {
      return;
    }

    for (const entry of run.slice(0, -1)) {
      this.persistKeyframe(
        documentId,
        scope,
        branch,
        entry.revision,
        entry.document,
      );
    }

    const head = run[run.length - 1];
    this.store(
      documentId,
      scope,
      branch,
      head.revision,
      head.document,
      SnapshotPosition.Head,
    );
  }

  private storeUnlessEvicted(
    read: PendingRead,
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    position: SnapshotPosition,
  ): void {
    if (!read.evicted) {
      this.store(documentId, scope, branch, revision, document, position);
    }
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
    // full history causes O(n²) array copies across n operations. UNDO and REDO
    // bypass this by forcing a cold-miss rebuild in the job executor.
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

    this.persistKeyframe(documentId, scope, branch, revision, document);
  }

  /** Persists the snapshot if this revision is one the interval falls on. */
  private persistKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
  ): void {
    if (!this.isKeyframeRevision(revision)) {
      return;
    }

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
    for (const read of this.reads.get(documentId) ?? []) {
      read.evicted = true;
    }
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

    this.oweFullReplay(documentId, scope, branch);

    return evicted;
  }

  /**
   * Clears the entire cache, removing all cached document streams.
   * Resets LRU tracking state. This operation always succeeds.
   */
  clear(): void {
    for (const pending of this.reads.values()) {
      for (const read of pending) {
        read.evicted = true;
      }
    }
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

  private oweFullReplay(
    documentId: string,
    scope: string | undefined,
    branch: string | undefined,
  ): void {
    const prefix =
      scope === undefined
        ? `${documentId}:`
        : branch === undefined
          ? `${documentId}:${scope}:`
          : `${this.makeStreamKey(documentId, scope, branch)}:`;

    const marks = (this.fullReplays.get(documentId) ?? []).filter(
      (mark) => !mark.prefix.startsWith(prefix),
    );
    for (const mark of marks) {
      for (const key of mark.done) {
        if (`${key}:`.startsWith(prefix)) {
          mark.done.delete(key);
        }
      }
    }
    marks.push({ prefix, done: new Set() });
    this.fullReplays.set(documentId, marks);
  }

  private owedFullReplays(
    documentId: string,
    streamKey: string,
  ): FullReplayMark[] {
    return (this.fullReplays.get(documentId) ?? []).filter(
      (mark) =>
        `${streamKey}:`.startsWith(mark.prefix) && !mark.done.has(streamKey),
    );
  }

  private settleFullReplays(
    documentId: string,
    streamKey: string,
    settled: FullReplayMark[],
  ): void {
    if (settled.length === 0) {
      return;
    }

    for (const mark of settled) {
      mark.done.add(streamKey);
    }

    const remaining = (this.fullReplays.get(documentId) ?? []).filter(
      (mark) => mark.prefix !== `${streamKey}:` || !mark.done.has(streamKey),
    );
    if (remaining.length === 0) {
      this.fullReplays.delete(documentId);
    } else {
      this.fullReplays.set(documentId, remaining);
    }
  }

  private async findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined> {
    if (targetRevision <= 0) {
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
    fromKeyframe = true,
  ): Promise<PHDocument> {
    const effectiveTargetRevision = targetRevision ?? Number.MAX_SAFE_INTEGER;

    const keyframe = fromKeyframe
      ? await this.findNearestKeyframe(
          documentId,
          scope,
          branch,
          effectiveTargetRevision,
          signal,
        )
      : undefined;

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
      this.assertSupported(documentId, keyframe.document);
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
            pendingUpgrades.push({
              action: upgradeAction,
              upgradePath,
              index: operation.index,
              subsequentDeletes: [],
            });
          }
        } else if (
          operation.action.type === "DELETE_DOCUMENT" ||
          operation.action.type === PURGE_DOCUMENT
        ) {
          applyDeleteDocumentAction(document, operation.action as never);
          for (const pending of pendingUpgrades) {
            pending.subsequentDeletes.push(
              operation.action as DeleteDocumentAction | PurgeDocumentAction,
            );
          }
        }
      }
    } else {
      startRevision = -1;
      const read = await readDocumentScope(
        this.operationStore,
        this.registry,
        this.gate,
        documentId,
        branch,
        documentScopeBound,
        signal,
      );
      document = read.document;
      documentType = read.documentType;
      lastDocumentScopeOperation = read.lastDocumentScopeOperation;
      validatedUpgrades.push(...read.validatedUpgrades);
      pendingUpgrades.push(...read.pendingUpgrades);
    }

    // we rebuild the document scope all the time, so if that is the scope
    // requested, we're already done
    if (scope === "document") {
      document = applyPendingUpgrades(
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

    let needsFullReplay = false;

    if (this.derivesByRule(document.header, scope)) {
      const versions = scopeVersions(
        this.registry,
        document.header,
        scope,
        validatedUpgrades,
        pendingUpgrades,
        finalVersion,
      );

      try {
        const rows = await this.readRows(
          documentId,
          scope,
          branch,
          startRevision,
          targetRevision,
          signal,
        );

        if (keyframe) {
          needsFullReplay = await this.tailNeedsWholeLog(
            documentId,
            scope,
            branch,
            rows,
            signal,
          );
          if (!needsFullReplay) {
            document = appendRows(
              applyRowsByRule(
                document,
                rows,
                (operation) => !isDenied(operation),
                versions,
              ),
              scope,
              rows,
            );
          }
        } else {
          document = appendRows(
            deriveScopeVersioned(document, rows, versions, scope).document,
            scope,
            rows,
          );
        }
      } catch (err) {
        throw rebuildFailure(documentId, err);
      }
    } else {
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

            // A keyframe carries no operations; a skip replays them all.
            if (keyframe && operation.skip > 0) {
              needsFullReplay = true;
              break;
            }

            const moduleVersion = resolveModuleVersionForOp(
              operation.index,
              operation.timestampUtcMs,
              scope,
              validatedUpgrades,
              finalVersion,
            );

            document = applyPendingUpgrades(
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
              const protocolVersion = this.resolver.headerCapabilities(
                document.header,
              ).version;
              document = withProtocolVersions(
                getModuleCached(moduleVersion).reducer(
                  document,
                  operation.action,
                  undefined,
                  {
                    skip: operation.skip,
                    protocolVersion,
                    replayOptions: { operation },
                    skipIndexValidation: true,
                  },
                ),
                document.header.protocolVersions,
              );
            }
          }

          const reachedTarget =
            targetRevision !== undefined &&
            result.results.some((op) => op.index >= targetRevision);
          hasMorePages =
            Boolean(result.nextCursor) && !reachedTarget && !needsFullReplay;

          if (hasMorePages) {
            cursor = result.nextCursor;
          }
        } catch (err) {
          // Wrap errors with context to include document ID for debugging
          throw rebuildFailure(documentId, err);
        }
      } while (hasMorePages);
    }

    if (needsFullReplay) {
      return this.coldMissRebuild(
        documentId,
        scope,
        branch,
        targetRevision,
        signal,
        false,
      );
    }

    document = applyTailPendingUpgrades(
      document,
      pendingUpgrades,
      scope,
      targetRevision,
    );

    document = await this.stampRevisions(
      document,
      documentId,
      scope,
      branch,
      targetRevision,
      signal,
    );

    // A held-back upgrade means this positional state predates it, but the
    // stamped document-scope revision advertises the store head. A snapshot
    // stored from here can become a keyframe, and a rebuild resuming from it
    // trusts that revision to decide where to re-read the document scope —
    // so it must not point past the first upgrade this state never saw.
    if (pendingUpgrades.length > 0) {
      const firstHeldBack = pendingUpgrades[0];
      const stamped = document.header.revision["document"] ?? 0;
      document.header.revision = {
        ...document.header.revision,
        document: Math.min(stamped, firstHeldBack.index),
      };
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

  /** The stored rows after index `after`, through `targetRevision` if given. */
  private async readRows(
    documentId: string,
    scope: string,
    branch: string,
    after: number,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    const rows: Operation[] = [];
    let cursor = "0";
    for (;;) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      const result = await this.operationStore.getSince(
        documentId,
        scope,
        branch,
        after,
        undefined,
        { cursor, limit: 100 },
        signal,
      );
      for (const operation of result.results) {
        if (targetRevision !== undefined && operation.index > targetRevision) {
          return rows;
        }
        rows.push(operation);
      }
      const reachedTarget =
        targetRevision !== undefined &&
        (rows.at(-1)?.index ?? -1) >= targetRevision;
      if (!result.nextCursor || reachedTarget) {
        return rows;
      }
      cursor = result.nextCursor;
    }
  }

  /** Base-reducer 3: whether rows after a base need the whole log (tailAppliesIncrementally). */
  private async tailNeedsWholeLog(
    documentId: string,
    scope: string,
    branch: string,
    rows: readonly Operation[],
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (rows.length === 0) {
      return false;
    }
    const named = await findReferencing(
      this.operationStore,
      documentId,
      scope,
      branch,
      rows.map((operation) => operation.action.id),
      signal,
    );
    return !tailAppliesIncrementally(rows, {
      named: (id) => named.has(id),
    });
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

  private async warmMissRebuild(
    baseDocument: PHDocument,
    baseRevision: number,
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.assertSupported(documentId, baseDocument);
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
    // The base holds one operation per scope; a skip needs them all.
    let needsFullReplay = false;

    // A positional rebuild reads only up to its target: a caller walking a
    // stream revision by revision would otherwise reload the rest of it each time.
    const paging =
      targetRevision !== undefined
        ? { cursor: "0", limit: Math.max(targetRevision - baseRevision, 1) }
        : undefined;

    try {
      if (this.derivesByRule(document.header, scope)) {
        const stateReducer = stateReducerOrRefusal(
          module.reducer,
          documentId,
          documentType,
          extractModuleVersion(baseDocument),
          document.header.protocolVersions,
        );
        const rows = await this.readRows(
          documentId,
          scope,
          branch,
          baseRevision,
          targetRevision,
          signal,
        );
        needsFullReplay = await this.tailNeedsWholeLog(
          documentId,
          scope,
          branch,
          rows,
          signal,
        );
        if (!needsFullReplay) {
          document = appendRows(
            applyRowsByRule(
              document,
              rows,
              (operation) => !isDenied(operation),
              singleVersion(extractModuleVersion(baseDocument), stateReducer),
            ),
            scope,
            rows,
          );
        }
      } else {
        const pagedResults = await this.operationStore.getSince(
          documentId,
          scope,
          branch,
          baseRevision,
          undefined,
          paging,
          signal,
        );

        for (const operation of pagedResults.results) {
          if (signal?.aborted) {
            throw new Error("Operation aborted");
          }

          if (
            targetRevision !== undefined &&
            operation.index > targetRevision
          ) {
            break;
          }

          if (operation.skip > 0) {
            needsFullReplay = true;
            break;
          }

          // A denied operation still carries a potentially valid action, so
          // we must specifically skip without applying.
          if (isDenied(operation)) {
            document = appendWithoutApplying(document, operation, scope);
          } else {
            // Fail-fast: if reducer throws, error propagates immediately without caching partial state
            const protocolVersion = this.resolver.headerCapabilities(
              document.header,
            ).version;
            document = withProtocolVersions(
              module.reducer(document, operation.action, undefined, {
                skip: operation.skip,
                protocolVersion,
                replayOptions: { operation },
                skipIndexValidation: true,
              }),
              document.header.protocolVersions,
            );
          }

          if (
            targetRevision !== undefined &&
            operation.index === targetRevision
          ) {
            break;
          }
        }
      }
    } catch (err) {
      // Wrap errors with context to include document ID for debugging
      throw rebuildFailure(documentId, err);
    }

    if (needsFullReplay) {
      return this.coldMissRebuild(
        documentId,
        scope,
        branch,
        targetRevision,
        signal,
        false,
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
