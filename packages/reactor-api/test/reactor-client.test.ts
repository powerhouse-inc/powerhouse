import { print } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactorGraphQLClient } from "../src/graphql/index.js";
import {
  GetDocumentDocument,
  GetDocumentOperationsDocument,
  GetDocumentWithOperationsDocument,
} from "../src/graphql/reactor/gen/graphql.js";
import type { FetchLike } from "../src/graphql/reactor/requester.js";
import { createFetchRequester } from "../src/graphql/reactor/requester.js";
import { createValidatingRequester } from "../src/graphql/reactor/requester.with-zod.js";

describe("ReactorSDK", () => {
  describe("createFetchRequester", () => {
    let mockFetch: FetchLike;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it("should make a POST request with correct headers and body", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { test: "result" },
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch,
        { Authorization: "Bearer token123" },
      );

      const variables = { identifier: "doc-123", view: { branch: "main" } };
      const result = await requester(GetDocumentDocument, variables, {});

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer token123",
        },
        body: JSON.stringify({
          query: print(GetDocumentDocument),
          variables,
        }),
      });

      expect(result).toEqual({ test: "result" });
    });

    it("should handle HTTP errors", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await expect(requester(GetDocumentDocument, {}, {})).rejects.toThrow(
        "GraphQL HTTP 500",
      );
    });

    it("should handle GraphQL errors", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          errors: [{ message: "Field not found" }],
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await expect(requester(GetDocumentDocument, {}, {})).rejects.toThrow(
        '[{"message":"Field not found"}]',
      );
    });

    it("should work without custom headers", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { test: "result" },
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await requester(GetDocumentDocument, {}, {});

      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: expect.any(String),
      });
    });
  });

  describe("createValidatingRequester", () => {
    let mockFetch: FetchLike;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it("should validate successful GetDocument response", async () => {
      const validDocumentResponse = {
        document: {
          document: {
            id: "doc-123",
            slug: "test-document",
            name: "Test Document",
            documentType: "powerhouse/document-model",
            state: {},
            revisionsList: [{ scope: "global", revision: 1 }],
            createdAtUtcIso: "2023-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2023-01-01T00:00:00Z",
          },
          childIds: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: validDocumentResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      const result = await requester(
        GetDocumentDocument,
        { identifier: "doc-123" },
        {},
      );

      expect(result).toEqual(validDocumentResponse);
    });

    it("should reject malformed GetDocument response", async () => {
      const malformedResponse = {
        document: {
          document: {
            id: "doc-123",
            // Missing required fields like name, documentType, etc.
          },
          childIds: "not-an-array", // Should be array
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: malformedResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await expect(
        requester(GetDocumentDocument, { identifier: "doc-123" }, {}),
      ).rejects.toThrow(); // Should throw Zod validation error
    });

    it("should handle null document response", async () => {
      const nullDocumentResponse = {
        document: null,
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: nullDocumentResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      const result = await requester(
        GetDocumentDocument,
        { identifier: "nonexistent" },
        {},
      );

      expect(result).toEqual(nullDocumentResponse);
    });

    it("should validate successful GetDocumentOperations response", async () => {
      const validOperationsResponse = {
        documentOperations: {
          items: [
            {
              index: 0,
              timestampUtcMs: "1000",
              hash: "abc123",
              skip: 0,
              error: null,
              id: "op-1",
              action: {
                id: "action-1",
                type: "SET_NAME",
                timestampUtcMs: "1000",
                input: { name: "Test" },
                scope: "global",
                attachments: null,
                context: {
                  signer: {
                    signatures: ["a, b, c, d, e"],
                    user: {
                      address: "0x123",
                      networkId: "eip155",
                      chainId: 1,
                    },
                    app: { name: "test-app", key: "key-1" },
                  },
                },
              },
            },
          ],
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          cursor: null,
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: validOperationsResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      const result = await requester(
        GetDocumentOperationsDocument,
        {
          filter: { documentId: "doc-1" },
        },
        {},
      );

      expect(result).toEqual(validOperationsResponse);
    });

    it("should validate successful GetDocumentWithOperations response", async () => {
      const validResponse = {
        document: {
          document: {
            id: "doc-123",
            slug: "test-document",
            name: "Test Document",
            documentType: "powerhouse/document-model",
            state: {},
            revisionsList: [{ scope: "global", revision: 1 }],
            createdAtUtcIso: "2023-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2023-01-01T00:00:00Z",
            operations: {
              items: [
                {
                  index: 0,
                  timestampUtcMs: "1000",
                  hash: "abc123",
                  skip: 0,
                  error: null,
                  id: "op-1",
                  action: {
                    id: "action-1",
                    type: "SET_NAME",
                    timestampUtcMs: "1000",
                    input: { name: "Test" },
                    scope: "global",
                    attachments: null,
                    context: null,
                  },
                },
              ],
              totalCount: 1,
              hasNextPage: false,
              hasPreviousPage: false,
              cursor: null,
            },
          },
          childIds: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: validResponse }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      const result = await requester(
        GetDocumentWithOperationsDocument,
        { identifier: "doc-123" },
        {},
      );

      expect(result).toEqual(validResponse);
    });

    it("should reject malformed GetDocumentWithOperations response", async () => {
      const malformedResponse = {
        document: {
          document: {
            id: "doc-123",
            name: "Test Document",
            documentType: "powerhouse/document-model",
            state: {},
            revisionsList: [{ scope: "global", revision: 1 }],
            createdAtUtcIso: "2023-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2023-01-01T00:00:00Z",
            operations: {
              items: [
                {
                  // Missing required fields: index, hash, skip, action
                  timestampUtcMs: "1000",
                },
              ],
              totalCount: 1,
              hasNextPage: false,
              hasPreviousPage: false,
              cursor: null,
            },
          },
          childIds: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: malformedResponse }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await expect(
        requester(
          GetDocumentWithOperationsDocument,
          { identifier: "doc-123" },
          {},
        ),
      ).rejects.toThrow();
    });

    it("should reject malformed GetDocumentOperations response", async () => {
      const malformedResponse = {
        documentOperations: {
          items: [
            {
              // Missing required fields: index, hash, skip, action
              timestampUtcMs: "1000",
            },
          ],
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          cursor: null,
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: malformedResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await expect(
        requester(
          GetDocumentOperationsDocument,
          { filter: { documentId: "doc-1" } },
          {},
        ),
      ).rejects.toThrow();
    });
  });

  describe("createReactorGraphQLClient integration", () => {
    let mockFetch: FetchLike;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it("should create client with typed methods", async () => {
      const validDocumentResponse = {
        document: {
          document: {
            id: "doc-123",
            slug: "test-document",
            name: "Test Document",
            documentType: "powerhouse/document-model",
            state: {},
            revisionsList: [{ scope: "global", revision: 1 }],
            createdAtUtcIso: "2023-01-01T00:00:00Z",
            lastModifiedAtUtcIso: "2023-01-01T00:00:00Z",
          },
          childIds: [],
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: validDocumentResponse,
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const sdk = createReactorGraphQLClient(
        "https://api.test.com/graphql",
        mockFetch,
        { Authorization: "Bearer token123" },
      );

      // Test actual call
      const result = await sdk.GetDocument({
        identifier: "doc-123",
        view: { branch: "main" },
      });

      expect(result).toEqual(validDocumentResponse);

      // Verify the underlying fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer token123",
        },
        body: expect.stringContaining("GetDocument"),
      });
    });

    it("should work without custom headers", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { document: null },
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const sdk = createReactorGraphQLClient(
        "https://api.test.com/graphql",
        mockFetch,
      );

      await sdk.GetDocument({ identifier: "test" });

      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: expect.any(String),
      });
    });
  });
});
