import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { IConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";

describe("KyselyDocumentView Unit Tests", () => {
  let view: KyselyDocumentView;
  let mockDb: any;
  let mockOperationStore: IOperationStore;
  let mockOperationIndex: IOperationIndex;
  let mockWriteCache: IWriteCache;
  let mockConsistencyTracker: IConsistencyTracker;

  beforeEach(() => {
    mockDb = createMockKyselyDb();

    mockOperationStore = {
      apply: vi.fn(),
      getSince: vi.fn(),
      getSinceId: vi.fn(),
      getConflicting: vi.fn(),
      getRevisions: vi.fn(),
    };

    mockOperationIndex = {
      start: vi.fn(),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      getSinceOrdinal: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
    };

    mockWriteCache = {
      getState: vi.fn().mockResolvedValue({}),
      putState: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    mockConsistencyTracker = {
      update: vi.fn(),
      getLatest: vi.fn(),
      waitFor: vi.fn().mockResolvedValue(undefined),
      serialize: vi.fn(),
      hydrate: vi.fn(),
    };

    view = new KyselyDocumentView(
      mockDb,
      mockOperationStore,
      mockOperationIndex,
      mockWriteCache,
      mockConsistencyTracker,
    );
  });

  function createMockKyselyDb(): Kysely<any> {
    const mockQueryBuilder: any = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      distinct: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      executeTakeFirst: vi.fn(),
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      transaction: vi.fn(),
      schema: {
        createTable: vi.fn().mockReturnThis(),
        ifNotExists: vi.fn().mockReturnThis(),
        addColumn: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      },
    };

    return mockQueryBuilder as Kysely<any>;
  }

  describe("exists", () => {
    it("should return empty array for empty input", async () => {
      const result = await view.exists([]);
      expect(result).toEqual([]);
    });

    it("should query database for document existence", async () => {
      mockDb.execute.mockResolvedValue([
        { documentId: "doc-1" },
        { documentId: "doc-3" },
      ]);

      const result = await view.exists(["doc-1", "doc-2", "doc-3"]);

      expect(mockDb.selectFrom).toHaveBeenCalledWith("DocumentSnapshot");
      expect(mockDb.where).toHaveBeenCalledWith("documentId", "in", [
        "doc-1",
        "doc-2",
        "doc-3",
      ]);
      expect(mockDb.where).toHaveBeenCalledWith("isDeleted", "=", false);
      expect(result).toEqual([true, false, true]);
    });

    it("should handle all documents existing", async () => {
      mockDb.execute.mockResolvedValue([
        { documentId: "doc-1" },
        { documentId: "doc-2" },
      ]);

      const result = await view.exists(["doc-1", "doc-2"]);

      expect(result).toEqual([true, true]);
    });

    it("should handle no documents existing", async () => {
      mockDb.execute.mockResolvedValue([]);

      const result = await view.exists(["doc-1", "doc-2"]);

      expect(result).toEqual([false, false]);
    });

    it("should handle duplicate IDs in input", async () => {
      mockDb.execute.mockResolvedValue([{ documentId: "doc-1" }]);

      const result = await view.exists(["doc-1", "doc-1", "doc-2"]);

      expect(result).toEqual([true, true, false]);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.exists(["doc-1"], undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("get", () => {
    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.get("doc-1", undefined, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should use main branch by default", async () => {
      mockDb.execute.mockResolvedValue([]);

      await expect(view.get("doc-1")).rejects.toThrow();

      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "main");
    });

    it("should use specified branch from view filter", async () => {
      mockDb.execute.mockResolvedValue([]);

      await expect(view.get("doc-1", { branch: "feature" })).rejects.toThrow();

      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "feature");
    });

    it("should query for document by ID", async () => {
      mockDb.execute.mockResolvedValue([]);

      await expect(view.get("doc-123")).rejects.toThrow();

      expect(mockDb.selectFrom).toHaveBeenCalledWith("DocumentSnapshot");
      expect(mockDb.where).toHaveBeenCalledWith("documentId", "=", "doc-123");
      expect(mockDb.where).toHaveBeenCalledWith("isDeleted", "=", false);
    });

    it("should throw when document not found", async () => {
      mockDb.execute.mockResolvedValue([]);

      await expect(view.get("non-existent")).rejects.toThrow(
        "Document not found: non-existent",
      );
    });

    it("should query all scopes when view.scopes is not specified", async () => {
      mockDb.execute.mockResolvedValue([
        {
          documentId: "doc-1",
          scope: "header",
          content: { id: "doc-1", documentType: "test" },
        },
        {
          documentId: "doc-1",
          scope: "document",
          content: { isDeleted: false },
        },
      ]);

      mockDb.selectFrom.mockReturnValue({
        selectAll: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                execute: mockDb.execute,
              }),
            }),
          }),
        }),
      });

      vi.mocked(mockOperationStore.getRevisions).mockResolvedValue({
        revision: {},
        latestTimestamp: new Date().toISOString(),
      });

      const result = await view.get("doc-1");
      expect(result).toBeDefined();
      expect(result.operations).toEqual({});

      expect(mockDb.where).not.toHaveBeenCalledWith(
        "scope",
        "in",
        expect.anything(),
      );
    });

    it("should include header and document scopes even when specific scopes requested", async () => {
      mockDb.execute.mockResolvedValue([]);

      await expect(view.get("doc-1", { scopes: ["global"] })).rejects.toThrow();

      // Should query for header, document, and global
      expect(mockDb.where).toHaveBeenCalledWith(
        "scope",
        "in",
        expect.arrayContaining(["header", "document", "global"]),
      );
    });
  });

  describe("indexOperations", () => {
    it("should return early for empty items array", async () => {
      await view.indexOperations([]);

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  describe("findByType", () => {
    beforeEach(() => {
      mockDb.execute.mockResolvedValue([]);
      mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
        revision: {},
        latestTimestamp: new Date().toISOString(),
      });
      mockOperationStore.getSinceId = vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });
    });

    it("should query by type and return empty results for no matches", async () => {
      mockDb.execute.mockResolvedValue([]);

      const result = await view.findByType("test-type");

      expect(mockDb.selectFrom).toHaveBeenCalledWith("DocumentSnapshot");
      expect(mockDb.where).toHaveBeenCalledWith(
        "documentType",
        "=",
        "test-type",
      );
      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "main");
      expect(mockDb.where).toHaveBeenCalledWith("isDeleted", "=", false);
      expect(mockDb.orderBy).toHaveBeenCalledWith("lastUpdatedAt", "desc");
      expect(result.results).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should apply view filter for branch", async () => {
      mockDb.execute.mockResolvedValue([]);

      await view.findByType("test-type", { branch: "feature" });

      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "feature");
    });

    it("should apply pagination with cursor and limit", async () => {
      const snapshots = [
        {
          documentId: "doc-1",
          scope: "header",
          content: { id: "doc-1", documentType: "test-type" },
        },
        {
          documentId: "doc-2",
          scope: "header",
          content: { id: "doc-2", documentType: "test-type" },
        },
        {
          documentId: "doc-3",
          scope: "header",
          content: { id: "doc-3", documentType: "test-type" },
        },
      ];
      mockDb.execute.mockResolvedValue(snapshots);

      const result = await view.findByType("test-type", undefined, {
        cursor: "1",
        limit: 1,
      });

      expect(result.results).toHaveLength(1);
      expect(result.nextCursor).toBe("2");
    });

    it("should handle consistencyToken by calling waitForConsistency", async () => {
      const token = {
        version: 1 as const,
        createdAtUtcIso: "2023-01-01",
        coordinates: [
          {
            documentId: "doc-1",
            scope: "global",
            branch: "main",
            ordinal: 1,
            operationIndex: 0,
          },
        ],
      };

      await view.findByType("test-type", undefined, undefined, token);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        [
          {
            documentId: "doc-1",
            scope: "global",
            branch: "main",
            ordinal: 1,
            operationIndex: 0,
          },
        ],
        undefined,
        undefined,
      );
    });

    it("should respect abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.findByType(
          "test-type",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should return proper pagination info when hasMore is false", async () => {
      const snapshots = [
        {
          documentId: "doc-1",
          scope: "header",
          content: { id: "doc-1", documentType: "test-type" },
        },
      ];
      mockDb.execute.mockResolvedValue(snapshots);

      const result = await view.findByType("test-type", undefined, {
        cursor: "0",
        limit: 10,
      });

      expect(result.nextCursor).toBeUndefined();
    });

    it("should deduplicate documents when multiple scopes exist", async () => {
      const snapshots = [
        {
          documentId: "doc-1",
          scope: "header",
          content: { id: "doc-1", documentType: "test-type" },
          branch: "main",
          ordinal: 1,
          isDeleted: false,
          documentType: "test-type",
          lastUpdatedAt: new Date(),
        },
        {
          documentId: "doc-1",
          scope: "document",
          content: {},
          branch: "main",
          ordinal: 1,
          isDeleted: false,
          documentType: "test-type",
          lastUpdatedAt: new Date(),
        },
        {
          documentId: "doc-2",
          scope: "header",
          content: { id: "doc-2", documentType: "test-type" },
          branch: "main",
          ordinal: 1,
          isDeleted: false,
          documentType: "test-type",
          lastUpdatedAt: new Date(),
        },
      ];
      mockDb.execute.mockResolvedValue(snapshots);

      vi.spyOn(view, "get").mockResolvedValue({
        header: { id: "doc-1", documentType: "test-type" },
        state: {},
        operations: {},
        initialState: {},
        clipboard: [],
      } as any);

      const result = await view.findByType("test-type");

      expect(result.results).toHaveLength(2);
    });

    it("should skip documents that fail to retrieve", async () => {
      const snapshots = [
        {
          documentId: "doc-1",
          scope: "header",
          content: { id: "doc-1", documentType: "test-type" },
          branch: "main",
          ordinal: 1,
          isDeleted: false,
          documentType: "test-type",
          lastUpdatedAt: new Date(),
        },
      ];
      mockDb.execute.mockResolvedValue(snapshots);

      vi.spyOn(view, "get").mockRejectedValue(new Error("Document not found"));

      const result = await view.findByType("test-type");

      expect(result.results).toHaveLength(0);
    });

    it("should handle default limit of 100", async () => {
      const snapshots = Array.from({ length: 150 }, (_, i) => ({
        documentId: `doc-${i}`,
        scope: "header",
        content: { id: `doc-${i}`, documentType: "test-type" },
      }));
      mockDb.execute.mockResolvedValue(snapshots);

      const result = await view.findByType("test-type");

      expect(result.nextCursor).toBe("100");
    });

    it("should check abort signal after database query", async () => {
      const controller = new AbortController();
      mockDb.execute.mockImplementation(() => {
        controller.abort();
        return Promise.resolve([]);
      });

      await expect(
        view.findByType(
          "test-type",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("resolveSlug", () => {
    it("should resolve slug to documentId", async () => {
      mockDb.executeTakeFirst.mockResolvedValue({ documentId: "doc-123" });

      const result = await view.resolveSlug("my-slug");

      expect(mockDb.selectFrom).toHaveBeenCalledWith("SlugMapping");
      expect(mockDb.select).toHaveBeenCalledWith("documentId");
      expect(mockDb.where).toHaveBeenCalledWith("slug", "=", "my-slug");
      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "main");
      expect(result).toBe("doc-123");
    });

    it("should return undefined for non-existent slug", async () => {
      mockDb.executeTakeFirst.mockResolvedValue(undefined);

      const result = await view.resolveSlug("non-existent-slug");

      expect(result).toBeUndefined();
    });

    it("should apply view filter for branch", async () => {
      mockDb.executeTakeFirst.mockResolvedValue({ documentId: "doc-123" });

      await view.resolveSlug("my-slug", { branch: "feature" });

      expect(mockDb.where).toHaveBeenCalledWith("branch", "=", "feature");
    });

    it("should handle consistencyToken by calling waitForConsistency", async () => {
      const token = {
        version: 1 as const,
        createdAtUtcIso: "2023-01-01",
        coordinates: [
          {
            documentId: "doc-1",
            scope: "global",
            branch: "main",
            ordinal: 1,
            operationIndex: 0,
          },
        ],
      };
      mockDb.executeTakeFirst.mockResolvedValue({ documentId: "doc-123" });

      await view.resolveSlug("my-slug", undefined, token);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        [
          {
            documentId: "doc-1",
            scope: "global",
            branch: "main",
            ordinal: 1,
            operationIndex: 0,
          },
        ],
        undefined,
        undefined,
      );
    });

    it("should respect abort signal before query", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.resolveSlug("my-slug", undefined, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should respect abort signal after query", async () => {
      const controller = new AbortController();
      mockDb.executeTakeFirst.mockImplementation(() => {
        controller.abort();
        return Promise.resolve({ documentId: "doc-123" });
      });

      await expect(
        view.resolveSlug("my-slug", undefined, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should check scope filter if view.scopes provided", async () => {
      mockDb.executeTakeFirst
        .mockResolvedValueOnce({ documentId: "doc-123" })
        .mockResolvedValueOnce({ scope: "global" });

      const result = await view.resolveSlug("my-slug", { scopes: ["global"] });

      expect(mockDb.selectFrom).toHaveBeenCalledWith("DocumentSnapshot");
      expect(mockDb.where).toHaveBeenCalledWith("documentId", "=", "doc-123");
      expect(mockDb.where).toHaveBeenCalledWith("scope", "in", ["global"]);
      expect(result).toBe("doc-123");
    });

    it("should return undefined if scope check fails", async () => {
      mockDb.executeTakeFirst
        .mockResolvedValueOnce({ documentId: "doc-123" })
        .mockResolvedValueOnce(undefined);

      const result = await view.resolveSlug("my-slug", { scopes: ["global"] });

      expect(result).toBeUndefined();
    });

    it("should handle empty string slug", async () => {
      mockDb.executeTakeFirst.mockResolvedValue(undefined);

      const result = await view.resolveSlug("");

      expect(mockDb.where).toHaveBeenCalledWith("slug", "=", "");
      expect(result).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle database query errors in exists", async () => {
      const error = new Error("Database error");
      mockDb.execute.mockRejectedValue(error);

      await expect(view.exists(["doc-1"])).rejects.toThrow("Database error");
    });

    it("should handle database query errors in get", async () => {
      const error = new Error("Database error");
      mockDb.execute.mockRejectedValue(error);

      await expect(view.get("doc-1")).rejects.toThrow("Database error");
    });
  });
});
