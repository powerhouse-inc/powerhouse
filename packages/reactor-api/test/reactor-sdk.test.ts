import { describe, expect, it, vi, beforeEach } from "vitest";
import { print } from "graphql";
import { createFetchRequester, type FetchLike } from "../src/graphql/reactor/requester.js";
import { createValidatingRequester } from "../src/graphql/reactor/requester.with-zod.js";
import { createReactorSdk } from "../src/graphql/reactor/sdk.factory.js";
import { GetDocumentDocument } from "../src/graphql/reactor/operations.js";

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
          data: { test: "result" }
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch,
        { "Authorization": "Bearer token123" }
      );

      const variables = { identifier: "doc-123", view: { branch: "main" } };
      const result = await requester(GetDocumentDocument, variables, {});

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": "Bearer token123",
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
        mockFetch
      );

      await expect(
        requester(GetDocumentDocument, {}, {})
      ).rejects.toThrow("GraphQL HTTP 500");
    });

    it("should handle GraphQL errors", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          errors: [{ message: "Field not found" }]
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch
      );

      await expect(
        requester(GetDocumentDocument, {}, {})
      ).rejects.toThrow('[{"message":"Field not found"}]');
    });

    it("should work without custom headers", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { test: "result" }
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createFetchRequester(
        "https://api.test.com/graphql",
        mockFetch
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
            revision: 1,
            created: "2023-01-01T00:00:00Z",
            lastModified: "2023-01-01T00:00:00Z",
            parentId: null,
          },
          childIds: [],
        }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: validDocumentResponse
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch
      );

      const result = await requester(
        GetDocumentDocument,
        { identifier: "doc-123" },
        {}
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
        }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: malformedResponse
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch
      );

      await expect(
        requester(GetDocumentDocument, { identifier: "doc-123" }, {})
      ).rejects.toThrow(); // Should throw Zod validation error
    });

    it("should handle null document response", async () => {
      const nullDocumentResponse = {
        document: null
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: nullDocumentResponse
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const requester = createValidatingRequester(
        "https://api.test.com/graphql",
        mockFetch
      );

      const result = await requester(
        GetDocumentDocument,
        { identifier: "nonexistent" },
        {}
      );

      expect(result).toEqual(nullDocumentResponse);
    });
  });

  describe("createReactorSdk integration", () => {
    let mockFetch: FetchLike;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it("should create SDK with typed methods", async () => {
      const validDocumentResponse = {
        document: {
          document: {
            id: "doc-123",
            slug: "test-document",
            name: "Test Document",
            documentType: "powerhouse/document-model",
            state: {},
            revision: 1,
            created: "2023-01-01T00:00:00Z",
            lastModified: "2023-01-01T00:00:00Z",
            parentId: null,
          },
          childIds: [],
        }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: validDocumentResponse
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const sdk = createReactorSdk(
        "https://api.test.com/graphql",
        mockFetch,
        { "Authorization": "Bearer token123" }
      );

      // Test that SDK has the expected methods
      expect(sdk).toHaveProperty("GetDocument");
      expect(typeof sdk.GetDocument).toBe("function");

      // Test actual call
      const result = await sdk.GetDocument({
        identifier: "doc-123",
        view: { branch: "main" }
      });

      expect(result).toEqual(validDocumentResponse);

      // Verify the underlying fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith("https://api.test.com/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": "Bearer token123",
        },
        body: expect.stringContaining("GetDocument"),
      });
    });

    it("should work without custom headers", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { document: null }
        }),
      };
      (mockFetch as any).mockResolvedValue(mockResponse);

      const sdk = createReactorSdk(
        "https://api.test.com/graphql",
        mockFetch
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