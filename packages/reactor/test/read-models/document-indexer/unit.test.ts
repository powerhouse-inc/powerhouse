import type { Operation } from "document-model";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IOperationStore,
  OperationWithContext,
} from "../../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import type {
  Database,
  DocumentIndexerDatabase,
} from "../../../src/storage/kysely/types.js";

describe("KyselyDocumentIndexer Unit Tests", () => {
  let db: Kysely<Database & DocumentIndexerDatabase>;
  let indexer: KyselyDocumentIndexer;
  let mockOperationStore: IOperationStore;

  beforeEach(async () => {
    const kyselyPGlite = await KyselyPGlite.create();
    db = new Kysely<Database & DocumentIndexerDatabase>({
      dialect: kyselyPGlite.dialect,
    });

    mockOperationStore = {
      apply: vi.fn(),
      getSince: vi.fn(),
      getSinceId: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
      getRevisions: vi.fn(),
    };

    indexer = new KyselyDocumentIndexer(db as any, mockOperationStore);
    await indexer.init();
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("init", () => {
    it("should create tables on initialization", async () => {
      const tables = await db.introspection.getTables();
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("Document");
      expect(tableNames).toContain("DocumentRelationship");
      expect(tableNames).toContain("IndexerState");
    });

    it("should initialize with lastOperationId of 0", async () => {
      const state = await db
        .selectFrom("IndexerState")
        .selectAll()
        .executeTakeFirst();

      expect(state?.lastOperationId).toBe(0);
    });

    it("should catch up on missed operations", async () => {
      const operations: OperationWithContext[] = [
        {
          operation: {
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "doc1",
                targetId: "doc2",
                relationshipType: "child",
              },
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ];

      mockOperationStore.getSinceId = vi
        .fn()
        .mockResolvedValue({ items: operations, hasMore: false });

      const newIndexer = new KyselyDocumentIndexer(
        db as any,
        mockOperationStore,
      );
      await newIndexer.init();

      const relationships = await newIndexer.getOutgoing("doc1");
      expect(relationships).toHaveLength(1);
    });
  });

  describe("indexOperations", () => {
    it("should index ADD_RELATIONSHIP operation", async () => {
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ];

      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships).toHaveLength(1);
      expect(relationships[0].sourceId).toBe("parent");
      expect(relationships[0].targetId).toBe("child");
      expect(relationships[0].relationshipType).toBe("child");
    });

    it("should index REMOVE_RELATIONSHIP operation", async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);

      await indexer.indexOperations([
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "REMOVE_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);

      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships).toHaveLength(0);
    });

    it("should handle empty operations array", async () => {
      await expect(indexer.indexOperations([])).resolves.not.toThrow();
    });

    it("should ignore non-relationship operations", async () => {
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "SOME_OTHER_ACTION",
              scope: "global",
              input: {},
            },
          } as any,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
          },
        },
      ];

      await expect(indexer.indexOperations(operations)).resolves.not.toThrow();
    });

    it("should handle metadata in ADD_RELATIONSHIP", async () => {
      const metadata = { key: "value", nested: { prop: 123 } };
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
                metadata,
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ];

      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent");
      expect(relationships[0].metadata).toEqual(metadata);
    });

    it("should be idempotent for ADD_RELATIONSHIP", async () => {
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ];

      await indexer.indexOperations(operations);
      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent");
      expect(relationships).toHaveLength(1);
    });
  });

  describe("getOutgoing", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child1",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child2",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 3,
            index: 2,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash3",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "ref1",
                relationshipType: "reference",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should return all outgoing relationships", async () => {
      const relationships = await indexer.getOutgoing("parent");
      expect(relationships).toHaveLength(3);
    });

    it("should filter by relationship type", async () => {
      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships).toHaveLength(2);
      expect(relationships.every((r) => r.relationshipType === "child")).toBe(
        true,
      );
    });

    it("should return empty array for non-existent document", async () => {
      const relationships = await indexer.getOutgoing("non-existent");
      expect(relationships).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getOutgoing("parent", undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getIncoming", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent1",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent1",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent2",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent2",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should return all incoming relationships", async () => {
      const relationships = await indexer.getIncoming("child");
      expect(relationships).toHaveLength(2);
      expect(relationships.map((r) => r.sourceId).sort()).toEqual([
        "parent1",
        "parent2",
      ]);
    });

    it("should filter by relationship type", async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 3,
            index: 2,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash3",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent3",
                targetId: "child",
                relationshipType: "reference",
              },
            },
          } as any,
          context: {
            documentId: "parent3",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);

      const childRels = await indexer.getIncoming("child", ["child"]);
      expect(childRels).toHaveLength(2);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getIncoming("child", undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("hasRelationship", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should return true for existing relationship", async () => {
      const exists = await indexer.hasRelationship("parent", "child", [
        "child",
      ]);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent relationship", async () => {
      const exists = await indexer.hasRelationship("parent", "other", [
        "child",
      ]);
      expect(exists).toBe(false);
    });

    it("should filter by relationship type", async () => {
      const exists = await indexer.hasRelationship("parent", "child", [
        "reference",
      ]);
      expect(exists).toBe(false);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.hasRelationship(
          "parent",
          "child",
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getDirectedRelationships", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should return directed relationships", async () => {
      const relationships = await indexer.getDirectedRelationships(
        "parent",
        "child",
        ["child"],
      );
      expect(relationships).toHaveLength(1);
      expect(relationships[0].sourceId).toBe("parent");
      expect(relationships[0].targetId).toBe("child");
    });

    it("should return empty array for opposite direction", async () => {
      const relationships = await indexer.getDirectedRelationships(
        "child",
        "parent",
      );
      expect(relationships).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("findPath", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "doc1",
                targetId: "doc2",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "doc2",
                targetId: "doc3",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "doc2",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should find path between connected documents", async () => {
      const path = await indexer.findPath("doc1", "doc3", ["child"]);
      expect(path).toEqual(["doc1", "doc2", "doc3"]);
    });

    it("should return source document as path if source equals target", async () => {
      const path = await indexer.findPath("doc1", "doc1");
      expect(path).toEqual(["doc1"]);
    });

    it("should return null when no path exists", async () => {
      const path = await indexer.findPath("doc3", "doc1", ["child"]);
      expect(path).toBeNull();
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.findPath("doc1", "doc3", undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("findAncestors", () => {
    beforeEach(async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "grandparent",
                targetId: "parent",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "grandparent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "parent",
                targetId: "child",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);
    });

    it("should find all ancestors", async () => {
      const graph = await indexer.findAncestors("child", ["child"]);
      expect(graph.nodes).toContain("child");
      expect(graph.nodes).toContain("parent");
      expect(graph.nodes).toContain("grandparent");
      expect(graph.edges).toHaveLength(2);
    });

    it("should return graph with only self if no ancestors", async () => {
      const graph = await indexer.findAncestors("grandparent");
      expect(graph.nodes).toEqual(["grandparent"]);
      expect(graph.edges).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.findAncestors("child", undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getRelationshipTypes", () => {
    it("should return empty array when no relationships exist", async () => {
      const types = await indexer.getRelationshipTypes();
      expect(types).toEqual([]);
    });

    it("should return all unique relationship types", async () => {
      await indexer.indexOperations([
        {
          operation: {
            id: 1,
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "doc1",
                targetId: "doc2",
                relationshipType: "child",
              },
            },
          } as any,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
        {
          operation: {
            id: 2,
            index: 1,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash2",
            skip: 0,
            action: {
              type: "ADD_RELATIONSHIP",
              scope: "document",
              input: {
                sourceId: "doc1",
                targetId: "doc3",
                relationshipType: "reference",
              },
            },
          } as any,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "document",
            branch: "main",
          },
        },
      ]);

      const types = await indexer.getRelationshipTypes();
      expect(types.sort()).toEqual(["child", "reference"]);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getRelationshipTypes(controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
