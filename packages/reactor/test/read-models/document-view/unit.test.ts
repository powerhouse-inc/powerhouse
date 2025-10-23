import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyDocumentView } from "../../../src/read-models/document-view.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";

describe("KyselyDocumentView Unit Tests", () => {
  let view: KyselyDocumentView;
  let mockDb: any;
  let mockOperationStore: IOperationStore;

  beforeEach(() => {
    mockDb = createMockKyselyDb();

    mockOperationStore = {
      apply: vi.fn(),
      getSince: vi.fn(),
      getSinceId: vi.fn(),
      getRevisions: vi.fn(),
    };

    view = new KyselyDocumentView(mockDb, mockOperationStore);
  });

  function createMockKyselyDb(): Kysely<any> {
    const mockQueryBuilder: any = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      distinct: vi.fn().mockReturnThis(),
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

      await expect(view.exists(["doc-1"], controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("get", () => {
    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        view.get("doc-1", undefined, controller.signal),
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
          content: JSON.stringify({ id: "doc-1", documentType: "test" }),
        },
        {
          documentId: "doc-1",
          scope: "document",
          content: JSON.stringify({ isDeleted: false }),
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
        document: [{ index: 0 }],
      } as any);

      await expect(view.get("doc-1")).rejects.toThrow();

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
