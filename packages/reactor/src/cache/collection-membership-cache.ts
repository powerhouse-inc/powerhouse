import type { IOperationIndex } from "./operation-index-types.js";

/**
 * The read half of membership lookup. `IOperationIndex` satisfies it
 * directly, so a caller that must not serve a stale answer can depend on
 * this and be handed the index instead of a cache.
 */
export interface ICollectionMembershipReader {
  // Get collections for documents (lazy load from index if not cached)
  getCollectionsForDocuments(
    documentIds: string[],
  ): Promise<Record<string, string[]>>;
}

export interface ICollectionMembershipCache extends ICollectionMembershipReader {
  // Invalidate a document's cache entry (when membership changes)
  invalidate(documentId: string): void;
}

export class CollectionMembershipCache implements ICollectionMembershipCache {
  private cache: Map<string, string[]> = new Map();

  constructor(private operationIndex: IOperationIndex) {}

  withScopedIndex(operationIndex: IOperationIndex): CollectionMembershipCache {
    const scoped = new CollectionMembershipCache(operationIndex);
    scoped.cache = this.cache;
    return scoped;
  }

  async getCollectionsForDocuments(
    documentIds: string[],
  ): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const missing: string[] = [];

    for (const docId of documentIds) {
      const cached = this.cache.get(docId);
      if (cached !== undefined) {
        result[docId] = cached;
      } else {
        missing.push(docId);
      }
    }

    if (missing.length > 0) {
      const fromDb =
        await this.operationIndex.getCollectionsForDocuments(missing);
      for (const docId of missing) {
        const collections = fromDb[docId] ?? [];
        result[docId] = collections;
        this.cache.set(docId, collections);
      }
    }

    return result;
  }

  invalidate(documentId: string): void {
    this.cache.delete(documentId);
  }
}
