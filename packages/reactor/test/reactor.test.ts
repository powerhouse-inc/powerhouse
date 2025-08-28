import { type BaseDocumentDriveServer } from "document-drive";
import type { Action, DocumentOperations, PHDocument } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reactor } from "../src/reactor.js";
import { JobStatus, PropagationMode } from "../src/shared/types.js";

// Mock BaseDocumentDriveServer with proper interface
const mockDriveServer = {
  getDocumentModelModules: vi.fn(),
  getDocument: vi.fn(),
  getDocuments: vi.fn(),
  getDrives: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  addOperations: vi.fn(),
};

// Helper to create a valid PHDocument
function createMockDocument(
  overrides: {
    header?: Partial<PHDocument["header"]>;
    state?: Partial<PHDocument["state"]>;
  } = {},
): PHDocument {
  const baseDoc = {
    header: {
      id: "doc1",
      sig: {
        publicKey: {} as JsonWebKey,
        nonce: "nonce",
      },
      documentType: "test",
      createdAtUtcIso: "2023-01-01T00:00:00.000Z",
      slug: "test-doc",
      name: "Test Document",
      branch: "main",
      revision: { global: 1 },
      lastModifiedAtUtcIso: "2023-01-01T00:00:00.000Z",
      ...overrides.header,
    },
    state: {
      auth: {},
      document: { version: "1.0.0" },
      ...overrides.state,
    },
    history: {},
    initialState: {
      auth: {},
      document: { version: "1.0.0" },
    },
    operations: {} as DocumentOperations,
  };
  return baseDoc as PHDocument;
}

describe("Reactor", () => {
  let reactor: Reactor;

  beforeEach(() => {
    vi.clearAllMocks();
    reactor = new Reactor(
      mockDriveServer as unknown as BaseDocumentDriveServer,
    );
  });

  describe("kill", () => {
    it("should return a shutdown status", () => {
      const status = reactor.kill();
      expect(status.isShutdown).toBe(true);
    });

    it("should maintain shutdown state", () => {
      const status = reactor.kill();
      expect(status.isShutdown).toBe(true);
      // Check again to ensure state is maintained
      expect(status.isShutdown).toBe(true);
    });
  });

  describe("getDocumentModels", () => {
    it("should retrieve document models", async () => {
      const mockModules = [
        {
          documentModel: {
            id: "model1",
            name: "TestModel",
            extension: ".test",
            specifications: [],
            author: { name: "Test Author", website: "test.com" },
            description: "Test description",
          },
        },
        {
          documentModel: {
            id: "model2",
            name: "AnotherModel",
            extension: ".another",
            specifications: [],
            author: { name: "Test Author", website: "test.com" },
            description: "Another description",
          },
        },
      ];
      mockDriveServer.getDocumentModelModules.mockReturnValue(mockModules);

      const result = await reactor.getDocumentModels();

      expect(mockDriveServer.getDocumentModelModules).toHaveBeenCalledOnce();
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        id: "model1",
        name: "TestModel",
        extension: ".test",
        author: { name: "Test Author", website: "test.com" },
        description: "Test description",
      });
    });

    it("should handle paging", async () => {
      const mockModules = Array.from({ length: 10 }, (_, i) => ({
        documentModel: {
          id: `model${i}`,
          name: `Model${i}`,
          extension: `.ext${i}`,
          specifications: [],
        },
      }));
      mockDriveServer.getDocumentModelModules.mockReturnValue(mockModules);

      const result = await reactor.getDocumentModels(undefined, {
        cursor: "2",
        limit: 3,
      });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].id).toBe("model2");
      expect(result.nextCursor).toBe("5");
      expect(result.next).toBeDefined();
    });
  });

  describe("get", () => {
    it("should retrieve a document by id", async () => {
      const mockDocument = createMockDocument();
      mockDriveServer.getDocument.mockResolvedValue(mockDocument);
      mockDriveServer.getDocuments.mockResolvedValue(["child1", "child2"]);

      const result = await reactor.get("doc1");

      expect(mockDriveServer.getDocument).toHaveBeenCalledWith("doc1");
      expect(mockDriveServer.getDocuments).toHaveBeenCalledWith("doc1");
      expect(result.document).toEqual(mockDocument);
      expect(result.childIds).toEqual(["child1", "child2"]);
    });

    it("should filter by scopes when view filter is provided", async () => {
      const mockDocument = createMockDocument();
      // Add scoped data to the state in a type-safe way
      (mockDocument.state as any).global = { someData: "global" };
      (mockDocument.state as any).local = { someData: "local" };
      (mockDocument.state as any).private = { someData: "private" };

      mockDriveServer.getDocument.mockResolvedValue(mockDocument);
      mockDriveServer.getDocuments.mockResolvedValue([]);

      const result = await reactor.get("doc1", { scopes: ["global", "local"] });

      expect(result.document.state).toHaveProperty("global");
      expect(result.document.state).toHaveProperty("local");
      expect(result.document.state).not.toHaveProperty("private");
    });

    it("should throw error if document not found", async () => {
      mockDriveServer.getDocument.mockResolvedValue(null);

      await expect(reactor.get("nonexistent")).rejects.toThrow(
        "Document not found: nonexistent",
      );
    });
  });

  describe("getBySlug", () => {
    it("should retrieve a document by slug", async () => {
      const mockDocument = createMockDocument({
        header: { slug: "test-slug" },
      });

      mockDriveServer.getDrives.mockResolvedValue(["drive1"]);
      mockDriveServer.getDocuments
        .mockResolvedValueOnce(["doc1"]) // documents in drive1
        .mockResolvedValueOnce([]); // children of doc1
      mockDriveServer.getDocument.mockResolvedValue(mockDocument);

      const result = await reactor.getBySlug("test-slug");

      expect(result.document.header.slug).toBe("test-slug");
      expect(result.childIds).toEqual([]);
    });

    it("should throw error if document with slug not found", async () => {
      mockDriveServer.getDrives.mockResolvedValue([]);

      await expect(reactor.getBySlug("nonexistent")).rejects.toThrow(
        "Document not found with slug: nonexistent",
      );
    });
  });

  describe("getOperations", () => {
    it("should retrieve operations for a document", async () => {
      const mockOperations = {
        global: [
          {
            index: 0,
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            hash: "hash1",
            skip: 0,
            action: {
              id: "action1",
              type: "CREATE",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
              scope: "global",
            },
          },
        ],
        local: [
          {
            index: 1,
            timestampUtcMs: "2023-01-02T00:00:00.000Z",
            hash: "hash2",
            skip: 0,
            action: {
              id: "action2",
              type: "UPDATE",
              timestampUtcMs: "2023-01-02T00:00:00.000Z",
              input: { field: "value" },
              scope: "local",
            },
          },
        ],
      };

      const mockDocument = { operations: mockOperations };
      mockDriveServer.getDocument.mockResolvedValue(mockDocument);

      const result = await reactor.getOperations("doc1");

      expect(mockDriveServer.getDocument).toHaveBeenCalledWith("doc1");
      expect(result).toHaveProperty("global");
      expect(result).toHaveProperty("local");
      expect(result.global.results).toEqual(mockOperations.global);
      expect(result.local.results).toEqual(mockOperations.local);
    });

    it("should filter operations by scopes", async () => {
      const mockOperations = {
        global: [
          {
            index: 0,
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            hash: "hash1",
            skip: 0,
            action: {
              id: "action1",
              type: "CREATE",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
              scope: "global",
            },
          },
        ],
        local: [
          {
            index: 1,
            timestampUtcMs: "2023-01-02T00:00:00.000Z",
            hash: "hash2",
            skip: 0,
            action: {
              id: "action2",
              type: "UPDATE",
              timestampUtcMs: "2023-01-02T00:00:00.000Z",
              input: {},
              scope: "local",
            },
          },
        ],
        private: [
          {
            index: 2,
            timestampUtcMs: "2023-01-03T00:00:00.000Z",
            hash: "hash3",
            skip: 0,
            action: {
              id: "action3",
              type: "DELETE",
              timestampUtcMs: "2023-01-03T00:00:00.000Z",
              input: {},
              scope: "private",
            },
          },
        ],
      };

      const mockDocument = { operations: mockOperations };
      mockDriveServer.getDocument.mockResolvedValue(mockDocument);

      const result = await reactor.getOperations("doc1", {
        scopes: ["global", "local"],
      });

      expect(result).toHaveProperty("global");
      expect(result).toHaveProperty("local");
      expect(result).not.toHaveProperty("private");
    });
  });

  describe("find", () => {
    it("should filter documents by type", async () => {
      const mockDocument1 = createMockDocument({
        header: { id: "doc1", documentType: "type1" },
      });
      const mockDocument2 = createMockDocument({
        header: { id: "doc2", documentType: "type2" },
      });

      mockDriveServer.getDrives.mockResolvedValue(["drive1"]);
      mockDriveServer.getDocuments.mockResolvedValue(["doc1", "doc2"]);
      mockDriveServer.getDocument
        .mockResolvedValueOnce(mockDocument1)
        .mockResolvedValueOnce(mockDocument2);

      const result = await reactor.find({ type: "type1" });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].header.id).toBe("doc1");
    });

    it("should filter documents by ids", async () => {
      const mockDocuments = Array.from({ length: 5 }, (_, i) =>
        createMockDocument({ header: { id: `doc${i}` } }),
      );

      // Reset mock to ensure clean state
      mockDriveServer.getDocument.mockReset();

      mockDriveServer.getDrives.mockResolvedValue(["drive1"]);
      mockDriveServer.getDocuments.mockResolvedValue(
        mockDocuments.map((d) => d.header.id),
      );
      mockDriveServer.getDocument.mockImplementation(async (id: string) => {
        return mockDocuments.find((d) => d.header.id === id) || null;
      });

      const result = await reactor.find({ ids: ["doc1", "doc3"] });

      expect(result.results).toHaveLength(2);
      expect(result.results.map((d) => d.header.id)).toEqual(["doc1", "doc3"]);
    });

    it("should filter documents by scopes when view filter is provided", async () => {
      const mockDocument = createMockDocument();
      // Add scoped data to the state in a type-safe way
      (mockDocument.state as any).global = { someData: "global" };
      (mockDocument.state as any).local = { someData: "local" };
      (mockDocument.state as any).private = { someData: "private" };

      mockDriveServer.getDrives.mockResolvedValue(["drive1"]);
      mockDriveServer.getDocuments.mockResolvedValue(["doc1"]);
      mockDriveServer.getDocument.mockResolvedValue(mockDocument);

      const result = await reactor.find({}, { scopes: ["global"] });

      expect(result.results[0].state).toHaveProperty("global");
      expect(result.results[0].state).not.toHaveProperty("local");
      expect(result.results[0].state).not.toHaveProperty("private");
    });
  });

  describe("create", () => {
    it("should create a document successfully", async () => {
      const mockDocument = createMockDocument({ header: { id: "new-doc" } });
      mockDriveServer.addDocument.mockResolvedValue(mockDocument);

      const status = await reactor.create(mockDocument);

      expect(mockDriveServer.addDocument).toHaveBeenCalledWith(mockDocument);
      expect(status).toBe(JobStatus.COMPLETED);
    });

    it("should return failed status on error", async () => {
      const mockDocument = createMockDocument({ header: { id: "new-doc" } });
      mockDriveServer.addDocument.mockRejectedValue(new Error("Create failed"));

      const status = await reactor.create(mockDocument);

      expect(status).toBe(JobStatus.FAILED);
    });
  });

  describe("deleteDocument", () => {
    it("should delete a document successfully", async () => {
      mockDriveServer.deleteDocument.mockResolvedValue(undefined);

      const jobInfo = await reactor.deleteDocument("doc1");

      expect(mockDriveServer.deleteDocument).toHaveBeenCalledWith("doc1");
      expect(jobInfo.status).toBe(JobStatus.COMPLETED);
      expect(jobInfo.id).toBeDefined();
      expect(jobInfo.error).toBeUndefined();
    });

    it("should return failed job info on error", async () => {
      mockDriveServer.deleteDocument.mockRejectedValue(
        new Error("Delete failed"),
      );

      const jobInfo = await reactor.deleteDocument("doc1");

      expect(jobInfo.status).toBe(JobStatus.FAILED);
      expect(jobInfo.error).toBe("Delete failed");
    });

    it("should accept propagation mode parameter", async () => {
      mockDriveServer.deleteDocument.mockResolvedValue(undefined);

      const jobInfo = await reactor.deleteDocument(
        "doc1",
        PropagationMode.Cascade,
      );

      expect(jobInfo.status).toBe(JobStatus.COMPLETED);
      // TODO: Verify cascade deletion when implemented
    });
  });

  describe("mutate", () => {
    it("should apply actions to a document", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "UPDATE",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: { field: "value" },
          scope: "global",
        },
        {
          id: "action2",
          type: "UPDATE",
          timestampUtcMs: "2023-01-02T00:00:00.000Z",
          input: { field2: "value2" },
          scope: "global",
        },
      ];
      mockDriveServer.addOperations.mockResolvedValue({ success: true });

      const jobInfo = await reactor.mutate("doc1", actions);

      expect(mockDriveServer.addOperations).toHaveBeenCalledWith(
        "doc1",
        expect.arrayContaining([
          expect.objectContaining({
            index: 0,
            action: actions[0],
          }),
          expect.objectContaining({
            index: 1,
            action: actions[1],
          }),
        ]),
      );
      expect(jobInfo.status).toBe(JobStatus.COMPLETED);
    });

    it("should return failed job info on error", async () => {
      const actions: Action[] = [
        {
          id: "action1",
          type: "UPDATE",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: { field: "value" },
          scope: "global",
        },
      ];
      mockDriveServer.addOperations.mockRejectedValue(
        new Error("Mutation failed"),
      );

      const jobInfo = await reactor.mutate("doc1", actions);

      expect(jobInfo.status).toBe(JobStatus.FAILED);
      expect(jobInfo.error).toBe("Mutation failed");
    });
  });

  describe("addChildren", () => {
    it("should verify parent and children exist", async () => {
      const parentDoc = createMockDocument({ header: { id: "parent" } });
      const childDoc = createMockDocument({ header: { id: "child1" } });

      mockDriveServer.getDocument
        .mockResolvedValueOnce(parentDoc)
        .mockResolvedValueOnce(childDoc);

      const jobInfo = await reactor.addChildren("parent", ["child1"]);

      expect(mockDriveServer.getDocument).toHaveBeenCalledWith("parent");
      expect(mockDriveServer.getDocument).toHaveBeenCalledWith("child1");
      expect(jobInfo.status).toBe(JobStatus.COMPLETED);
    });

    it("should return failed job info if parent not found", async () => {
      mockDriveServer.getDocument.mockRejectedValue(
        new Error("Document not found"),
      );

      const jobInfo = await reactor.addChildren("nonexistent", ["child1"]);

      expect(jobInfo.status).toBe(JobStatus.FAILED);
      expect(jobInfo.error).toBe("Document not found");
    });
  });

  describe("removeChildren", () => {
    it("should verify parent exists", async () => {
      const parentDoc = createMockDocument({ header: { id: "parent" } });
      mockDriveServer.getDocument.mockResolvedValue(parentDoc);

      const jobInfo = await reactor.removeChildren("parent", [
        "child1",
        "child2",
      ]);

      expect(mockDriveServer.getDocument).toHaveBeenCalledWith("parent");
      expect(jobInfo.status).toBe(JobStatus.COMPLETED);
    });

    it("should return failed job info if parent not found", async () => {
      mockDriveServer.getDocument.mockRejectedValue(
        new Error("Parent not found"),
      );

      const jobInfo = await reactor.removeChildren("nonexistent", ["child1"]);

      expect(jobInfo.status).toBe(JobStatus.FAILED);
      expect(jobInfo.error).toBe("Parent not found");
    });
  });

  describe("getJobStatus", () => {
    it("should return not implemented status", async () => {
      const jobInfo = await reactor.getJobStatus("job-123");

      expect(jobInfo.id).toBe("job-123");
      expect(jobInfo.status).toBe(JobStatus.FAILED);
      expect(jobInfo.error).toBe("Job tracking not yet implemented");
    });
  });
});
