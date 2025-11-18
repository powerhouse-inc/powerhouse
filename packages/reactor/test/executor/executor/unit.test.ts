import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { SimpleJobExecutor } from "../../../src/executor/simple-job-executor.js";
import type { Job } from "../../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import {
  createMockDocumentStorage,
  createMockOperationStorage,
  createMockOperationStore,
  createTestEventBus,
  createTestRegistry,
} from "../../factories.js";

describe("SimpleJobExecutor", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let mockDocStorage: IDocumentStorage;
  let mockOperationStorage: IDocumentOperationStorage;
  let mockOperationStore: IOperationStore;

  beforeEach(() => {
    // Setup registry with real document model
    registry = createTestRegistry([documentModelDocumentModelModule]);

    // Setup mock document storage with additional mock for operations/state structure
    mockDocStorage = createMockDocumentStorage({
      get: vi.fn().mockImplementation((docId) =>
        Promise.resolve({
          header: {
            id: docId,
            documentType: "powerhouse/document-model",
            revision: { document: 1 },
          },
          operations: {
            document: [
              {
                index: 0,
                action: {
                  type: "CREATE_DOCUMENT",
                  id: "create-action",
                  scope: "document",
                  timestampUtcMs: "1234567890",
                  input: {
                    documentId: docId,
                    model: "powerhouse/document-model",
                  },
                },
              },
            ],
            global: [],
            local: [],
          },
          state: {
            global: {},
            local: {},
            document: {
              isDeleted: false,
            },
          },
        }),
      ),
      exists: vi.fn().mockResolvedValue(true),
      resolveSlugs: vi.fn().mockResolvedValue([]),
    });

    // Setup mock operation storage
    mockOperationStorage = createMockOperationStorage();

    // Setup mock operation store
    mockOperationStore = createMockOperationStore();

    // Create mock write cache
    const mockWriteCache: IWriteCache = {
      getState: vi.fn().mockImplementation(async (docId) => {
        return await mockDocStorage.get(docId);
      }),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };

    // Create mock operation index
    const mockOperationIndex: any = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const eventBus = createTestEventBus();
    executor = new SimpleJobExecutor(
      registry,
      mockDocStorage,
      mockOperationStorage,
      mockOperationStore,
      eventBus,
      mockWriteCache,
      mockOperationIndex,
      { legacyStorageEnabled: true },
    );
  });

  describe("executeJob", () => {
    it("should handle document not found", async () => {
      mockDocStorage.get = vi
        .fn()
        .mockRejectedValue(new Error("Document not found"));

      const job: Job = {
        kind: "mutation",
        id: "job-2",
        documentId: "missing-doc",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-2",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "123",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Document not found");
    });

    it("should handle missing reducer", async () => {
      // Mock a document with unknown type but with CREATE_DOCUMENT to pass validation
      mockDocStorage.get = vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "unknown/type",
        },
        operations: {
          document: [
            {
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                id: "create-action",
                scope: "document",
                timestampUtcMs: "1234567890",
                input: {
                  documentId: "doc-1",
                  model: "unknown/type",
                },
              },
            },
          ],
          global: [],
        },
        state: {
          document: {
            isDeleted: false,
          },
        },
      });

      const job: Job = {
        kind: "mutation",
        id: "job-3",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-3",
            type: "SOME_ACTION",
            scope: "global",
            timestampUtcMs: "123",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        "Document model module not found",
      );
    });

    it("should handle storage errors", async () => {
      mockDocStorage.get = vi
        .fn()
        .mockRejectedValue(new Error("Storage error"));

      const job: Job = {
        kind: "mutation",
        id: "job-4",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-4",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "123",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Storage error");
    });
  });

  describe("executeDeleteDocument", () => {
    it("should delete document successfully", async () => {
      const documentId = "doc-to-delete";

      mockDocStorage.get = vi.fn().mockResolvedValue({
        header: {
          id: documentId,
          documentType: "powerhouse/document-model",
          revision: { document: 1 },
        },
        operations: {
          document: [
            {
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                id: "create-action",
                scope: "document",
                timestampUtcMs: "1234567890",
                input: {
                  documentId,
                  model: "powerhouse/document-model",
                },
              },
            },
          ],
          global: [],
          local: [],
        },
        state: {
          global: {},
          local: {},
          document: {
            isDeleted: false,
          },
        },
      });

      const job: Job = {
        kind: "mutation",
        id: "delete-job-1",
        documentId,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-1",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1234567890",
            input: { documentId },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
      };

      mockDocStorage.delete = vi.fn().mockResolvedValue(undefined);

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.operations?.[0].action).toEqual(job.actions[0]);
      expect(mockDocStorage.delete).toHaveBeenCalledWith(documentId);
    });

    it("should return error if document deletion fails", async () => {
      const documentId = "doc-delete-fail";

      mockDocStorage.get = vi.fn().mockResolvedValue({
        header: {
          id: documentId,
          documentType: "powerhouse/document-model",
          revision: { document: 1 },
        },
        operations: {
          document: [
            {
              index: 0,
              action: {
                type: "CREATE_DOCUMENT",
                id: "create-action",
                scope: "document",
                timestampUtcMs: "1234567890",
                input: {
                  documentId,
                  model: "powerhouse/document-model",
                },
              },
            },
          ],
          global: [],
          local: [],
        },
        state: {
          global: {},
          local: {},
          document: {
            isDeleted: false,
          },
        },
      });

      const job: Job = {
        kind: "mutation",
        id: "delete-job-2",
        documentId,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-2",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1234567890",
            input: { documentId },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
      };

      mockDocStorage.delete = vi
        .fn()
        .mockRejectedValue(new Error("Delete failed"));

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Failed to delete document");
      expect(result.error?.message).toContain("Delete failed");
    });

    it("should return error if documentId is missing from input", async () => {
      const job: Job = {
        kind: "mutation",
        id: "delete-job-3",
        documentId: "doc-missing-id",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-3",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "1234567890",
            input: {},
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        "DELETE_DOCUMENT action requires a documentId",
      );
      expect(mockDocStorage.delete).not.toHaveBeenCalled();
    });
  });

  describe("Operation Index Assignment", () => {
    describe("CREATE_DOCUMENT", () => {
      it("should assign index 0 for new document", async () => {
        const documentId = "new-doc-1";
        const job: Job = {
          kind: "mutation",
          id: "create-job-1",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "create-action-1",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                model: "powerhouse/document-model",
                slug: "test-doc",
                name: "Test Document",
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.create = vi.fn().mockResolvedValue(undefined);

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations).toBeDefined();
        expect(result.operations?.length).toBe(1);
        expect(result.operations?.[0].index).toBe(0);
        expect(result.operations?.[0].action.type).toBe("CREATE_DOCUMENT");
      });
    });

    describe("DELETE_DOCUMENT", () => {
      it("should calculate next index based on operations in the same scope only", async () => {
        const documentId = "doc-with-ops";
        mockDocStorage.get = vi.fn().mockResolvedValue({
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 2,
              global: 2,
            },
          },
          operations: {
            document: [
              { index: 0, action: { type: "CREATE_DOCUMENT" } },
              { index: 1, action: { type: "UPGRADE_DOCUMENT" } },
            ],
            global: [
              { index: 0, action: { type: "SET_NAME" } },
              { index: 1, action: { type: "SET_DESCRIPTION" } },
            ],
          },
          state: {
            document: {
              isDeleted: false,
            },
          },
        });

        const job: Job = {
          kind: "mutation",
          id: "delete-job-index",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "delete-action-index",
              type: "DELETE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: { documentId },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.delete = vi.fn().mockResolvedValue(undefined);

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations).toBeDefined();
        expect(result.operations?.length).toBe(1);
        // Should be 2 (next index in document scope), not 4 (global indexing)
        expect(result.operations?.[0].index).toBe(2);
      });
    });

    describe("UPGRADE_DOCUMENT", () => {
      it("should calculate next index based on existing operations", async () => {
        const documentId = "doc-to-upgrade";
        mockDocStorage.get = vi.fn().mockResolvedValue({
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 1,
            },
          },
          operations: {
            document: [{ index: 0, action: { type: "CREATE_DOCUMENT" } }],
          },
          state: {
            document: {
              isDeleted: false,
            },
          },
        });

        const job: Job = {
          kind: "mutation",
          id: "upgrade-job-index",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "upgrade-action-index",
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                initialState: {
                  global: { some: "state" },
                  local: { other: "state" },
                },
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations).toBeDefined();
        expect(result.operations?.length).toBe(1);
        // Should be 1 (max existing index 0 + 1)
        expect(result.operations?.[0].index).toBe(1);
      });
    });

    describe("Multiple actions in single job", () => {
      it("should assign sequential indexes for CREATE and UPGRADE", async () => {
        const documentId = "new-doc-with-upgrade";
        const job: Job = {
          kind: "mutation",
          id: "create-and-upgrade-job",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "create-action",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                model: "powerhouse/document-model",
                slug: "test-doc",
                name: "Test Document",
              },
            },
            {
              id: "upgrade-action",
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567891",
              input: {
                documentId,
                initialState: {
                  global: { some: "state" },
                  local: { other: "state" },
                },
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.create = vi.fn().mockResolvedValue(undefined);
        // After CREATE, document will have one operation
        mockDocStorage.get = vi.fn().mockResolvedValue({
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 1,
            },
          },
          operations: {
            document: [
              {
                index: 0,
                action: {
                  type: "CREATE_DOCUMENT",
                  id: "create-action",
                  scope: "document",
                  timestampUtcMs: "1234567890",
                  input: {
                    documentId,
                    model: "powerhouse/document-model",
                  },
                },
              },
            ],
          },
          state: {
            document: {
              isDeleted: false,
            },
            auth: {},
          },
        });

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations).toBeDefined();
        expect(result.operations?.length).toBe(2);

        // First operation (CREATE_DOCUMENT) should have index 0
        expect(result.operations?.[0].index).toBe(0);
        expect(result.operations?.[0].action.type).toBe("CREATE_DOCUMENT");

        // Second operation (UPGRADE_DOCUMENT) should have index 1
        expect(result.operations?.[1].index).toBe(1);
        expect(result.operations?.[1].action.type).toBe("UPGRADE_DOCUMENT");
      });
    });
  });

  describe("Operation Index Assignment - Per-Scope Indexing", () => {
    describe("Index independence across scopes", () => {
      it("should allow same index values in different scopes", async () => {
        const documentId = "doc-multi-scope";

        // Set up document with index 0 in multiple scopes
        mockDocStorage.get = vi.fn().mockResolvedValue({
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 1,
              global: 1,
              local: 1,
            },
          },
          operations: {
            document: [{ index: 0, action: { type: "CREATE_DOCUMENT" } }],
            global: [{ index: 0, action: { type: "SET_NAME" } }],
            local: [{ index: 0, action: { type: "SOME_ACTION" } }],
          },
          state: { document: { isDeleted: false } },
        });

        // Test DELETE in document scope gets index 1
        const job: Job = {
          kind: "mutation",
          id: "delete-job",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "delete-action",
              type: "DELETE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: { documentId },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.delete = vi.fn().mockResolvedValue(undefined);
        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations?.[0].index).toBe(1);

        // Verify the index is for document scope, independent of global/local
        expect(result.operations?.[0].index).not.toBe(3); // Not global indexing
      });

      it("should maintain separate index sequences per scope", async () => {
        const documentId = "doc-separate-sequences";

        // Create a document where different scopes have different index counts
        const document = {
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 2,
              global: 3,
              local: 1,
            },
          },
          operations: {
            document: [
              { index: 0, action: { type: "CREATE_DOCUMENT" } },
              { index: 1, action: { type: "UPGRADE_DOCUMENT" } },
            ],
            global: [
              { index: 0, action: { type: "SET_NAME" } },
              { index: 1, action: { type: "SET_ATTR_1" } },
              { index: 2, action: { type: "SET_ATTR_2" } },
            ],
            local: [{ index: 0, action: { type: "LOCAL_ACTION" } }],
          },
          state: { document: { isDeleted: false } },
        };

        mockDocStorage.get = vi.fn().mockResolvedValue(document);

        // Test UPGRADE in document scope (should be 2, not 4)
        const job: Job = {
          kind: "mutation",
          id: "upgrade-job",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "upgrade-action",
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                initialState: { global: {}, local: {} },
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        // Next index in document scope is 2 (following 0, 1)
        // NOT 4 (which would be global indexing across all scopes)
        expect(result.operations?.[0].index).toBe(2);
      });
    });

    describe("Mixed scope operations", () => {
      it("should handle CREATE→UPGRADE with correct indexes", async () => {
        const documentId = "new-doc-multi-action";
        const job: Job = {
          kind: "mutation",
          id: "create-and-upgrade-job",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "create-action",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                model: "powerhouse/document-model",
                slug: "test-doc",
                name: "Test Document",
              },
            },
            {
              id: "upgrade-action",
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567891",
              input: {
                documentId,
                initialState: {
                  global: { some: "state" },
                  local: { other: "state" },
                },
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.create = vi.fn().mockResolvedValue(undefined);

        // After CREATE, document will have one operation
        mockDocStorage.get = vi.fn().mockResolvedValue({
          header: {
            id: documentId,
            documentType: "powerhouse/document-model",
            revision: {
              document: 1,
            },
          },
          operations: {
            document: [
              {
                index: 0,
                action: {
                  type: "CREATE_DOCUMENT",
                  id: "create-action",
                  scope: "document",
                  timestampUtcMs: "1234567890",
                  input: {
                    documentId,
                    model: "powerhouse/document-model",
                  },
                },
              },
            ],
          },
          state: {
            document: { isDeleted: false },
            auth: {},
          },
        });

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations?.length).toBe(2);

        // First operation (CREATE_DOCUMENT) should have index 0
        expect(result.operations?.[0].index).toBe(0);
        expect(result.operations?.[0].action.type).toBe("CREATE_DOCUMENT");

        // Second operation (UPGRADE_DOCUMENT) should have index 1
        expect(result.operations?.[1].index).toBe(1);
        expect(result.operations?.[1].action.type).toBe("UPGRADE_DOCUMENT");
      });
    });
  });

  describe("CREATE_DOCUMENT guarantee", () => {
    describe("CREATE_DOCUMENT scope validation", () => {
      it("should reject CREATE_DOCUMENT in non-document scope", async () => {
        const documentId = "new-doc-wrong-scope";
        const job: Job = {
          kind: "mutation",
          id: "create-job-wrong-scope",
          documentId,
          scope: "global",
          branch: "main",
          actions: [
            {
              id: "create-action-wrong-scope",
              type: "CREATE_DOCUMENT",
              scope: "global",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                model: "powerhouse/document-model",
                slug: "test-doc",
                name: "Test Document",
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        const result = await executor.executeJob(job);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain(
          'CREATE_DOCUMENT must be in "document" scope',
        );
      });

      it("should accept CREATE_DOCUMENT in document scope", async () => {
        const documentId = "new-doc-correct-scope";
        const job: Job = {
          kind: "mutation",
          id: "create-job-correct-scope",
          documentId,
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "create-action-correct-scope",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1234567890",
              input: {
                documentId,
                model: "powerhouse/document-model",
                slug: "test-doc",
                name: "Test Document",
              },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
        };

        mockDocStorage.create = vi.fn().mockResolvedValue(undefined);

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations?.[0].index).toBe(0);
      });
    });
  });
});
