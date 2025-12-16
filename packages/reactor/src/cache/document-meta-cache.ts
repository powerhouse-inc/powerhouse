import type {
  CreateDocumentAction,
  DeleteDocumentAction,
  UpgradeDocumentAction,
} from "document-model";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  createDocumentFromAction,
} from "../executor/util.js";
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
  private config: DocumentMetaCacheConfig;

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

    let document = createDocumentFromAction(createAction);
    let documentScopeRevision = 0;

    for (const op of docScopeOps.items) {
      if (targetRevision !== undefined && op.index > targetRevision) {
        break;
      }

      documentScopeRevision = op.index;

      if (op.action.type === "UPGRADE_DOCUMENT") {
        document = applyUpgradeDocumentAction(
          document,
          op.action as UpgradeDocumentAction,
        );
      } else if (op.action.type === "DELETE_DOCUMENT") {
        document = applyDeleteDocumentAction(
          document,
          op.action as DeleteDocumentAction,
        );
      }

      // for now, we are skipping relationship operations
    }

    return {
      state: document.state.document,
      documentType,
      documentScopeRevision: documentScopeRevision + 1,
    };
  }
}
