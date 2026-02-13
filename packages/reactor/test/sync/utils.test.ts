import type { OperationWithContext } from "shared/document-model";
import { describe, expect, it } from "vitest";
import type { RemoteFilter } from "../../src/sync/types.js";
import {
  batchOperationsByDocument,
  createIdleHealth,
  filterOperations,
} from "../../src/sync/utils.js";

describe("filterOperations", () => {
  const createOperation = (
    documentId: string,
    scope: string,
    branch: string,
  ): OperationWithContext => ({
    operation: {
      id: `op-${documentId}-${scope}`,
      index: 0,
      skip: 0,
      hash: "hash",
      timestampUtcMs: "2023-01-01T00:00:00.000Z",
      action: {
        type: "TEST",
        scope,
        id: "action-1",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: {},
      },
    } as any,
    context: {
      documentId,
      documentType: "test",
      scope,
      branch,
      ordinal: 1,
    },
  });

  describe("branch filtering", () => {
    it("should filter operations by branch when branch filter is set", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "dev"),
        createOperation("doc3", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: [],
        branch: "main",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
      expect(result[0].context.documentId).toBe("doc1");
      expect(result[1].context.documentId).toBe("doc3");
    });

    it("should not filter by branch when branch filter is empty", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "dev"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: [],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
    });
  });

  describe("documentId filtering", () => {
    it("should filter operations by documentId when documentId filter is set", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "main"),
        createOperation("doc3", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: ["doc1", "doc3"],
        scope: [],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
      expect(result[0].context.documentId).toBe("doc1");
      expect(result[1].context.documentId).toBe("doc3");
    });

    it("should not filter by documentId when documentId filter is empty", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: [],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
    });
  });

  describe("scope filtering", () => {
    it("should filter operations by scope when scope filter is set", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc1", "local", "main"),
        createOperation("doc1", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: ["global"],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
      expect(result[0].context.scope).toBe("global");
      expect(result[1].context.scope).toBe("global");
    });

    it("should not filter by scope when scope filter is empty", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc1", "local", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: [],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
    });

    it("should filter by multiple scopes", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc1", "local", "main"),
        createOperation("doc1", "private", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: ["global", "local"],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
      expect(result[0].context.scope).toBe("global");
      expect(result[1].context.scope).toBe("local");
    });
  });

  describe("combined filtering", () => {
    it("should apply all filters together", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "main"),
        createOperation("doc1", "local", "main"),
        createOperation("doc1", "global", "dev"),
        createOperation("doc3", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: ["doc1", "doc2"],
        scope: ["global"],
        branch: "main",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
      expect(result[0].context.documentId).toBe("doc1");
      expect(result[0].context.scope).toBe("global");
      expect(result[0].context.branch).toBe("main");
      expect(result[1].context.documentId).toBe("doc2");
      expect(result[1].context.scope).toBe("global");
      expect(result[1].context.branch).toBe("main");
    });

    it("should return empty array when no operations match all filters", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "global", "main"),
      ];

      const filter: RemoteFilter = {
        documentId: ["doc3"],
        scope: ["global"],
        branch: "main",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty operations array", () => {
      const operations: OperationWithContext[] = [];

      const filter: RemoteFilter = {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(0);
    });

    it("should pass all operations when all filters are empty", () => {
      const operations = [
        createOperation("doc1", "global", "main"),
        createOperation("doc2", "local", "dev"),
      ];

      const filter: RemoteFilter = {
        documentId: [],
        scope: [],
        branch: "",
      };

      const result = filterOperations(operations, filter);

      expect(result).toHaveLength(2);
    });
  });
});

describe("createIdleHealth", () => {
  it("should create an idle channel health status", () => {
    const health = createIdleHealth();

    expect(health).toEqual({
      state: "idle",
      failureCount: 0,
    });
  });

  it("should create a new object each time", () => {
    const health1 = createIdleHealth();
    const health2 = createIdleHealth();

    expect(health1).not.toBe(health2);
    expect(health1).toEqual(health2);
  });
});

describe("batchOperationsByDocument", () => {
  const createOpWithContext = (
    documentId: string,
    scope: string,
    branch: string,
  ): OperationWithContext => ({
    operation: {
      id: `op-${documentId}-${scope}-${Math.random().toString(36).slice(2, 8)}`,
      index: 0,
      skip: 0,
      hash: "hash",
      timestampUtcMs: "2023-01-01T00:00:00.000Z",
      action: {
        type: "TEST",
        scope,
        id: "action-1",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: {},
      },
    } as OperationWithContext["operation"],
    context: {
      documentId,
      documentType: "test",
      scope,
      branch,
      ordinal: 1,
    },
  });

  it("should return empty array for empty input", () => {
    const result = batchOperationsByDocument([]);
    expect(result).toEqual([]);
  });

  it("should batch consecutive operations with same document and scope", () => {
    const ops = [
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].scope).toBe("global");
    expect(result[0].operations).toHaveLength(3);
    expect(result[0].branch).toBe("main");
  });

  it("should create separate batches when scope changes for same document", () => {
    const ops = [
      createOpWithContext("doc-a", "document", "main"),
      createOpWithContext("doc-a", "global", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(2);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].scope).toBe("document");
    expect(result[0].operations).toHaveLength(1);
    expect(result[1].documentId).toBe("doc-a");
    expect(result[1].scope).toBe("global");
    expect(result[1].operations).toHaveLength(1);
  });

  it("should create separate batches when documentId changes", () => {
    const ops = [
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-b", "global", "main"),
      createOpWithContext("doc-b", "global", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(2);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].scope).toBe("global");
    expect(result[0].operations).toHaveLength(2);
    expect(result[1].documentId).toBe("doc-b");
    expect(result[1].scope).toBe("global");
    expect(result[1].operations).toHaveLength(2);
  });

  it("should preserve order and create new batch when returning to previous documentId", () => {
    const ops = [
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-b", "global", "main"),
      createOpWithContext("doc-b", "global", "main"),
      createOpWithContext("doc-a", "global", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(3);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].operations).toHaveLength(3);
    expect(result[1].documentId).toBe("doc-b");
    expect(result[1].operations).toHaveLength(2);
    expect(result[2].documentId).toBe("doc-a");
    expect(result[2].operations).toHaveLength(1);
  });

  it("should handle single operation", () => {
    const ops = [createOpWithContext("doc-a", "global", "main")];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].scope).toBe("global");
    expect(result[0].operations).toHaveLength(1);
  });

  it("should batch by documentId AND scope together", () => {
    const ops = [
      createOpWithContext("doc-a", "document", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-a", "document", "main"),
      createOpWithContext("doc-a", "global", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(4);
    expect(result[0].documentId).toBe("doc-a");
    expect(result[0].scope).toBe("document");
    expect(result[0].operations).toHaveLength(1);
    expect(result[1].documentId).toBe("doc-a");
    expect(result[1].scope).toBe("global");
    expect(result[1].operations).toHaveLength(1);
    expect(result[2].documentId).toBe("doc-a");
    expect(result[2].scope).toBe("document");
    expect(result[2].operations).toHaveLength(1);
    expect(result[3].documentId).toBe("doc-a");
    expect(result[3].scope).toBe("global");
    expect(result[3].operations).toHaveLength(1);
  });

  it("should handle interleaved documents and scopes", () => {
    const ops = [
      createOpWithContext("doc-a", "document", "main"),
      createOpWithContext("doc-a", "document", "main"),
      createOpWithContext("doc-a", "global", "main"),
      createOpWithContext("doc-b", "global", "main"),
      createOpWithContext("doc-b", "document", "main"),
      createOpWithContext("doc-a", "document", "main"),
    ];
    const result = batchOperationsByDocument(ops);

    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      documentId: "doc-a",
      scope: "document",
    });
    expect(result[0].operations).toHaveLength(2);
    expect(result[1]).toMatchObject({
      documentId: "doc-a",
      scope: "global",
    });
    expect(result[1].operations).toHaveLength(1);
    expect(result[2]).toMatchObject({
      documentId: "doc-b",
      scope: "global",
    });
    expect(result[2].operations).toHaveLength(1);
    expect(result[3]).toMatchObject({
      documentId: "doc-b",
      scope: "document",
    });
    expect(result[3].operations).toHaveLength(1);
    expect(result[4]).toMatchObject({
      documentId: "doc-a",
      scope: "document",
    });
    expect(result[4].operations).toHaveLength(1);
  });
});
