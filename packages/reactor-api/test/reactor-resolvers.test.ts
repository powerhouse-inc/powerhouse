import {
  JobStatus,
  type IReactorClient,
  type JobInfo,
  type PagedResults,
} from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

describe("ReactorSubgraph Query Resolvers", () => {
  let mockReactorClient: IReactorClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock for each test
    mockReactorClient = {
      getDocumentModels: vi.fn(),
      get: vi.fn(),
      getChildren: vi.fn(),
      getParents: vi.fn(),
      find: vi.fn(),
      getJobStatus: vi.fn(),
      waitForJob: vi.fn(),
      create: vi.fn(),
      createEmpty: vi.fn(),
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      rename: vi.fn(),
      addChildren: vi.fn(),
      removeChildren: vi.fn(),
      moveChildren: vi.fn(),
      deleteDocument: vi.fn(),
      deleteDocuments: vi.fn(),
      subscribe: vi.fn(),
    };
  });

  describe("documentModels", () => {
    it("should transform document models to GraphQL format", async () => {
      const mockDocumentModels: PagedResults<DocumentModelModule> = {
        results: [
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ],
        options: {
          cursor: "test-cursor",
          limit: 10,
        },
      };

      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue(
        mockDocumentModels,
      );

      const result = await resolvers.documentModels(mockReactorClient, {
        namespace: "powerhouse",
        paging: { cursor: "test-cursor", limit: 10 },
      });

      expect(result).toEqual({
        cursor: "test-cursor",
        hasNextPage: false,
        hasPreviousPage: false,
        items: [
          {
            id: "powerhouse/document-model",
            name: "DocumentModel",
            namespace: "DocumentModel",
            specification:
              mockDocumentModels.results[0].documentModel.global
                .specifications[0],
            version: null,
          },
        ],
        totalCount: 1,
      });
    });

    it("should extract namespace from model name", async () => {
      const mockDocumentModels = {
        results: [
          {
            documentModel: {
              global: {
                id: "model-1",
                name: "custom-namespace/my-model",
                author: { name: "Author", website: null },
                description: "Description",
                extension: "ext",
                specifications: [],
              },
              local: {},
            },
          },
        ],
        options: { cursor: "", limit: 10 },
      };

      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue(
        mockDocumentModels as unknown as PagedResults<DocumentModelModule>,
      );

      const result = await resolvers.documentModels(mockReactorClient, {});

      expect(result.items[0].namespace).toBe("custom-namespace");
    });
  });

  describe("document", () => {
    it("should transform document to GraphQL format with revision list", async () => {
      const mockDocument = {
        header: {
          id: "doc-1",
          name: "Test Document",
          documentType: "powerhouse/document-model",
          slug: "test-doc",
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
          branch: "main",
          sig: {
            publicKey: {} as JsonWebKey,
            nonce: "test-nonce",
          },
          revision: {
            global: 5,
            local: 2,
            custom: 3,
          },
        },
        state: { data: "test-state" },
        history: {},
        initialState: {},
        operations: {},
        clipboard: [],
      } as unknown as PHDocument;

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: ["child-1", "child-2"],
      });

      const result = await resolvers.document(mockReactorClient, {
        identifier: "doc-1",
      });

      expect(result).toEqual({
        document: {
          id: "doc-1",
          name: "Test Document",
          documentType: "powerhouse/document-model",
          slug: "test-doc",
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
          revisionsList: [
            { scope: "global", revision: 5 },
            { scope: "local", revision: 2 },
            { scope: "custom", revision: 3 },
          ],
          state: { data: "test-state" },
        },
        childIds: ["child-1", "child-2"],
      });
    });

    it("should handle empty revision object", async () => {
      const mockDocument = {
        header: {
          id: "doc-1",
          name: "Test Document",
          documentType: "powerhouse/document-model",
          slug: "test-doc",
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
          branch: "main",
          sig: {
            publicKey: {} as JsonWebKey,
            nonce: "test-nonce",
          },
          revision: {},
        },
        state: {},
        history: {},
        initialState: {},
        operations: {},
        clipboard: [],
      } as unknown as PHDocument;

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });

      const result = await resolvers.document(mockReactorClient, {
        identifier: "doc-1",
      });

      expect(result.document.revisionsList).toEqual([]);
    });
  });

  describe("documentChildren", () => {
    it("should transform children documents to GraphQL format", async () => {
      const mockChildren = {
        results: [
          {
            header: {
              id: "child-1",
              name: "Child 1",
              documentType: "type-1",
              slug: "child-1",
              createdAtUtcIso: "2024-01-01T00:00:00Z",
              lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
              branch: "main",
              sig: {
                publicKey: {} as JsonWebKey,
                nonce: "test-nonce",
              },
              revision: { global: 1 },
            },
            state: { childData: "test" },
            history: {},
            initialState: {},
            operations: {},
            clipboard: [],
          },
          {
            header: {
              id: "child-2",
              name: "Child 2",
              documentType: "type-2",
              slug: "child-2",
              createdAtUtcIso: "2024-01-02T00:00:00Z",
              lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
              branch: "main",
              sig: {
                publicKey: {} as JsonWebKey,
                nonce: "test-nonce",
              },
              revision: { global: 2, local: 1 },
            },
            state: { childData: "test2" },
            history: {},
            initialState: {},
            operations: {},
            clipboard: [],
          },
        ] as unknown as PHDocument[],
        options: {
          cursor: "child-cursor",
          limit: 10,
        },
      };

      vi.mocked(mockReactorClient.getChildren).mockResolvedValue(mockChildren);

      const result = await resolvers.documentChildren(mockReactorClient, {
        parentIdentifier: "parent-1",
      });

      expect(result).toEqual({
        cursor: "child-cursor",
        hasNextPage: false,
        hasPreviousPage: false,
        items: [
          {
            id: "child-1",
            name: "Child 1",
            documentType: "type-1",
            slug: "child-1",
            createdAtUtcIso: "2024-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
            revisionsList: [{ scope: "global", revision: 1 }],
            state: { childData: "test" },
          },
          {
            id: "child-2",
            name: "Child 2",
            documentType: "type-2",
            slug: "child-2",
            createdAtUtcIso: "2024-01-02T00:00:00Z",
            lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
            revisionsList: [
              { scope: "global", revision: 2 },
              { scope: "local", revision: 1 },
            ],
            state: { childData: "test2" },
          },
        ],
        totalCount: 2,
      });
    });

    it("should handle empty cursor as null", async () => {
      const mockChildren = {
        results: [],
        options: {
          cursor: "",
          limit: 5,
        },
      };

      vi.mocked(mockReactorClient.getChildren).mockResolvedValue(mockChildren);

      const result = await resolvers.documentChildren(mockReactorClient, {
        parentIdentifier: "parent-1",
      });

      expect(result.cursor).toBeNull();
    });
  });

  describe("documentParents", () => {
    it("should transform parent documents to GraphQL format", async () => {
      const mockParents = {
        results: [
          {
            header: {
              id: "parent-1",
              name: "Parent 1",
              documentType: "folder",
              slug: "parent-1",
              createdAtUtcIso: "2024-01-01T00:00:00Z",
              lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
              branch: "main",
              sig: {
                publicKey: {} as JsonWebKey,
                nonce: "test-nonce",
              },
              revision: { global: 10, local: 5, branch: 2 },
            },
            state: { parentData: "test" },
            history: {},
            initialState: {},
            operations: {},
            clipboard: [],
          },
        ] as unknown as PHDocument[],
        options: {
          cursor: "parent-cursor",
          limit: 10,
        },
      };

      vi.mocked(mockReactorClient.getParents).mockResolvedValue(mockParents);

      const result = await resolvers.documentParents(mockReactorClient, {
        childIdentifier: "child-1",
      });

      expect(result).toEqual({
        cursor: "parent-cursor",
        hasNextPage: false,
        hasPreviousPage: false,
        items: [
          {
            id: "parent-1",
            name: "Parent 1",
            documentType: "folder",
            slug: "parent-1",
            createdAtUtcIso: "2024-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
            revisionsList: [
              { scope: "global", revision: 10 },
              { scope: "local", revision: 5 },
              { scope: "branch", revision: 2 },
            ],
            state: { parentData: "test" },
          },
        ],
        totalCount: 1,
      });
    });
  });

  describe("findDocuments", () => {
    it("should transform found documents to GraphQL format", async () => {
      const mockDocuments = {
        results: [
          {
            header: {
              id: "doc-1",
              name: "Document 1",
              documentType: "powerhouse/document-model",
              slug: "doc-1",
              createdAtUtcIso: "2024-01-01T00:00:00Z",
              lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
              branch: "main",
              sig: {
                publicKey: {} as JsonWebKey,
                nonce: "test-nonce",
              },
              revision: { global: 1 },
            },
            state: { doc1Data: "test" },
            history: {},
            initialState: {},
            operations: {},
            clipboard: [],
          },
          {
            header: {
              id: "doc-2",
              name: "Document 2",
              documentType: "powerhouse/document-model",
              slug: "doc-2",
              createdAtUtcIso: "2024-01-02T00:00:00Z",
              lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
              branch: "main",
              sig: {
                publicKey: {} as JsonWebKey,
                nonce: "test-nonce",
              },
              revision: { global: 2 },
            },
            state: { doc2Data: "test" },
            history: {},
            initialState: {},
            operations: {},
            clipboard: [],
          },
        ] as unknown as PHDocument[],
        options: {
          cursor: "search-cursor",
          limit: 10,
        },
      };

      vi.mocked(mockReactorClient.find).mockResolvedValue(mockDocuments);

      const result = await resolvers.findDocuments(mockReactorClient, {
        search: {
          type: "powerhouse/document-model",
          parentId: "parent-1",
        },
      });

      expect(result).toEqual({
        cursor: "search-cursor",
        hasNextPage: false,
        hasPreviousPage: false,
        items: [
          {
            id: "doc-1",
            name: "Document 1",
            documentType: "powerhouse/document-model",
            slug: "doc-1",
            createdAtUtcIso: "2024-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
            revisionsList: [{ scope: "global", revision: 1 }],
            state: { doc1Data: "test" },
          },
          {
            id: "doc-2",
            name: "Document 2",
            documentType: "powerhouse/document-model",
            slug: "doc-2",
            createdAtUtcIso: "2024-01-02T00:00:00Z",
            lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
            revisionsList: [{ scope: "global", revision: 2 }],
            state: { doc2Data: "test" },
          },
        ],
        totalCount: 2,
      });
    });
  });

  describe("jobStatus", () => {
    it("should transform completed job with all fields", async () => {
      const mockJobInfo: JobInfo = {
        id: "job-123",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        completedAtUtcIso: "2024-01-01T00:05:00Z",
        result: { success: true, data: "test" },
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      };

      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue(mockJobInfo);

      const result = await resolvers.jobStatus(mockReactorClient, {
        jobId: "job-123",
      });

      expect(result).toEqual({
        id: "job-123",
        status: JobStatus.READ_MODELS_READY,
        createdAt: "2024-01-01T00:00:00Z",
        completedAt: "2024-01-01T00:05:00Z",
        error: null,
        result: { success: true, data: "test" },
      });
    });

    it("should transform failed job with error", async () => {
      const mockJobInfo: JobInfo = {
        id: "job-456",
        status: JobStatus.FAILED,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        error: { message: "Job failed due to timeout", stack: "stack trace" },
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      };

      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue(mockJobInfo);

      const result = await resolvers.jobStatus(mockReactorClient, {
        jobId: "job-456",
      });

      expect(result).toEqual({
        id: "job-456",
        status: JobStatus.FAILED,
        createdAt: "2024-01-01T00:00:00Z",
        completedAt: null,
        error: "Job failed due to timeout",
        result: null,
      });
    });

    it("should transform pending job with minimal fields", async () => {
      const mockJobInfo: JobInfo = {
        id: "job-789",
        status: JobStatus.PENDING,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      };

      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue(mockJobInfo);

      const result = await resolvers.jobStatus(mockReactorClient, {
        jobId: "job-789",
      });

      expect(result).toEqual({
        id: "job-789",
        status: JobStatus.PENDING,
        createdAt: "2024-01-01T00:00:00Z",
        completedAt: null,
        error: null,
        result: null,
      });
    });

    it("should handle undefined optional fields as null", async () => {
      const mockJobInfo: JobInfo = {
        id: "job-999",
        status: JobStatus.RUNNING,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        completedAtUtcIso: undefined,
        error: undefined,
        result: undefined,
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      };

      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue(mockJobInfo);

      const result = await resolvers.jobStatus(mockReactorClient, {
        jobId: "job-999",
      });

      expect(result.completedAt).toBeNull();
      expect(result.error).toBeNull();
      expect(result.result).toBeNull();
    });
  });

  describe("Error handling", () => {
    it("should wrap ReactorClient errors with descriptive messages", async () => {
      vi.mocked(mockReactorClient.getDocumentModels).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(
        resolvers.documentModels(mockReactorClient, {}),
      ).rejects.toThrow("Failed to fetch document models: Network timeout");
    });

    it("should handle unknown error types", async () => {
      vi.mocked(mockReactorClient.get).mockRejectedValue("String error");

      await expect(
        resolvers.document(mockReactorClient, { identifier: "doc-1" }),
      ).rejects.toThrow("Failed to fetch document: Unknown error");
    });

    it("should handle conversion errors separately from fetch errors", async () => {
      const invalidDocument = {
        header: null, // Invalid structure
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: invalidDocument as any,
        childIds: [],
      });

      await expect(
        resolvers.document(mockReactorClient, { identifier: "doc-1" }),
      ).rejects.toThrow("Failed to convert document to GraphQL");
    });
  });
});

describe("ReactorSubgraph Mutation Resolvers", () => {
  let mockReactorClient: IReactorClient;

  const createMockDocument = (overrides = {}): PHDocument =>
    ({
      header: {
        id: "doc-1",
        name: "Test Document",
        documentType: "powerhouse/document-model",
        slug: "test-doc",
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        lastModifiedAtUtcIso: "2024-01-02T00:00:00Z",
        branch: "main",
        sig: {
          publicKey: {} as JsonWebKey,
          nonce: "test-nonce",
        },
        revision: { global: 1 },
      },
      state: { data: "test" },
      history: {},
      initialState: {},
      operations: {},
      clipboard: [],
      ...overrides,
    }) as unknown as PHDocument;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReactorClient = {
      getDocumentModels: vi.fn(),
      get: vi.fn(),
      getChildren: vi.fn(),
      getParents: vi.fn(),
      find: vi.fn(),
      getJobStatus: vi.fn(),
      waitForJob: vi.fn(),
      create: vi.fn(),
      createEmpty: vi.fn(),
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      rename: vi.fn(),
      addChildren: vi.fn(),
      removeChildren: vi.fn(),
      moveChildren: vi.fn(),
      deleteDocument: vi.fn(),
      deleteDocuments: vi.fn(),
      subscribe: vi.fn(),
    };
  });

  describe("createDocument", () => {
    it("should create a document and transform to GraphQL format", async () => {
      const inputDocument = createMockDocument();
      const createdDocument = createMockDocument({
        header: {
          ...inputDocument.header,
          id: "new-doc-id",
        },
      });

      vi.mocked(mockReactorClient.create).mockResolvedValue(createdDocument);

      const result = await resolvers.createDocument(mockReactorClient, {
        document: inputDocument,
        parentIdentifier: "parent-1",
      });

      expect(mockReactorClient.create).toHaveBeenCalledWith(
        inputDocument,
        "parent-1",
      );
      expect(result.id).toBe("new-doc-id");
      expect(result.name).toBe("Test Document");
      expect(result.documentType).toBe("powerhouse/document-model");
    });

    it("should handle null parentIdentifier", async () => {
      const inputDocument = createMockDocument();
      vi.mocked(mockReactorClient.create).mockResolvedValue(inputDocument);

      await resolvers.createDocument(mockReactorClient, {
        document: inputDocument,
        parentIdentifier: null,
      });

      expect(mockReactorClient.create).toHaveBeenCalledWith(
        inputDocument,
        undefined,
      );
    });

    it("should reject invalid document input", async () => {
      await expect(
        resolvers.createDocument(mockReactorClient, {
          document: null,
          parentIdentifier: null,
        }),
      ).rejects.toThrow("Invalid document: must be an object");
    });

    it("should reject document without header", async () => {
      await expect(
        resolvers.createDocument(mockReactorClient, {
          document: { state: {} },
          parentIdentifier: null,
        }),
      ).rejects.toThrow("Invalid document: missing or invalid header");
    });

    it("should handle creation errors", async () => {
      const inputDocument = createMockDocument();
      vi.mocked(mockReactorClient.create).mockRejectedValue(
        new Error("Database error"),
      );

      await expect(
        resolvers.createDocument(mockReactorClient, {
          document: inputDocument,
          parentIdentifier: null,
        }),
      ).rejects.toThrow("Failed to create document: Database error");
    });
  });

  describe("createEmptyDocument", () => {
    it("should create an empty document of specified type", async () => {
      const emptyDocument = createMockDocument();
      vi.mocked(mockReactorClient.createEmpty).mockResolvedValue(emptyDocument);

      const result = await resolvers.createEmptyDocument(mockReactorClient, {
        documentType: "powerhouse/document-model",
        parentIdentifier: "parent-1",
      });

      expect(mockReactorClient.createEmpty).toHaveBeenCalledWith(
        "powerhouse/document-model",
        "parent-1",
      );
      expect(result.id).toBe("doc-1");
      expect(result.documentType).toBe("powerhouse/document-model");
    });

    it("should handle null parentIdentifier", async () => {
      const emptyDocument = createMockDocument();
      vi.mocked(mockReactorClient.createEmpty).mockResolvedValue(emptyDocument);

      await resolvers.createEmptyDocument(mockReactorClient, {
        documentType: "powerhouse/document-model",
        parentIdentifier: null,
      });

      expect(mockReactorClient.createEmpty).toHaveBeenCalledWith(
        "powerhouse/document-model",
        undefined,
      );
    });

    it("should handle creation errors", async () => {
      vi.mocked(mockReactorClient.createEmpty).mockRejectedValue(
        new Error("Invalid document type"),
      );

      await expect(
        resolvers.createEmptyDocument(mockReactorClient, {
          documentType: "invalid/type",
          parentIdentifier: null,
        }),
      ).rejects.toThrow(
        "Failed to create empty document: Invalid document type",
      );
    });
  });

  describe("renameDocument", () => {
    it("should rename a document", async () => {
      const renamedDocument = createMockDocument({
        header: {
          ...createMockDocument().header,
          name: "New Name",
        },
      });
      vi.mocked(mockReactorClient.rename).mockResolvedValue(renamedDocument);

      const result = await resolvers.renameDocument(mockReactorClient, {
        documentIdentifier: "doc-1",
        name: "New Name",
        view: { branch: "main", scopes: ["global"] },
      });

      expect(mockReactorClient.rename).toHaveBeenCalledWith(
        "doc-1",
        "New Name",
        { branch: "main", scopes: ["global"] },
      );
      expect(result.name).toBe("New Name");
    });

    it("should handle null view filter", async () => {
      const renamedDocument = createMockDocument();
      vi.mocked(mockReactorClient.rename).mockResolvedValue(renamedDocument);

      await resolvers.renameDocument(mockReactorClient, {
        documentIdentifier: "doc-1",
        name: "New Name",
        view: null,
      });

      expect(mockReactorClient.rename).toHaveBeenCalledWith(
        "doc-1",
        "New Name",
        undefined,
      );
    });

    it("should handle rename errors", async () => {
      vi.mocked(mockReactorClient.rename).mockRejectedValue(
        new Error("Document not found"),
      );

      await expect(
        resolvers.renameDocument(mockReactorClient, {
          documentIdentifier: "doc-1",
          name: "New Name",
          view: null,
        }),
      ).rejects.toThrow("Failed to rename document: Document not found");
    });
  });

  describe("addChildren", () => {
    it("should add children to a parent document", async () => {
      const parentDocument = createMockDocument();
      vi.mocked(mockReactorClient.addChildren).mockResolvedValue(
        parentDocument,
      );

      const result = await resolvers.addChildren(mockReactorClient, {
        parentIdentifier: "parent-1",
        documentIdentifiers: ["child-1", "child-2"],
        view: { branch: "main", scopes: null },
      });

      expect(mockReactorClient.addChildren).toHaveBeenCalledWith(
        "parent-1",
        ["child-1", "child-2"],
        { branch: "main", scopes: undefined },
      );
      expect(result.id).toBe("doc-1");
    });

    it("should handle errors when adding children", async () => {
      vi.mocked(mockReactorClient.addChildren).mockRejectedValue(
        new Error("Child not found"),
      );

      await expect(
        resolvers.addChildren(mockReactorClient, {
          parentIdentifier: "parent-1",
          documentIdentifiers: ["child-1"],
          view: null,
        }),
      ).rejects.toThrow("Failed to add children: Child not found");
    });
  });

  describe("removeChildren", () => {
    it("should remove children from a parent document", async () => {
      const parentDocument = createMockDocument();
      vi.mocked(mockReactorClient.removeChildren).mockResolvedValue(
        parentDocument,
      );

      const result = await resolvers.removeChildren(mockReactorClient, {
        parentIdentifier: "parent-1",
        documentIdentifiers: ["child-1", "child-2"],
        view: null,
      });

      expect(mockReactorClient.removeChildren).toHaveBeenCalledWith(
        "parent-1",
        ["child-1", "child-2"],
        undefined,
      );
      expect(result.id).toBe("doc-1");
    });

    it("should handle errors when removing children", async () => {
      vi.mocked(mockReactorClient.removeChildren).mockRejectedValue(
        new Error("Child relationship not found"),
      );

      await expect(
        resolvers.removeChildren(mockReactorClient, {
          parentIdentifier: "parent-1",
          documentIdentifiers: ["child-1"],
          view: null,
        }),
      ).rejects.toThrow(
        "Failed to remove children: Child relationship not found",
      );
    });
  });

  describe("moveChildren", () => {
    it("should move children between parent documents", async () => {
      const sourceDocument = createMockDocument();
      const targetDocument = createMockDocument();
      // Update IDs after creation
      sourceDocument.header.id = "source-1";
      targetDocument.header.id = "target-1";

      vi.mocked(mockReactorClient.moveChildren).mockResolvedValue({
        source: sourceDocument,
        target: targetDocument,
      });

      const result = await resolvers.moveChildren(mockReactorClient, {
        sourceParentIdentifier: "source-1",
        targetParentIdentifier: "target-1",
        documentIdentifiers: ["child-1", "child-2"],
        view: { branch: "main", scopes: ["global"] },
      });

      expect(mockReactorClient.moveChildren).toHaveBeenCalledWith(
        "source-1",
        "target-1",
        ["child-1", "child-2"],
        { branch: "main", scopes: ["global"] },
      );
      expect(result.source.id).toBe("source-1");
      expect(result.target.id).toBe("target-1");
    });

    it("should handle errors when moving children", async () => {
      vi.mocked(mockReactorClient.moveChildren).mockRejectedValue(
        new Error("Target parent not found"),
      );

      await expect(
        resolvers.moveChildren(mockReactorClient, {
          sourceParentIdentifier: "source-1",
          targetParentIdentifier: "target-1",
          documentIdentifiers: ["child-1"],
          view: null,
        }),
      ).rejects.toThrow("Failed to move children: Target parent not found");
    });
  });

  describe("deleteDocument", () => {
    it("should delete a document without propagation", async () => {
      vi.mocked(mockReactorClient.deleteDocument).mockResolvedValue();

      const result = await resolvers.deleteDocument(mockReactorClient, {
        identifier: "doc-1",
        propagate: null,
      });

      expect(mockReactorClient.deleteDocument).toHaveBeenCalledWith(
        "doc-1",
        undefined,
      );
      expect(result).toBe(true);
    });

    it("should delete a document with CASCADE propagation", async () => {
      vi.mocked(mockReactorClient.deleteDocument).mockResolvedValue();

      const result = await resolvers.deleteDocument(mockReactorClient, {
        identifier: "doc-1",
        propagate: "CASCADE" as any,
      });

      expect(mockReactorClient.deleteDocument).toHaveBeenCalledWith(
        "doc-1",
        "CASCADE",
      );
      expect(result).toBe(true);
    });

    it("should handle deletion errors", async () => {
      vi.mocked(mockReactorClient.deleteDocument).mockRejectedValue(
        new Error("Document not found"),
      );

      await expect(
        resolvers.deleteDocument(mockReactorClient, {
          identifier: "doc-1",
          propagate: null,
        }),
      ).rejects.toThrow("Failed to delete document: Document not found");
    });
  });

  describe("deleteDocuments", () => {
    it("should delete multiple documents", async () => {
      vi.mocked(mockReactorClient.deleteDocuments).mockResolvedValue();

      const result = await resolvers.deleteDocuments(mockReactorClient, {
        identifiers: ["doc-1", "doc-2", "doc-3"],
        propagate: "ORPHAN" as any,
      });

      expect(mockReactorClient.deleteDocuments).toHaveBeenCalledWith(
        ["doc-1", "doc-2", "doc-3"],
        "ORPHAN",
      );
      expect(result).toBe(true);
    });

    it("should handle batch deletion errors", async () => {
      vi.mocked(mockReactorClient.deleteDocuments).mockRejectedValue(
        new Error("Partial deletion failed"),
      );

      await expect(
        resolvers.deleteDocuments(mockReactorClient, {
          identifiers: ["doc-1", "doc-2"],
          propagate: null,
        }),
      ).rejects.toThrow("Failed to delete documents: Partial deletion failed");
    });
  });

  describe("mutateDocument", () => {
    it("should mutate a document with validated actions", async () => {
      const mockDocument = createMockDocument();
      const mockActions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "New Name" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const mockModule = {
        documentModel: {
          global: {
            name: "powerhouse/document-model",
            specifications: [
              {
                modules: [
                  {
                    operations: [{ name: "SET_NAME", scope: "global" }],
                  },
                ],
              },
            ],
          },
        },
        actions: {
          setName: vi.fn((input: any) => mockActions[0]),
        },
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });
      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue({
        results: [mockModule as any],
        options: { cursor: "", limit: 10 },
      });
      vi.mocked(mockReactorClient.mutate).mockResolvedValue(mockDocument);

      const result = await resolvers.mutateDocument(mockReactorClient, {
        documentIdentifier: "doc-1",
        actions: mockActions,
        view: { branch: "main", scopes: null },
      });

      expect(mockReactorClient.mutate).toHaveBeenCalledWith(
        "doc-1",
        "main",
        mockActions,
      );
      expect(result.id).toBe("doc-1");
    });

    it("should use default branch when view is null", async () => {
      const mockDocument = createMockDocument();
      const mockActions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "New Name" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const mockModule = {
        documentModel: {
          global: {
            name: "powerhouse/document-model",
            specifications: [
              {
                modules: [
                  {
                    operations: [{ name: "SET_NAME", scope: "global" }],
                  },
                ],
              },
            ],
          },
        },
        actions: {
          setName: vi.fn((input: any) => mockActions[0]),
        },
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });
      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue({
        results: [mockModule as any],
        options: { cursor: "", limit: 10 },
      });
      vi.mocked(mockReactorClient.mutate).mockResolvedValue(mockDocument);

      await resolvers.mutateDocument(mockReactorClient, {
        documentIdentifier: "doc-1",
        actions: mockActions,
        view: null,
      });

      expect(mockReactorClient.mutate).toHaveBeenCalledWith(
        "doc-1",
        "main",
        mockActions,
      );
    });

    it("should reject invalid action structure", async () => {
      await expect(
        resolvers.mutateDocument(mockReactorClient, {
          documentIdentifier: "doc-1",
          actions: [{ invalidAction: true }],
          view: null,
        }),
      ).rejects.toThrow("Action at index 0");
    });

    it("should handle mutation errors", async () => {
      const mockDocument = createMockDocument();
      const mockActions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "New Name" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const mockModule = {
        documentModel: {
          global: {
            name: "powerhouse/document-model",
            specifications: [
              {
                modules: [
                  {
                    operations: [{ name: "SET_NAME", scope: "global" }],
                  },
                ],
              },
            ],
          },
        },
        actions: {
          setName: vi.fn((input: any) => mockActions[0]),
        },
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });
      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue({
        results: [mockModule as any],
        options: { cursor: "", limit: 10 },
      });
      vi.mocked(mockReactorClient.mutate).mockRejectedValue(
        new Error("Mutation failed"),
      );

      await expect(
        resolvers.mutateDocument(mockReactorClient, {
          documentIdentifier: "doc-1",
          actions: mockActions,
          view: null,
        }),
      ).rejects.toThrow("Failed to mutate document: Mutation failed");
    });
  });

  describe("mutateDocumentAsync", () => {
    it("should submit actions asynchronously and return job ID", async () => {
      const mockDocument = createMockDocument();
      const mockActions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "New Name" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const mockModule = {
        documentModel: {
          global: {
            name: "powerhouse/document-model",
            specifications: [
              {
                modules: [
                  {
                    operations: [{ name: "SET_NAME", scope: "global" }],
                  },
                ],
              },
            ],
          },
        },
        actions: {
          setName: vi.fn((input: any) => mockActions[0]),
        },
      };

      const mockJobInfo: JobInfo = {
        id: "job-123",
        status: JobStatus.PENDING,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });
      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue({
        results: [mockModule as any],
        options: { cursor: "", limit: 10 },
      });
      vi.mocked(mockReactorClient.mutateAsync).mockResolvedValue(mockJobInfo);

      const result = await resolvers.mutateDocumentAsync(mockReactorClient, {
        documentIdentifier: "doc-1",
        actions: mockActions,
        view: { branch: "develop", scopes: null },
      });

      expect(mockReactorClient.mutateAsync).toHaveBeenCalledWith(
        "doc-1",
        "develop",
        mockActions,
      );
      expect(result).toBe("job-123");
    });

    it("should handle async mutation errors", async () => {
      const mockDocument = createMockDocument();
      const mockActions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "New Name" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const mockModule = {
        documentModel: {
          global: {
            name: "powerhouse/document-model",
            specifications: [
              {
                modules: [
                  {
                    operations: [{ name: "SET_NAME", scope: "global" }],
                  },
                ],
              },
            ],
          },
        },
        actions: {
          setName: vi.fn((input: any) => mockActions[0]),
        },
      };

      vi.mocked(mockReactorClient.get).mockResolvedValue({
        document: mockDocument,
        childIds: [],
      });
      vi.mocked(mockReactorClient.getDocumentModels).mockResolvedValue({
        results: [mockModule as any],
        options: { cursor: "", limit: 10 },
      });
      vi.mocked(mockReactorClient.mutateAsync).mockRejectedValue(
        new Error("Queue full"),
      );

      await expect(
        resolvers.mutateDocumentAsync(mockReactorClient, {
          documentIdentifier: "doc-1",
          actions: mockActions,
          view: null,
        }),
      ).rejects.toThrow("Failed to submit document mutation: Queue full");
    });
  });
});
