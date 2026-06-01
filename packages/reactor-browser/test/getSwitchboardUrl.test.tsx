import { decompressFromEncodedURIComponent } from "lz-string";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDocumentWithOperationsDocument } from "../src/graphql/gen/schema.js";
import { buildDocumentSubgraphQuery } from "../src/utils/switchboard.js";

interface CompressedQueryData {
  document: string;
  variables: string;
  headers: string;
}

interface QueryVariables {
  identifier: string;
}

interface QueryHeaders {
  Authorization?: string;
}

const documentWithOperationsQuery =
  GetDocumentWithOperationsDocument.loc!.source.body;

// Mock the generateDocumentStateQueryFields function
vi.mock("document-drive", () => ({
  generateDocumentStateQueryFields: vi.fn(() => "stateField1\nstateField2"),
}));

describe("buildDocumentSubgraphQuery", () => {
  const _mockDriveUrl = "https://example.com/d/test-drive";
  const mockDocumentId = "test-document-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build query without auth token", () => {
    const result = buildDocumentSubgraphQuery(mockDocumentId);

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
      identifier: mockDocumentId,
    });
  });

  it("should build query with auth token", () => {
    const authToken = "test-auth-token-123";

    const result = buildDocumentSubgraphQuery(mockDocumentId, authToken);

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

  it("should handle empty auth token as undefined", () => {
    const result = buildDocumentSubgraphQuery(mockDocumentId, "");

    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    // Empty string should be treated as no auth token, so headers should not be present
    expect(decompressed).not.toHaveProperty("headers");
  });

  it("should generate correct GraphQL query structure", () => {
    const result = buildDocumentSubgraphQuery(mockDocumentId);

    const decompressed = JSON.parse(
      decompressFromEncodedURIComponent(result) || "",
    ) as CompressedQueryData;

    // Verify the document contains expected GraphQL query structure
    expect(decompressed.document.replaceAll(/\s/g, "")).toStrictEqual(
      documentWithOperationsQuery.replaceAll(/\s/g, ""),
    );
  });

  it("should produce consistent results for same inputs", () => {
    console.log("test-token");
    const result1 = buildDocumentSubgraphQuery(mockDocumentId, "test-token");

    const result2 = buildDocumentSubgraphQuery(mockDocumentId, "test-token");

    // Results should be identical for same inputs
    expect(result1).toBe(result2);
  });

  it("should produce different results for different auth tokens", () => {
    const result1 = buildDocumentSubgraphQuery(mockDocumentId, "token1");

    const result2 = buildDocumentSubgraphQuery(mockDocumentId, "token2");

    // Results should be different for different auth tokens
    expect(result1).not.toBe(result2);
  });
});
