import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { SimpleJobExecutor } from "../../../src/executor/simple-job-executor.js";
import type { Job } from "../../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestRegistry,
} from "../../factories.js";

describe("SimpleJobExecutor", () => {
  let executor: SimpleJobExecutor;
  let registry: IDocumentModelRegistry;
  let mockOperationStore: IOperationStore;
  let mockWriteCache: IWriteCache;

  beforeEach(() => {
    // Setup registry with real document model
    registry = createTestRegistry([documentModelDocumentModelModule]);

    // Setup mock operation store
    mockOperationStore = createMockOperationStore();

    // Create mock write cache
    mockWriteCache = {
      getState: vi.fn().mockImplementation((docId) =>
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
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
        removeFromCollection: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    };

    const eventBus = createTestEventBus();
    const mockDocumentMetaCache = createMockDocumentMetaCache();
    const mockCollectionMembershipCache = createMockCollectionMembershipCache();
    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      mockOperationStore,
      eventBus,
      mockWriteCache,
      mockOperationIndex,
      mockDocumentMetaCache,
      mockCollectionMembershipCache,
      {},
    );
  });

  describe("executeJob", () => {
    it("should handle document not found", async () => {
      mockWriteCache.getState = vi
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-2"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Document not found");
    });

    it("should handle missing reducer", async () => {
      // Mock a document with unknown type but with CREATE_DOCUMENT to pass validation
      mockWriteCache.getState = vi.fn().mockResolvedValue({
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
                timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-3"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        "Document model module not found",
      );
    });

    it("should handle storage errors", async () => {
      mockWriteCache.getState = vi
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-4"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Storage error");
    });

    it("should return DocumentNotFoundError when document does not exist", async () => {
      const mockDocumentMetaCache = createMockDocumentMetaCache({
        getDocumentMeta: vi
          .fn()
          .mockRejectedValue(new DocumentNotFoundError("missing-doc")),
      });

      const localExecutor = new SimpleJobExecutor(
        createMockLogger(),
        registry,
        mockOperationStore,
        createTestEventBus(),
        mockWriteCache,
        {
          start: vi.fn().mockReturnValue({
            createCollection: vi.fn(),
            addToCollection: vi.fn(),
            removeFromCollection: vi.fn(),
            write: vi.fn(),
          }),
          commit: vi.fn().mockResolvedValue([]),
          find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
          getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
        } as any,
        mockDocumentMetaCache,
        createMockCollectionMembershipCache(),
        {},
      );

      const job: Job = {
        kind: "mutation",
        id: "job-typed-error",
        documentId: "missing-doc",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-typed-error",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-typed-error"] },
      };

      const result = await localExecutor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(DocumentNotFoundError);
      expect((result.error as DocumentNotFoundError).documentId).toBe(
        "missing-doc",
      );
    });
  });

  describe("timestamp validation", () => {
    it("should reject action with non-ISO timestamp", async () => {
      const job: Job = {
        kind: "mutation",
        id: "job-bad-ts",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-bad-ts",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "not-a-date",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-bad-ts"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid timestamp");
      expect(result.error?.message).toContain("not-a-date");
    });

    it("should reject action with numeric string timestamp", async () => {
      const job: Job = {
        kind: "mutation",
        id: "job-numeric-ts",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-numeric-ts",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "1234567890",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-numeric-ts"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid timestamp");
    });

    it("should accept action with valid ISO timestamp", async () => {
      const job: Job = {
        kind: "mutation",
        id: "job-good-ts",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "action-good-ts",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-06-15T12:30:00.000Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-good-ts"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
    });

    it("should reject load job with non-ISO operation timestamp", async () => {
      const job: Job = {
        kind: "load",
        id: "job-bad-load-ts",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [
          {
            id: "op-bad-ts",
            index: 1,
            skip: 0,
            timestampUtcMs: "March 1, 2025",
            hash: "",
            action: {
              id: "action-load-bad-ts",
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "March 1, 2025",
              input: { name: "Test" },
            },
          },
        ],
        createdAt: new Date().toISOString(),
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["job-bad-load-ts"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid timestamp");
      expect(result.error?.message).toContain("March 1, 2025");
    });
  });

  describe("executeDeleteDocument", () => {
    it("should delete document successfully", async () => {
      const documentId = "doc-to-delete";

      mockWriteCache.getState = vi.fn().mockResolvedValue({
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
                timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { documentId },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["delete-job-1"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.operations?.[0].action).toEqual(job.actions[0]);
    });

    it("should return error if operation write fails during delete", async () => {
      const documentId = "doc-delete-fail";

      mockWriteCache.getState = vi.fn().mockResolvedValue({
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
                timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { documentId },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["delete-job-2"] },
      };

      mockOperationStore.apply = vi
        .fn()
        .mockRejectedValue(new Error("Write failed"));

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Failed to write operation");
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
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["delete-job-3"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(
        "DELETE_DOCUMENT action requires a documentId",
      );
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          meta: { batchId: "test", batchJobIds: ["create-job-1"] },
        };

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
        mockWriteCache.getState = vi.fn().mockResolvedValue({
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { documentId },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
          meta: { batchId: "test", batchJobIds: ["delete-job-index"] },
        };

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
        mockWriteCache.getState = vi.fn().mockResolvedValue({
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          meta: { batchId: "test", batchJobIds: ["upgrade-job-index"] },
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
              timestampUtcMs: "2024-01-01T00:00:01.000Z",
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
          meta: { batchId: "test", batchJobIds: ["create-and-upgrade-job"] },
        };

        // After CREATE, document will have one operation
        mockWriteCache.getState = vi.fn().mockResolvedValue({
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
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
        mockWriteCache.getState = vi.fn().mockResolvedValue({
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { documentId },
            },
          ],
          operations: [],
          createdAt: "1234567890",
          queueHint: [],
          errorHistory: [],
          meta: { batchId: "test", batchJobIds: ["delete-job"] },
        };

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

        mockWriteCache.getState = vi.fn().mockResolvedValue(document);

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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          meta: { batchId: "test", batchJobIds: ["upgrade-job"] },
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
              timestampUtcMs: "2024-01-01T00:00:01.000Z",
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
          meta: { batchId: "test", batchJobIds: ["create-and-upgrade-job"] },
        };

        // After CREATE, document will have one operation
        mockWriteCache.getState = vi.fn().mockResolvedValue({
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
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
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

  describe("DELETE_DOCUMENT error paths", () => {
    it("should return error when document fetch fails during delete", async () => {
      mockWriteCache.getState = vi
        .fn()
        .mockRejectedValue(new Error("Fetch failed"));

      const job: Job = {
        kind: "mutation",
        id: "delete-fetch-fail",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-fetch-fail",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { documentId: "doc-1" },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["delete-fetch-fail"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Failed to fetch document before deletion",
      );
    });

    it("should return error when deleting an already deleted document", async () => {
      mockWriteCache.getState = vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document-model",
          revision: { document: 2 },
        },
        operations: {
          document: [
            { index: 0, action: { type: "CREATE_DOCUMENT" } },
            { index: 1, action: { type: "DELETE_DOCUMENT" } },
          ],
        },
        state: {
          document: {
            isDeleted: true,
            deletedAtUtcIso: "2024-01-01T00:00:00.000Z",
          },
        },
      });

      const job: Job = {
        kind: "mutation",
        id: "delete-already-deleted",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "delete-action-already-deleted",
            type: "DELETE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { documentId: "doc-1" },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["delete-already-deleted"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("was deleted at");
    });
  });

  describe("UPGRADE_DOCUMENT error paths", () => {
    it("should return error when documentId is missing from upgrade input", async () => {
      const job: Job = {
        kind: "mutation",
        id: "upgrade-missing-id",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "upgrade-action-missing-id",
            type: "UPGRADE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["upgrade-missing-id"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "UPGRADE_DOCUMENT action requires a documentId",
      );
    });

    it("should return error when document fetch fails during upgrade", async () => {
      mockWriteCache.getState = vi
        .fn()
        .mockRejectedValue(new Error("Upgrade fetch failed"));

      const job: Job = {
        kind: "mutation",
        id: "upgrade-fetch-fail",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "upgrade-action-fetch-fail",
            type: "UPGRADE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              documentId: "doc-1",
              fromVersion: 1,
              toVersion: 2,
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["upgrade-fetch-fail"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Failed to fetch document for upgrade",
      );
    });

    it("should return error when upgrading an already deleted document", async () => {
      mockWriteCache.getState = vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document-model",
          revision: { document: 2 },
        },
        operations: {
          document: [
            { index: 0, action: { type: "CREATE_DOCUMENT" } },
            { index: 1, action: { type: "DELETE_DOCUMENT" } },
          ],
        },
        state: {
          document: {
            isDeleted: true,
            deletedAtUtcIso: "2024-01-01T00:00:00.000Z",
          },
        },
      });

      const job: Job = {
        kind: "mutation",
        id: "upgrade-deleted",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "upgrade-action-deleted",
            type: "UPGRADE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              documentId: "doc-1",
              fromVersion: 1,
              toVersion: 2,
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["upgrade-deleted"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("was deleted at");
    });

    it("should return success no-op when fromVersion equals toVersion", async () => {
      mockWriteCache.getState = vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document-model",
          revision: { document: 1 },
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
        id: "upgrade-same-version",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "upgrade-action-same-version",
            type: "UPGRADE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              documentId: "doc-1",
              fromVersion: 2,
              toVersion: 2,
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["upgrade-same-version"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.operations).toEqual([]);
    });
  });

  describe("ADD_RELATIONSHIP error paths", () => {
    it("should return error when scope is not document", async () => {
      const job: Job = {
        kind: "mutation",
        id: "add-rel-wrong-scope",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "add-rel-action-wrong-scope",
            type: "ADD_RELATIONSHIP",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              sourceId: "doc-1",
              targetId: "doc-2",
              relationshipType: "child",
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["add-rel-wrong-scope"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'ADD_RELATIONSHIP must be in "document" scope',
      );
    });

    it("should return error when input fields are missing", async () => {
      const job: Job = {
        kind: "mutation",
        id: "add-rel-missing-input",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "add-rel-action-missing-input",
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { sourceId: "doc-1" },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["add-rel-missing-input"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "ADD_RELATIONSHIP action requires sourceId, targetId, and relationshipType",
      );
    });

    it("should return error when sourceId equals targetId", async () => {
      const job: Job = {
        kind: "mutation",
        id: "add-rel-self-ref",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "add-rel-action-self-ref",
            type: "ADD_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              sourceId: "doc-1",
              targetId: "doc-1",
              relationshipType: "child",
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["add-rel-self-ref"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "sourceId and targetId cannot be the same",
      );
    });
  });

  describe("REMOVE_RELATIONSHIP error paths", () => {
    it("should return error when scope is not document", async () => {
      const job: Job = {
        kind: "mutation",
        id: "rm-rel-wrong-scope",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "rm-rel-action-wrong-scope",
            type: "REMOVE_RELATIONSHIP",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              sourceId: "doc-1",
              targetId: "doc-2",
              relationshipType: "child",
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["rm-rel-wrong-scope"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'REMOVE_RELATIONSHIP must be in "document" scope',
      );
    });

    it("should return error when input fields are missing", async () => {
      const job: Job = {
        kind: "mutation",
        id: "rm-rel-missing-input",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "rm-rel-action-missing-input",
            type: "REMOVE_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { sourceId: "doc-1" },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["rm-rel-missing-input"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "REMOVE_RELATIONSHIP action requires sourceId, targetId, and relationshipType",
      );
    });

    it("should return error when source document is not found", async () => {
      mockWriteCache.getState = vi
        .fn()
        .mockRejectedValue(new Error("Not found"));

      const job: Job = {
        kind: "mutation",
        id: "rm-rel-not-found",
        documentId: "doc-1",
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "rm-rel-action-not-found",
            type: "REMOVE_RELATIONSHIP",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {
              sourceId: "doc-1",
              targetId: "doc-2",
              relationshipType: "child",
            },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["rm-rel-not-found"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "REMOVE_RELATIONSHIP: source document",
      );
    });
  });

  describe("executeRegularAction error paths", () => {
    it("should return error when no operations are generated from action", async () => {
      mockWriteCache.getState = vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document-model",
          revision: { global: 0 },
        },
        operations: {
          document: [{ index: 0, action: { type: "CREATE_DOCUMENT" } }],
          global: [],
        },
        state: {
          global: {},
          document: { isDeleted: false },
        },
      });

      const mockModule = {
        reducer: vi.fn().mockReturnValue({
          header: {
            id: "doc-1",
            documentType: "powerhouse/document-model",
            revision: { global: 0 },
          },
          operations: { global: [] },
          state: { global: {} },
        }),
        documentModel: { id: "powerhouse/document-model" },
        utils: {},
      };

      registry.getModule = vi.fn().mockReturnValue(mockModule);

      const job: Job = {
        kind: "mutation",
        id: "no-ops-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "no-ops-action",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["no-ops-job"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "No operation generated from action",
      );
    });

    it("should return error when operation store write fails", async () => {
      mockOperationStore.apply = vi
        .fn()
        .mockRejectedValue(new Error("Store write error"));

      const job: Job = {
        kind: "mutation",
        id: "store-fail-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "store-fail-action",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00Z",
            input: { name: "Test" },
          },
        ],
        operations: [],
        createdAt: "2024-01-01T00:00:00Z",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["store-fail-job"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Failed to write operation to IOperationStore",
      );
    });
  });

  describe("executeLoadJob error paths", () => {
    it("should return error when load job has empty operations", async () => {
      const job: Job = {
        kind: "load",
        id: "empty-load-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["empty-load-job"] },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Load job must include at least one operation",
      );
    });

    it("should return success with empty operations when all incoming ops are duplicates", async () => {
      const existingActionId = "existing-action-1";

      mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
        revision: { global: 1 },
        latestTimestamp: "2024-01-01T00:00:00.000Z",
      });
      mockOperationStore.getConflicting = vi.fn().mockResolvedValue({
        results: [
          {
            index: 0,
            skip: 0,
            hash: "hash",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            id: "op-1",
            action: {
              id: existingActionId,
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { name: "Test" },
            },
          },
        ],
        options: { cursor: "0", limit: 1001 },
        nextCursor: undefined,
      });
      mockOperationStore.getSince = vi.fn().mockResolvedValue({
        results: [
          {
            index: 0,
            skip: 0,
            hash: "hash",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            id: "op-1",
            action: {
              id: existingActionId,
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { name: "Test" },
            },
          },
        ],
        options: { cursor: "0", limit: 2000 },
        nextCursor: undefined,
      });

      const job: Job = {
        kind: "load",
        id: "dup-load-job",
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [
          {
            index: 0,
            skip: 0,
            hash: "hash",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            id: "op-incoming",
            action: {
              id: existingActionId,
              type: "SET_NAME",
              scope: "global",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: { name: "Test" },
            },
          },
        ],
        createdAt: "1234567890",
        queueHint: [],
        errorHistory: [],
        meta: {
          batchId: "test",
          batchJobIds: ["dup-load-job"],
          sourceRemote: "remote-1",
        },
      };

      const result = await executor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.operations).toEqual([]);
    });
  });

  describe("JOB_WRITE_READY emit failure", () => {
    it("should catch and log emit error without failing the job", async () => {
      const mockEventBus = {
        emit: vi.fn().mockRejectedValue(new Error("Emit failed")),
        on: vi.fn(),
        off: vi.fn(),
      };

      const mockLogger = createMockLogger();
      mockLogger.error = vi.fn();

      const localExecutor = new SimpleJobExecutor(
        mockLogger,
        registry,
        mockOperationStore,
        mockEventBus as any,
        mockWriteCache,
        {
          start: vi.fn().mockReturnValue({
            createCollection: vi.fn(),
            addToCollection: vi.fn(),
            removeFromCollection: vi.fn(),
            write: vi.fn(),
          }),
          commit: vi.fn().mockResolvedValue([1]),
          find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
          getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
        } as any,
        createMockDocumentMetaCache(),
        createMockCollectionMembershipCache(),
        {},
      );

      const documentId = "doc-emit-fail";
      const job: Job = {
        kind: "mutation",
        id: "emit-fail-job",
        documentId,
        scope: "document",
        branch: "main",
        actions: [
          {
            id: "create-action-emit-fail",
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
        meta: { batchId: "test", batchJobIds: ["emit-fail-job"] },
      };

      const result = await localExecutor.executeJob(job);

      expect(result.success).toBe(true);

      // Give the fire-and-forget .catch() time to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to emit JOB_WRITE_READY"),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("Cache invalidation for history-dependent actions", () => {
    it("should invalidate cache before loading for UNDO actions", async () => {
      const docId = "doc-undo-invalidation";
      const callOrder: string[] = [];
      mockWriteCache.invalidate = vi.fn().mockImplementation(() => {
        callOrder.push("invalidate");
      });
      mockWriteCache.getState = vi.fn().mockImplementation(() => {
        callOrder.push("getState");
        return Promise.resolve({
          header: {
            id: docId,
            documentType: "powerhouse/document-model",
            revision: { document: 1, global: 1 },
          },
          operations: { document: [], global: [] },
          state: { global: {}, local: {}, document: { isDeleted: false } },
        });
      });

      const job: Job = {
        kind: "mutation",
        id: "undo-job-1",
        documentId: docId,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "undo-action-1",
            type: "UNDO",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["undo-job-1"] },
      };

      await executor.executeJob(job);

      expect(mockWriteCache.invalidate).toHaveBeenCalledWith(
        docId,
        "global",
        "main",
      );
      expect(callOrder.indexOf("invalidate")).toBeLessThan(
        callOrder.indexOf("getState"),
      );
    });

    it("should invalidate cache before loading for PRUNE actions", async () => {
      const docId = "doc-prune-invalidation";
      const callOrder: string[] = [];
      mockWriteCache.invalidate = vi.fn().mockImplementation(() => {
        callOrder.push("invalidate");
      });
      mockWriteCache.getState = vi.fn().mockImplementation(() => {
        callOrder.push("getState");
        return Promise.resolve({
          header: {
            id: docId,
            documentType: "powerhouse/document-model",
            revision: { document: 1, global: 1 },
          },
          operations: { document: [], global: [] },
          state: { global: {}, local: {}, document: { isDeleted: false } },
        });
      });

      const job: Job = {
        kind: "mutation",
        id: "prune-job-1",
        documentId: docId,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "prune-action-1",
            type: "PRUNE",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { start: 0, end: 1 },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["prune-job-1"] },
      };

      await executor.executeJob(job);

      expect(mockWriteCache.invalidate).toHaveBeenCalledWith(
        docId,
        "global",
        "main",
      );
      expect(callOrder.indexOf("invalidate")).toBeLessThan(
        callOrder.indexOf("getState"),
      );
    });

    it("should invalidate cache before loading for REDO actions", async () => {
      const docId = "doc-redo-invalidation";
      const callOrder: string[] = [];
      mockWriteCache.invalidate = vi.fn().mockImplementation(() => {
        callOrder.push("invalidate");
      });
      mockWriteCache.getState = vi.fn().mockImplementation(() => {
        callOrder.push("getState");
        return Promise.resolve({
          header: {
            id: docId,
            documentType: "powerhouse/document-model",
            revision: { document: 1, global: 1 },
          },
          operations: { document: [], global: [] },
          state: { global: {}, local: {}, document: { isDeleted: false } },
        });
      });

      const job: Job = {
        kind: "mutation",
        id: "redo-job-1",
        documentId: docId,
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "redo-action-1",
            type: "REDO",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["redo-job-1"] },
      };

      await executor.executeJob(job);

      expect(mockWriteCache.invalidate).toHaveBeenCalledWith(
        docId,
        "global",
        "main",
      );
      expect(callOrder.indexOf("invalidate")).toBeLessThan(
        callOrder.indexOf("getState"),
      );
    });

    it("should invalidate cache before loading for NOOP+skip from load-job reshuffling", async () => {
      const docId = "doc-noop-skip-load";
      const callOrder: string[] = [];
      mockWriteCache.invalidate = vi.fn().mockImplementation(() => {
        callOrder.push("invalidate");
      });
      mockWriteCache.getState = vi.fn().mockImplementation(() => {
        callOrder.push("getState");
        return Promise.resolve({
          header: {
            id: docId,
            documentType: "powerhouse/document-model",
            revision: { document: 1, global: 1 },
          },
          operations: {
            document: [
              {
                index: 0,
                action: {
                  id: "create-action-id",
                  type: "CREATE_DOCUMENT",
                  scope: "document",
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          state: { global: {}, local: {}, document: { isDeleted: false } },
        });
      });

      // A local NOOP op from a prior reshuffle round. Its earlier timestamp
      // ensures it sorts first in reshuffleByTimestamp, making it the first
      // action processed — so the test does not depend on SET_NAME succeeding.
      const localNoopOp = {
        id: "local-noop-op-1",
        index: 1,
        skip: 1,
        timestampUtcMs: "2024-01-01T00:00:00.000Z",
        hash: "hash-noop",
        action: {
          id: "noop-action-id-1",
          type: "NOOP",
          scope: "global",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          input: {},
        },
        resultingState: "{}",
      };

      // An incoming op arriving with a later timestamp
      const incomingOp = {
        id: "incoming-op-1",
        index: 0,
        skip: 0,
        timestampUtcMs: "2024-01-02T00:00:00.000Z",
        hash: "hash-incoming",
        action: {
          id: "incoming-action-id-1",
          type: "SET_NAME",
          scope: "global",
          timestampUtcMs: "2024-01-02T00:00:00.000Z",
          input: { name: "test" },
        },
        resultingState: "{}",
      };

      mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
        revision: { global: 2 },
        latestTimestamp: "2024-01-02T00:00:00.000Z",
      });
      mockOperationStore.getConflicting = vi.fn().mockResolvedValue({
        results: [localNoopOp],
        options: { cursor: "0", limit: 1001 },
        nextCursor: undefined,
      });
      mockOperationStore.getSince = vi.fn().mockResolvedValue({
        results: [localNoopOp],
        options: { cursor: "0", limit: 2000 },
        nextCursor: undefined,
      });

      const job: Job = {
        kind: "load",
        id: "noop-skip-load-job-1",
        documentId: docId,
        scope: "global",
        branch: "main",
        actions: [],
        operations: [incomingOp as any],
        createdAt: "2024-01-01T00:00:00.000Z",
        queueHint: [],
        errorHistory: [],
        meta: {
          batchId: "test-noop-skip",
          batchJobIds: ["noop-skip-load-job-1"],
        },
      };

      await executor.executeJob(job);

      // Reshuffle produces: [localNoopOp(NOOP, skip=1), incomingOp(SET_NAME, skip=0)].
      // The NOOP+skip guard must invalidate before calling getState so the reducer
      // receives full operation history rather than the sliced cache snapshot.
      // Expected callOrder: ["invalidate" (NOOP guard), "getState" (NOOP), ...]
      expect(mockWriteCache.invalidate).toHaveBeenCalledWith(
        docId,
        "global",
        "main",
      );
      expect(callOrder.indexOf("invalidate")).toBeLessThan(
        callOrder.indexOf("getState"),
      );
    });

    it("should not invalidate cache for regular actions", async () => {
      const job: Job = {
        kind: "mutation",
        id: "regular-job-1",
        documentId: "doc-regular-1",
        scope: "global",
        branch: "main",
        actions: [
          {
            id: "regular-action-1",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "New Name" },
          },
        ],
        operations: [],
        createdAt: "123",
        queueHint: [],
        errorHistory: [],
        meta: { batchId: "test", batchJobIds: ["regular-job-1"] },
      };

      await executor.executeJob(job);

      expect(mockWriteCache.invalidate).not.toHaveBeenCalled();
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          meta: { batchId: "test", batchJobIds: ["create-job-wrong-scope"] },
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
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
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
          meta: { batchId: "test", batchJobIds: ["create-job-correct-scope"] },
        };

        const result = await executor.executeJob(job);

        expect(result.success).toBe(true);
        expect(result.operations?.[0].index).toBe(0);
      });
    });
  });
});
