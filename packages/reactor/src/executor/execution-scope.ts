import type { Kysely, Transaction } from "kysely";
import type { CollectionMembershipCache } from "../cache/collection-membership-cache.js";
import type { DocumentMetaCache } from "../cache/document-meta-cache.js";
import type { KyselyOperationIndex } from "../cache/kysely-operation-index.js";
import type { KyselyWriteCache } from "../cache/kysely-write-cache.js";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
import type { IOperationStore } from "../storage/interfaces.js";
import type { KyselyOperationStore } from "../storage/kysely/store.js";
import type { KyselyKeyframeStore } from "../storage/kysely/keyframe-store.js";
import type { Database } from "../storage/kysely/types.js";

export interface ExecutionStores {
  operationStore: IOperationStore;
  operationIndex: IOperationIndex;
  writeCache: IWriteCache;
  documentMetaCache: IDocumentMetaCache;
  collectionMembershipCache: ICollectionMembershipCache;
}

export interface IExecutionScope {
  run<T>(fn: (stores: ExecutionStores) => Promise<T>): Promise<T>;
}

export class DefaultExecutionScope implements IExecutionScope {
  constructor(
    private operationStore: IOperationStore,
    private operationIndex: IOperationIndex,
    private writeCache: IWriteCache,
    private documentMetaCache: IDocumentMetaCache,
    private collectionMembershipCache: ICollectionMembershipCache,
  ) {}

  async run<T>(fn: (stores: ExecutionStores) => Promise<T>): Promise<T> {
    return fn({
      operationStore: this.operationStore,
      operationIndex: this.operationIndex,
      writeCache: this.writeCache,
      documentMetaCache: this.documentMetaCache,
      collectionMembershipCache: this.collectionMembershipCache,
    });
  }
}

export class KyselyExecutionScope implements IExecutionScope {
  constructor(
    private db: Kysely<Database>,
    private operationStore: KyselyOperationStore,
    private operationIndex: KyselyOperationIndex,
    private keyframeStore: KyselyKeyframeStore,
    private writeCache: KyselyWriteCache,
    private documentMetaCache: DocumentMetaCache,
    private collectionMembershipCache: CollectionMembershipCache,
  ) {}

  async run<T>(fn: (stores: ExecutionStores) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx: Transaction<Database>) => {
      const scopedOperationStore = this.operationStore.withTransaction(trx);
      const scopedOperationIndex = this.operationIndex.withTransaction(trx);
      const scopedKeyframeStore = this.keyframeStore.withTransaction(trx);
      return fn({
        operationStore: scopedOperationStore,
        operationIndex: scopedOperationIndex,
        writeCache: this.writeCache.withScopedStores(
          scopedOperationStore,
          scopedKeyframeStore,
        ),
        documentMetaCache:
          this.documentMetaCache.withScopedStore(scopedOperationStore),
        collectionMembershipCache:
          this.collectionMembershipCache.withScopedIndex(scopedOperationIndex),
      });
    });
  }
}
