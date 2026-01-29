import {
  deriveOperationId,
  generateId,
  type Action,
  type Operation,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentMetaCacheConfig } from "../../src/cache/document-meta-cache-types.js";
import { DocumentMetaCache } from "../../src/cache/document-meta-cache.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";

function createMockOperationStore(): IOperationStore {
  return {
    apply: vi.fn(),
    getSince: vi.fn(),
    getSinceId: vi.fn(),
    getConflicting: vi.fn(),
    getRevisions: vi.fn(),
  };
}

function createCreateDocumentOperation(
  documentId: string,
  documentType: string,
): Operation {
  const actionId = generateId();
  return {
    id: deriveOperationId(documentId, "document", "main", actionId),
    index: 0,
    skip: 0,
    hash: "",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    action: {
      id: actionId,
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId,
        model: documentType,
        version: 0,
      },
    } as Action,
    resultingState: JSON.stringify({ document: { id: documentId } }),
  };
}

function createUpgradeDocumentOperation(
  documentId: string,
  index: number,
  version: number,
): Operation {
  const actionId = generateId();
  return {
    id: deriveOperationId(documentId, "document", "main", actionId),
    index,
    skip: 0,
    hash: `hash-upgrade-${index}`,
    timestampUtcMs: `2024-01-01T00:0${index}:00.000Z`,
    action: {
      id: actionId,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: `2024-01-01T00:0${index}:00.000Z`,
      input: {
        documentId,
        fromVersion: version > 0 ? version - 1 : 0,
        toVersion: version,
        initialState: {
          document: {
            version,
            hash: { algorithm: "sha256", encoding: "base64" },
          },
        },
      },
    } as Action,
    resultingState: JSON.stringify({ document: { id: documentId, version } }),
  };
}

function createDeleteDocumentOperation(
  documentId: string,
  index: number,
): Operation {
  const actionId = generateId();
  return {
    id: deriveOperationId(documentId, "document", "main", actionId),
    index,
    skip: 0,
    hash: `hash-delete-${index}`,
    timestampUtcMs: `2024-01-01T00:0${index}:00.000Z`,
    action: {
      id: actionId,
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: `2024-01-01T00:0${index}:00.000Z`,
      input: {
        documentId,
      },
    } as Action,
    resultingState: JSON.stringify({
      document: { id: documentId, isDeleted: true },
    }),
  };
}

describe("DocumentMetaCache", () => {
  let cache: DocumentMetaCache;
  let operationStore: IOperationStore;
  let config: DocumentMetaCacheConfig;

  beforeEach(() => {
    operationStore = createMockOperationStore();
    config = {
      maxDocuments: 3,
    };
    cache = new DocumentMetaCache(operationStore, config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getDocumentMeta", () => {
    it("should return cached metadata on cache hit", async () => {
      const docId = "test-doc-1";
      const branch = "main";

      cache.putDocumentMeta(docId, branch, {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      });

      const result = await cache.getDocumentMeta(docId, branch);

      expect(result.state.version).toBe(1);
      expect(result.documentType).toBe("powerhouse/test");
      expect(operationStore.getSince).not.toHaveBeenCalled();
    });

    it("should rebuild from operations on cache miss", async () => {
      const docId = "test-doc-2";
      const branch = "main";
      const docType = "powerhouse/test";

      const operations: Operation[] = [
        createCreateDocumentOperation(docId, docType),
        createUpgradeDocumentOperation(docId, 1, 1),
      ];

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: operations,
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      const result = await cache.getDocumentMeta(docId, branch);

      expect(result.state.version).toBe(1);
      expect(result.documentType).toBe(docType);
      expect(result.documentScopeRevision).toBe(2);
      expect(operationStore.getSince).toHaveBeenCalledWith(
        docId,
        "document",
        branch,
        -1,
        undefined,
        undefined,
        undefined,
      );
    });

    it("should throw error if document not found", async () => {
      const docId = "nonexistent-doc";
      const branch = "main";

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      await expect(cache.getDocumentMeta(docId, branch)).rejects.toThrow(
        `Document ${docId} not found`,
      );
    });

    it("should throw error if first operation is not CREATE_DOCUMENT", async () => {
      const docId = "invalid-doc";
      const branch = "main";

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: [createUpgradeDocumentOperation(docId, 0, 1)],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      await expect(cache.getDocumentMeta(docId, branch)).rejects.toThrow(
        "Invalid document: first operation must be CREATE_DOCUMENT",
      );
    });

    it("should handle DELETE_DOCUMENT operations", async () => {
      const docId = "deleted-doc";
      const branch = "main";
      const docType = "powerhouse/test";

      const operations: Operation[] = [
        createCreateDocumentOperation(docId, docType),
        createUpgradeDocumentOperation(docId, 1, 1),
        createDeleteDocumentOperation(docId, 2),
      ];

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: operations,
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      const result = await cache.getDocumentMeta(docId, branch);

      expect(result.state.isDeleted).toBe(true);
      expect(result.state.deletedAtUtcIso).toBeDefined();
      expect(result.documentScopeRevision).toBe(3);
    });

    it("should throw on aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.getDocumentMeta("doc", "main", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("rebuildAtRevision", () => {
    it("should rebuild metadata at specific revision", async () => {
      const docId = "test-doc-revision";
      const branch = "main";
      const docType = "powerhouse/test";

      const operations: Operation[] = [
        createCreateDocumentOperation(docId, docType),
        createUpgradeDocumentOperation(docId, 1, 1),
        createUpgradeDocumentOperation(docId, 2, 2),
        createUpgradeDocumentOperation(docId, 3, 3),
      ];

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: operations,
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      const resultAtRev1 = await cache.rebuildAtRevision(docId, branch, 1);
      expect(resultAtRev1.state.version).toBe(1);
      expect(resultAtRev1.documentScopeRevision).toBe(2);

      const resultAtRev2 = await cache.rebuildAtRevision(docId, branch, 2);
      expect(resultAtRev2.state.version).toBe(2);
      expect(resultAtRev2.documentScopeRevision).toBe(3);
    });

    it("should not cache results from rebuildAtRevision", async () => {
      const docId = "test-doc-no-cache";
      const branch = "main";
      const docType = "powerhouse/test";

      const operations: Operation[] = [
        createCreateDocumentOperation(docId, docType),
        createUpgradeDocumentOperation(docId, 1, 1),
      ];

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: operations,
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      await cache.rebuildAtRevision(docId, branch, 1);

      await cache.getDocumentMeta(docId, branch);
      expect(operationStore.getSince).toHaveBeenCalledTimes(2);
    });

    it("should throw on aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.rebuildAtRevision("doc", "main", 1, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("putDocumentMeta", () => {
    it("should store metadata and allow retrieval", async () => {
      const docId = "put-test-doc";
      const branch = "main";

      cache.putDocumentMeta(docId, branch, {
        state: {
          version: 2,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 5,
      });

      const result = await cache.getDocumentMeta(docId, branch);
      expect(result.state.version).toBe(2);
      expect(result.documentScopeRevision).toBe(5);
    });

    it("should deep copy metadata on put", async () => {
      const docId = "deep-copy-doc";
      const branch = "main";

      const meta = {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      };

      cache.putDocumentMeta(docId, branch, meta);
      meta.state.version = 999;

      const result = await cache.getDocumentMeta(docId, branch);
      expect(result.state.version).toBe(1);
    });
  });

  describe("LRU eviction", () => {
    it("should evict LRU entry when at capacity", () => {
      const meta = {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      };

      cache.putDocumentMeta("doc1", "main", meta);
      cache.putDocumentMeta("doc2", "main", meta);
      cache.putDocumentMeta("doc3", "main", meta);

      cache.putDocumentMeta("doc4", "main", meta);

      const evicted = cache.invalidate("doc1", "main");
      expect(evicted).toBe(0);

      const stillCached = cache.invalidate("doc4", "main");
      expect(stillCached).toBe(1);
    });

    it("should update LRU on access", async () => {
      const meta = {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      };

      cache.putDocumentMeta("doc1", "main", meta);
      cache.putDocumentMeta("doc2", "main", meta);
      cache.putDocumentMeta("doc3", "main", meta);

      await cache.getDocumentMeta("doc1", "main");

      cache.putDocumentMeta("doc4", "main", meta);

      const doc1Evicted = cache.invalidate("doc1", "main");
      expect(doc1Evicted).toBe(1);

      const doc2Evicted = cache.invalidate("doc2", "main");
      expect(doc2Evicted).toBe(0);
    });
  });

  describe("invalidate", () => {
    it("should invalidate specific document+branch", () => {
      const meta = {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      };

      cache.putDocumentMeta("doc1", "main", meta);
      cache.putDocumentMeta("doc1", "feature", meta);
      cache.putDocumentMeta("doc2", "main", meta);

      const evicted = cache.invalidate("doc1", "main");
      expect(evicted).toBe(1);

      const featureStillCached = cache.invalidate("doc1", "feature");
      expect(featureStillCached).toBe(1);
    });

    it("should invalidate all branches for document when branch not specified", () => {
      const largerConfig: DocumentMetaCacheConfig = { maxDocuments: 10 };
      const largerCache = new DocumentMetaCache(operationStore, largerConfig);

      const meta = {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: "powerhouse/test",
        documentScopeRevision: 1,
      };

      largerCache.putDocumentMeta("doc1", "main", meta);
      largerCache.putDocumentMeta("doc1", "feature", meta);
      largerCache.putDocumentMeta("doc1", "develop", meta);
      largerCache.putDocumentMeta("doc2", "main", meta);

      const evicted = largerCache.invalidate("doc1");
      expect(evicted).toBe(3);

      const doc2StillCached = largerCache.invalidate("doc2", "main");
      expect(doc2StillCached).toBe(1);
    });
  });

  describe("clear", () => {
    it("should clear all cached entries", async () => {
      const docType = "powerhouse/test";

      vi.mocked(operationStore.getSince).mockResolvedValue({
        results: [
          createCreateDocumentOperation("doc1", docType),
          createUpgradeDocumentOperation("doc1", 1, 1),
        ],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      cache.putDocumentMeta("doc1", "main", {
        state: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        documentType: docType,
        documentScopeRevision: 1,
      });

      cache.clear();

      await cache.getDocumentMeta("doc1", "main");
      expect(operationStore.getSince).toHaveBeenCalled();
    });
  });
});
