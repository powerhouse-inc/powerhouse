import { decompressFromEncodedURIComponent } from "lz-string";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDocumentSubgraphQuery } from "../src/utils/switchboard.js";

interface CompressedQueryData {
  document: string;
  variables: string;
  headers: string;
}

interface QueryVariables {
  documentId: string;
  driveId: string;
}

interface QueryHeaders {
  Authorization?: string;
}

// Mock the generateDocumentStateQueryFields function
vi.mock("document-drive/utils/graphql", () => ({
  generateDocumentStateQueryFields: vi.fn(() => "stateField1\nstateField2"),
}));

describe("buildDocumentSubgraphQuery", () => {
  const mockDriveUrl = "https://example.com/d/test-drive";
  const mockDocumentId = "test-document-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build query without auth token", () => {
    const result = buildDocumentSubgraphQuery(mockDriveUrl, mockDocumentId);

    // The result should be a compressed string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    // Decompress and verify the JSON structure contains expected fields
    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    expect(decompressed).toHaveProperty("document");
    expect(decompressed).toHaveProperty("variables");
    // Headers should not be present when no auth token
    expect(decompressed).not.toHaveProperty("headers");

    // Verify variables contain correct documentId and driveId
    const variables = JSON.parse(decompressed.variables) as QueryVariables;
    expect(variables).toEqual({
      documentId: mockDocumentId,
      driveId: "test-drive",
    });
  });

  it("should build query with auth token", () => {
    const authToken = "test-auth-token-123";

    const result = buildDocumentSubgraphQuery(
      mockDriveUrl,
      mockDocumentId,
      authToken,
    );

    // The result should be a compressed string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    // Decompress and verify the JSON structure contains auth headers
    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    expect(decompressed).toHaveProperty("document");
    expect(decompressed).toHaveProperty("variables");
    expect(decompressed).toHaveProperty("headers");

    // Verify headers contain Authorization
    const headers = JSON.parse(decompressed.headers) as QueryHeaders;
    expect(headers).toEqual({
      Authorization: `Bearer ${authToken}`,
    });
  });

  it("should extract drive slug from drive URL correctly", () => {
    const driveUrlWithSlug = "https://example.com/d/my-test-drive";

    const result = buildDocumentSubgraphQuery(driveUrlWithSlug, mockDocumentId);

    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;
    const variables = JSON.parse(decompressed.variables) as QueryVariables;

    expect(variables.driveId).toBe("my-test-drive");
  });

  it("should handle empty auth token as undefined", () => {
    const result = buildDocumentSubgraphQuery(mockDriveUrl, mockDocumentId, "");

    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    // Empty string should be treated as no auth token, so headers should not be present
    expect(decompressed).not.toHaveProperty("headers");
  });

  it("should generate correct GraphQL query structure", () => {
    const result = buildDocumentSubgraphQuery(mockDriveUrl, mockDocumentId);

    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    // Verify the document contains expected GraphQL query structure
    expect(decompressed.document)
      .toStrictEqual(`query getDocument($documentId: String!) {
  document(id: $documentId) {
      id
      lastModified
      name
      revision
      stateJSON
    }
  }`);
  });

  it("should handle different drive URL formats", () => {
    const urls = [
      "https://example.com/d/simple-slug",
      "https://subdomain.example.com/d/complex-slug-123",
      "http://localhost:3000/d/local-dev",
    ];

    urls.forEach((url) => {
      const result = buildDocumentSubgraphQuery(url, mockDocumentId);

      const decompressed = JSON.parse(
        decompressFromEncodedURIComponent(result) || "",
      ) as CompressedQueryData;
      const variables = JSON.parse(decompressed.variables) as QueryVariables;

      const expectedSlug = url.split("/").pop();
      expect(variables.driveId).toBe(expectedSlug);
    });
  });

  it("should produce consistent results for same inputs", () => {
    console.log("test-token");
    const result1 = buildDocumentSubgraphQuery(
      mockDriveUrl,
      mockDocumentId,
      "test-token",
    );

    const result2 = buildDocumentSubgraphQuery(
      mockDriveUrl,
      mockDocumentId,
      "test-token",
    );

    // Results should be identical for same inputs
    expect(result1).toBe(result2);
  });

  it("should produce different results for different auth tokens", () => {
    const result1 = buildDocumentSubgraphQuery(
      mockDriveUrl,
      mockDocumentId,
      "token1",
    );

    const result2 = buildDocumentSubgraphQuery(
      mockDriveUrl,
      mockDocumentId,
      "token2",
    );

    // Results should be different for different auth tokens
    expect(result1).not.toBe(result2);
  });
});
