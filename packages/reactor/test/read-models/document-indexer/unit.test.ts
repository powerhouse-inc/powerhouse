import { PGlite } from "@electric-sql/pglite";
import type {
  AddRelationshipAction,
  Operation,
  OperationContext,
  OperationWithContext,
  RemoveRelationshipAction,
} from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { v4 as uuidv4 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import type {
  Database,
  DocumentIndexerDatabase,
} from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";

describe("KyselyDocumentIndexer Unit Tests", () => {
  let db: Kysely<Database & DocumentIndexerDatabase>;
  let indexer: KyselyDocumentIndexer;
  let mockOperationStore: IOperationStore;
  let mockConsistencyTracker: IConsistencyTracker;

  beforeEach(async () => {
    const baseDb = new Kysely<Database & DocumentIndexerDatabase>({
      dialect: new PGliteDialect(new PGlite()),
    });

    // Run migrations to create all tables
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }

    db = baseDb.withSchema(REACTOR_SCHEMA);

    mockOperationStore = {
      apply: vi.fn(),
      getSince: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getSinceId: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getConflicting: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getRevisions: vi.fn().mockResolvedValue({
        revision: {},
        latestTimestamp: new Date().toISOString(),
      }),
    };

    mockConsistencyTracker = {
      update: vi.fn(),
      getLatest: vi.fn(),
      waitFor: vi.fn().mockResolvedValue(undefined),
      serialize: vi.fn(),
      hydrate: vi.fn(),
    };

    indexer = new KyselyDocumentIndexer(
      db,
      mockOperationStore,
      mockConsistencyTracker,
    );
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
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "doc1",
          targetId: "doc2",
          relationshipType: "child",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "doc1",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      mockOperationStore.getSinceId = vi.fn().mockResolvedValue({
        results: operations,
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      });

      const newIndexer = new KyselyDocumentIndexer(
        db,
        mockOperationStore,
        mockConsistencyTracker,
      );
      await newIndexer.init();

      const relationships = await newIndexer.getOutgoing("doc1");
      expect(relationships.results).toHaveLength(1);
    });
  });

  describe("indexOperations", () => {
    it("should index ADD_RELATIONSHIP operation", async () => {
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships.results).toHaveLength(1);
      expect(relationships.results[0].sourceId).toBe("parent");
      expect(relationships.results[0].targetId).toBe("child");
      expect(relationships.results[0].relationshipType).toBe("child");
    });

    it("should index REMOVE_RELATIONSHIP operation", async () => {
      const addAction: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const addOperation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: addAction,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const addOperations: OperationWithContext[] = [
        {
          operation: addOperation,
          context,
        },
      ];

      await indexer.indexOperations(addOperations);

      const removeAction: RemoveRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "REMOVE_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const removeOperation: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: removeAction,
      };
      const removeOperations: OperationWithContext[] = [
        {
          operation: removeOperation,
          context,
        },
      ];

      await indexer.indexOperations(removeOperations);

      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships.results).toHaveLength(0);
    });

    it("should handle empty operations array", async () => {
      await expect(indexer.indexOperations([])).resolves.not.toThrow();
    });

    it("should ignore non-relationship operations", async () => {
      const operations: OperationWithContext[] = [
        {
          operation: {
            id: uuidv4(),
            index: 0,
            timestampUtcMs: new Date().toISOString(),
            hash: "hash1",
            skip: 0,
            action: {
              id: uuidv4(),
              timestampUtcMs: new Date().toISOString(),
              type: "SOME_OTHER_ACTION",
              scope: "global",
              input: {},
            },
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await expect(indexer.indexOperations(operations)).resolves.not.toThrow();
    });

    it("should handle metadata in ADD_RELATIONSHIP", async () => {
      const metadata = { key: "value", nested: { prop: 123 } };
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
          metadata,
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent");
      expect(relationships.results[0].metadata).toEqual(metadata);
    });

    it("should be idempotent for ADD_RELATIONSHIP", async () => {
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);
      await indexer.indexOperations(operations);

      const relationships = await indexer.getOutgoing("parent");
      expect(relationships.results).toHaveLength(1);
    });
  });

  describe("getOutgoing", () => {
    beforeEach(async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child1",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child2",
          relationshipType: "child",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const action3: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "ref1",
          relationshipType: "reference",
        },
      };
      const operation3: Operation = {
        id: uuidv4(),
        index: 2,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash3",
        skip: 0,
        action: action3,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation: operation1,
          context,
        },
        {
          operation: operation2,
          context,
        },
        {
          operation: operation3,
          context,
        },
      ];

      await indexer.indexOperations(operations);
    });

    it("should return all outgoing relationships", async () => {
      const relationships = await indexer.getOutgoing("parent");
      expect(relationships.results).toHaveLength(3);
    });

    it("should filter by relationship type", async () => {
      const relationships = await indexer.getOutgoing("parent", ["child"]);
      expect(relationships.results).toHaveLength(2);
      expect(
        relationships.results.every((r) => r.relationshipType === "child"),
      ).toBe(true);
    });

    it("should return empty array for non-existent document", async () => {
      const relationships = await indexer.getOutgoing("non-existent");
      expect(relationships.results).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getOutgoing(
          "parent",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should respect limit parameter", async () => {
      const relationships = await indexer.getOutgoing("parent", undefined, {
        cursor: "0",
        limit: 2,
      });
      expect(relationships.results).toHaveLength(2);
    });

    it("should respect cursor parameter", async () => {
      const firstPage = await indexer.getOutgoing("parent", undefined, {
        cursor: "0",
        limit: 2,
      });
      const secondPage = await indexer.getOutgoing("parent", undefined, {
        cursor: "2",
        limit: 2,
      });

      expect(firstPage.results).toHaveLength(2);
      expect(secondPage.results).toHaveLength(1);

      const allIds = [
        ...firstPage.results.map((r) => r.targetId),
        ...secondPage.results.map((r) => r.targetId),
      ];
      expect(allIds).toHaveLength(3);
      expect(new Set(allIds).size).toBe(3);
    });

    it("should set nextCursor when more results exist", async () => {
      const relationships = await indexer.getOutgoing("parent", undefined, {
        cursor: "0",
        limit: 2,
      });

      expect(relationships.nextCursor).toBe("2");
    });

    it("should not set nextCursor when no more results", async () => {
      const relationships = await indexer.getOutgoing("parent", undefined, {
        cursor: "0",
        limit: 10,
      });

      expect(relationships.nextCursor).toBeUndefined();
    });

    it("should provide next function for pagination", async () => {
      const firstPage = await indexer.getOutgoing("parent", undefined, {
        cursor: "0",
        limit: 2,
      });

      expect(firstPage.next).toBeDefined();

      const secondPage = await firstPage.next!();
      expect(secondPage.results).toHaveLength(1);
      expect(secondPage.next).toBeUndefined();
    });
  });

  describe("getIncoming", () => {
    beforeEach(async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent1",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const context1: OperationContext = {
        documentId: "parent1",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent2",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const context2: OperationContext = {
        documentId: "parent2",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation: operation1,
          context: context1,
        },
        {
          operation: operation2,
          context: context2,
        },
      ];

      await indexer.indexOperations(operations);
    });

    it("should return all incoming relationships", async () => {
      const relationships = await indexer.getIncoming("child");
      expect(relationships.results).toHaveLength(2);
      expect(relationships.results.map((r) => r.sourceId).sort()).toEqual([
        "parent1",
        "parent2",
      ]);
    });

    it("should filter by relationship type", async () => {
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent3",
          targetId: "child",
          relationshipType: "reference",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 2,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash3",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent3",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);

      const childRels = await indexer.getIncoming("child", ["child"]);
      expect(childRels.results).toHaveLength(2);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getIncoming(
          "child",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should respect limit parameter", async () => {
      const relationships = await indexer.getIncoming("child", undefined, {
        cursor: "0",
        limit: 1,
      });
      expect(relationships.results).toHaveLength(1);
    });

    it("should respect cursor parameter", async () => {
      const firstPage = await indexer.getIncoming("child", undefined, {
        cursor: "0",
        limit: 1,
      });
      const secondPage = await indexer.getIncoming("child", undefined, {
        cursor: "1",
        limit: 1,
      });

      expect(firstPage.results).toHaveLength(1);
      expect(secondPage.results).toHaveLength(1);

      const allIds = [
        firstPage.results[0].sourceId,
        secondPage.results[0].sourceId,
      ];
      expect(new Set(allIds).size).toBe(2);
    });

    it("should set nextCursor when more results exist", async () => {
      const relationships = await indexer.getIncoming("child", undefined, {
        cursor: "0",
        limit: 1,
      });

      expect(relationships.nextCursor).toBe("1");
    });

    it("should not set nextCursor when no more results", async () => {
      const relationships = await indexer.getIncoming("child", undefined, {
        cursor: "0",
        limit: 10,
      });

      expect(relationships.nextCursor).toBeUndefined();
    });

    it("should provide next function for pagination", async () => {
      const firstPage = await indexer.getIncoming("child", undefined, {
        cursor: "0",
        limit: 1,
      });

      expect(firstPage.next).toBeDefined();

      const secondPage = await firstPage.next!();
      expect(secondPage.results).toHaveLength(1);
      expect(secondPage.next).toBeUndefined();
    });
  });

  describe("hasRelationship", () => {
    beforeEach(async () => {
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);
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
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getDirectedRelationships", () => {
    beforeEach(async () => {
      const action: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action,
      };
      const context: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation,
          context,
        },
      ];

      await indexer.indexOperations(operations);
    });

    it("should return directed relationships", async () => {
      const relationships = await indexer.getDirectedRelationships(
        "parent",
        "child",
        ["child"],
      );
      expect(relationships.results).toHaveLength(1);
      expect(relationships.results[0].sourceId).toBe("parent");
      expect(relationships.results[0].targetId).toBe("child");
    });

    it("should return empty array for opposite direction", async () => {
      const relationships = await indexer.getDirectedRelationships(
        "child",
        "parent",
      );
      expect(relationships.results).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    describe("paging", () => {
      beforeEach(async () => {
        const types = ["child", "reference", "link"];
        const operations: OperationWithContext[] = [];

        for (let i = 0; i < types.length; i++) {
          const action: AddRelationshipAction = {
            id: uuidv4(),
            timestampUtcMs: new Date().toISOString(),
            type: "ADD_RELATIONSHIP",
            scope: "document",
            input: {
              sourceId: "parent",
              targetId: "child",
              relationshipType: types[i],
            },
          };
          const operation: Operation = {
            id: uuidv4(),
            index: i + 1,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash${i + 2}`,
            skip: 0,
            action,
          };
          const context: OperationContext = {
            documentId: "parent",
            documentType: "test",
            scope: "document",
            branch: "main",
            ordinal: i + 2,
          };
          operations.push({ operation, context });
        }

        await indexer.indexOperations(operations);
      });

      it("should respect limit parameter", async () => {
        const relationships = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "0", limit: 2 },
        );
        expect(relationships.results).toHaveLength(2);
      });

      it("should respect cursor parameter", async () => {
        const firstPage = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "0", limit: 2 },
        );
        const secondPage = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "2", limit: 2 },
        );

        expect(firstPage.results).toHaveLength(2);
        expect(secondPage.results).toHaveLength(1);

        const allTypes = [
          ...firstPage.results.map((r) => r.relationshipType),
          ...secondPage.results.map((r) => r.relationshipType),
        ];
        expect(new Set(allTypes).size).toBe(3);
      });

      it("should set nextCursor when more results exist", async () => {
        const relationships = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "0", limit: 2 },
        );

        expect(relationships.nextCursor).toBe("2");
      });

      it("should not set nextCursor when no more results", async () => {
        const relationships = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "0", limit: 10 },
        );

        expect(relationships.nextCursor).toBeUndefined();
      });

      it("should provide next function for pagination", async () => {
        const firstPage = await indexer.getDirectedRelationships(
          "parent",
          "child",
          undefined,
          { cursor: "0", limit: 2 },
        );

        expect(firstPage.next).toBeDefined();

        const secondPage = await firstPage.next!();
        expect(secondPage.results).toHaveLength(1);
        expect(secondPage.next).toBeUndefined();
      });
    });
  });

  describe("getUndirectedRelationships", () => {
    beforeEach(async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "docA",
          targetId: "docB",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const context1: OperationContext = {
        documentId: "docA",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "docB",
          targetId: "docA",
          relationshipType: "reference",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const context2: OperationContext = {
        documentId: "docB",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action3: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "docA",
          targetId: "docB",
          relationshipType: "link",
        },
      };
      const operation3: Operation = {
        id: uuidv4(),
        index: 2,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash3",
        skip: 0,
        action: action3,
      };
      const context3: OperationContext = {
        documentId: "docA",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 2,
      };
      const operations: OperationWithContext[] = [
        { operation: operation1, context: context1 },
        { operation: operation2, context: context2 },
        { operation: operation3, context: context3 },
      ];

      await indexer.indexOperations(operations);
    });

    it("should return relationships in both directions", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
      );
      expect(relationships.results).toHaveLength(3);
    });

    it("should return same results regardless of argument order", async () => {
      const relAB = await indexer.getUndirectedRelationships("docA", "docB");
      const relBA = await indexer.getUndirectedRelationships("docB", "docA");

      expect(relAB.results).toHaveLength(3);
      expect(relBA.results).toHaveLength(3);
    });

    it("should filter by relationship type", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        ["child"],
      );
      expect(relationships.results).toHaveLength(1);
      expect(relationships.results[0].relationshipType).toBe("child");
    });

    it("should return empty array for non-existent relationship", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "nonexistent",
      );
      expect(relationships.results).toHaveLength(0);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getUndirectedRelationships(
          "docA",
          "docB",
          undefined,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should respect limit parameter", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "0", limit: 2 },
      );
      expect(relationships.results).toHaveLength(2);
    });

    it("should respect cursor parameter", async () => {
      const firstPage = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "0", limit: 2 },
      );
      const secondPage = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "2", limit: 2 },
      );

      expect(firstPage.results).toHaveLength(2);
      expect(secondPage.results).toHaveLength(1);

      const allTypes = [
        ...firstPage.results.map((r) => r.relationshipType),
        ...secondPage.results.map((r) => r.relationshipType),
      ];
      expect(allTypes).toHaveLength(3);
      expect(new Set(allTypes).size).toBe(3);
    });

    it("should set nextCursor when more results exist", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "0", limit: 2 },
      );

      expect(relationships.nextCursor).toBe("2");
    });

    it("should not set nextCursor when no more results", async () => {
      const relationships = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "0", limit: 10 },
      );

      expect(relationships.nextCursor).toBeUndefined();
    });

    it("should provide next function for pagination", async () => {
      const firstPage = await indexer.getUndirectedRelationships(
        "docA",
        "docB",
        undefined,
        { cursor: "0", limit: 2 },
      );

      expect(firstPage.next).toBeDefined();

      const secondPage = await firstPage.next!();
      expect(secondPage.results).toHaveLength(1);
      expect(secondPage.next).toBeUndefined();
    });
  });

  describe("findPath", () => {
    beforeEach(async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "doc1",
          targetId: "doc2",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const context1: OperationContext = {
        documentId: "doc1",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "doc2",
          targetId: "doc3",
          relationshipType: "child",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const context2: OperationContext = {
        documentId: "doc2",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation: operation1,
          context: context1,
        },
        {
          operation: operation2,
          context: context2,
        },
      ];

      await indexer.indexOperations(operations);
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
        indexer.findPath(
          "doc1",
          "doc3",
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("findAncestors", () => {
    beforeEach(async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "grandparent",
          targetId: "parent",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const context1: OperationContext = {
        documentId: "grandparent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "parent",
          targetId: "child",
          relationshipType: "child",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const context2: OperationContext = {
        documentId: "parent",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const operations: OperationWithContext[] = [
        {
          operation: operation1,
          context: context1,
        },
        {
          operation: operation2,
          context: context2,
        },
      ];

      await indexer.indexOperations(operations);
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
        indexer.findAncestors("child", undefined, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("getRelationshipTypes", () => {
    it("should return empty array when no relationships exist", async () => {
      const types = await indexer.getRelationshipTypes();
      expect(types).toEqual([]);
    });

    it("should return all unique relationship types", async () => {
      const action1: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "doc1",
          targetId: "doc2",
          relationshipType: "child",
        },
      };
      const operation1: Operation = {
        id: uuidv4(),
        index: 0,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash1",
        skip: 0,
        action: action1,
      };
      const context: OperationContext = {
        documentId: "doc1",
        documentType: "test",
        scope: "document",
        branch: "main",
        ordinal: 1,
      };
      const action2: AddRelationshipAction = {
        id: uuidv4(),
        timestampUtcMs: new Date().toISOString(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        input: {
          sourceId: "doc1",
          targetId: "doc3",
          relationshipType: "reference",
        },
      };
      const operation2: Operation = {
        id: uuidv4(),
        index: 1,
        timestampUtcMs: new Date().toISOString(),
        hash: "hash2",
        skip: 0,
        action: action2,
      };
      const operations: OperationWithContext[] = [
        {
          operation: operation1,
          context,
        },
        {
          operation: operation2,
          context,
        },
      ];

      await indexer.indexOperations(operations);

      const types = await indexer.getRelationshipTypes();
      expect(types.sort()).toEqual(["child", "reference"]);
    });

    it("should throw when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        indexer.getRelationshipTypes(undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
