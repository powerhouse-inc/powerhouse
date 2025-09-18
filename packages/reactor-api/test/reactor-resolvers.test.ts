import {
  JobStatus,
  type IReactorClient,
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
      const mockJobInfo = {
        id: "job-123",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        completedAtUtcIso: "2024-01-01T00:05:00Z",
        result: { success: true, data: "test" },
      };

      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue(mockJobInfo);

      const result = await resolvers.jobStatus(mockReactorClient, {
        jobId: "job-123",
      });

      expect(result).toEqual({
        id: "job-123",
        status: JobStatus.COMPLETED,
        createdAt: "2024-01-01T00:00:00Z",
        completedAt: "2024-01-01T00:05:00Z",
        error: null,
        result: { success: true, data: "test" },
      });
    });

    it("should transform failed job with error", async () => {
      const mockJobInfo = {
        id: "job-456",
        status: JobStatus.FAILED,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        error: "Job failed due to timeout",
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
      const mockJobInfo = {
        id: "job-789",
        status: JobStatus.PENDING,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
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
      const mockJobInfo = {
        id: "job-999",
        status: JobStatus.RUNNING,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        completedAtUtcIso: undefined,
        error: undefined,
        result: undefined,
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
