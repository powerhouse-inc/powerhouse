import type {
  CreateDocumentAction,
  DeleteDocumentAction,
  PHDocumentState,
  UpgradeDocumentAction,
} from "document-model";
import type { IOperationStore } from "../storage/interfaces.js";
import type {
  CachedDocumentMeta,
  DocumentMetaCacheConfig,
  IDocumentMetaCache,
} from "./document-meta-cache-types.js";
import { LRUTracker } from "./lru/lru-tracker.js";

/**
 * In-memory document metadata cache with LRU eviction.
 *
 * Caches PHDocumentState per (documentId, branch) key. On cache miss,
 * rebuilds from document scope operations. Provides an explicit cross-scope
 * contract for accessing document scope metadata.
 *
 * **Thread Safety:**
 * Not thread-safe. Designed for single-threaded job executor environment.
 */
export class DocumentMetaCache implements IDocumentMetaCache {
  private cache: Map<string, CachedDocumentMeta>;
  private lruTracker: LRUTracker<string>;
  private operationStore: IOperationStore;
  private config: Required<DocumentMetaCacheConfig>;

  constructor(
    operationStore: IOperationStore,
    config: DocumentMetaCacheConfig,
  ) {
    this.operationStore = operationStore;
    this.config = {
      maxDocuments: config.maxDocuments,
    };
    this.cache = new Map();
    this.lruTracker = new LRUTracker<string>();
  }

  async startup(): Promise<void> {
    return Promise.resolve();
  }

  async shutdown(): Promise<void> {
    return Promise.resolve();
  }

  async getDocumentMeta(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const key = this.makeKey(documentId, branch);
    const cached = this.cache.get(key);

    if (cached) {
      this.lruTracker.touch(key);
      return cached;
    }

    const meta = await this.rebuildLatest(documentId, branch, signal);
    this.putDocumentMeta(documentId, branch, meta);
    return meta;
  }

  async rebuildAtRevision(
    documentId: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    return this.rebuildFromOperations(
      documentId,
      branch,
      targetRevision,
      signal,
    );
  }

  putDocumentMeta(
    documentId: string,
    branch: string,
    meta: CachedDocumentMeta,
  ): void {
    const key = this.makeKey(documentId, branch);

    if (!this.cache.has(key) && this.cache.size >= this.config.maxDocuments) {
      const evictKey = this.lruTracker.evict();
      if (evictKey) {
        this.cache.delete(evictKey);
      }
    }

    this.cache.set(key, structuredClone(meta));
    this.lruTracker.touch(key);
  }

  invalidate(documentId: string, branch?: string): number {
    let evicted = 0;

    if (branch === undefined) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${documentId}:`)) {
          this.cache.delete(key);
          this.lruTracker.remove(key);
          evicted++;
        }
      }
    } else {
      const key = this.makeKey(documentId, branch);
      if (this.cache.has(key)) {
        this.cache.delete(key);
        this.lruTracker.remove(key);
        evicted = 1;
      }
    }

    return evicted;
  }

  clear(): void {
    this.cache.clear();
    this.lruTracker.clear();
  }

  private makeKey(documentId: string, branch: string): string {
    return `${documentId}:${branch}`;
  }

  private async rebuildLatest(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta> {
    return this.rebuildFromOperations(documentId, branch, undefined, signal);
  }

  private async rebuildFromOperations(
    documentId: string,
    branch: string,
    targetRevision: number | undefined,
    signal?: AbortSignal,
  ): Promise<CachedDocumentMeta> {
    const docScopeOps = await this.operationStore.getSince(
      documentId,
      "document",
      branch,
      -1,
      undefined,
      signal,
    );

    if (docScopeOps.items.length === 0) {
      throw new Error(`Document ${documentId} not found`);
    }

    const createOp = docScopeOps.items[0];
    if (createOp.action.type !== "CREATE_DOCUMENT") {
      throw new Error(
        `Invalid document: first operation must be CREATE_DOCUMENT, found ${createOp.action.type}`,
      );
    }

    const createAction = createOp.action as CreateDocumentAction;
    const documentType = createAction.input.model;

    let state: PHDocumentState = {
      version: "0.0.0",
      hash: { algorithm: "sha256", encoding: "base64" },
    };
    let documentScopeRevision = 0;

    for (const op of docScopeOps.items) {
      if (targetRevision !== undefined && op.index > targetRevision) {
        break;
      }

      documentScopeRevision = op.index;

      if (op.action.type === "UPGRADE_DOCUMENT") {
        const upgradeAction = op.action as UpgradeDocumentAction;
        const input = upgradeAction.input as {
          initialState?: { document?: PHDocumentState };
          state?: { document?: PHDocumentState };
        };
        const newDocState =
          input.initialState?.document || input.state?.document;
        if (newDocState) {
          state = {
            ...state,
            ...newDocState,
          };
        }
      } else if (op.action.type === "DELETE_DOCUMENT") {
        const deleteAction = op.action as DeleteDocumentAction;
        state = {
          ...state,
          isDeleted: true,
          deletedAtUtcIso: deleteAction.timestampUtcMs,
        };
      }
    }

    return {
      state,
      documentType,
      documentScopeRevision: documentScopeRevision + 1,
    };
  }
}
