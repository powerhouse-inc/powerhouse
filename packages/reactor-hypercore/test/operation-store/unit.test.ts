import type { Operation } from "document-model";
import { generateId } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateOperationError,
  RevisionMismatchError,
} from "@powerhousedao/reactor";
import type { HypercoreOperationStore } from "../../src/hypercore-operation-store.js";
import {
  createTestHypercoreStores,
  type TestHypercoreSetup,
} from "../factories.js";

describe("HypercoreOperationStore", () => {
  let setup: TestHypercoreSetup;
  let store: HypercoreOperationStore;

  beforeEach(async () => {
    setup = await createTestHypercoreStores();
    store = setup.store;
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  function makeAction(type: string, input: Record<string, unknown> = {}) {
    return {
      type,
      input,
      id: generateId(),
      timestampUtcMs: new Date().toISOString(),
      scope: "global",
    };
  }

  function makeOp(
    index: number,
    overrides: Partial<Operation> = {},
  ): Operation {
    return {
      index,
      timestampUtcMs: new Date().toISOString(),
      hash: `hash-${index}`,
      skip: 0,
      id: generateId(),
      action: makeAction("TEST_ACTION"),
      ...overrides,
    };
  }

  describe("apply", () => {
    it("should apply operations atomically", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const opId = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(
          makeOp(0, { id: opId, action: makeAction("ADD_FOLDER") }),
        );
      });

      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe(opId);
      expect(result.results[0].action.type).toBe("ADD_FOLDER");
    });

    it("should enforce revision ordering", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      await expect(
        store.apply(documentId, documentType, "global", "main", 5, (txn) => {
          txn.addOperations(makeOp(5));
        }),
      ).rejects.toThrow(RevisionMismatchError);
    });

    it("should allow same opId with different index (reshuffle scenario)", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const sharedOpId = generateId();
      const documentType = "powerhouse/test-doc";
      const action = makeAction("TEST_ACTION");

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(makeOp(0, { id: sharedOpId, action }));
      });

      await store.apply(documentId, documentType, scope, branch, 1, (txn) => {
        txn.addOperations(makeOp(1, { id: sharedOpId, action }));
      });

      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe(sharedOpId);
      expect(result.results[1].id).toBe(sharedOpId);
    });

    it("should allow same opId with different skip (undo/redo scenario)", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const sharedOpId = generateId();
      const documentType = "powerhouse/test-doc";
      const action = makeAction("TEST_ACTION");

      await store.apply(documentId, documentType, scope, branch, 0, (txn) => {
        txn.addOperations(makeOp(0, { id: sharedOpId, skip: 0, action }));
      });

      await store.apply(documentId, documentType, scope, branch, 1, (txn) => {
        txn.addOperations(makeOp(1, { id: sharedOpId, skip: 1, action }));
      });

      const result = await store.getSince(documentId, scope, branch, -1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].skip).toBe(0);
      expect(result.results[1].skip).toBe(1);
    });

    it("should reject duplicate (opId, index, skip) combination", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";
      const duplicateOpId = generateId();
      const action = makeAction("TEST_ACTION");

      const op = makeOp(0, { id: duplicateOpId, action });

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(op);
        },
      );

      const secondDocId = generateId();
      await expect(
        store.apply(secondDocId, documentType, "global", "main", 0, (txn) => {
          txn.addOperations({ ...op, index: 0 });
        }),
      ).rejects.toThrow(DuplicateOperationError);
    });

    it("should apply multiple operations in a single transaction", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(makeOp(0), makeOp(1), makeOp(2));
        },
      );

      const result = await store.getSince(documentId, "global", "main", -1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].index).toBe(0);
      expect(result.results[1].index).toBe(1);
      expect(result.results[2].index).toBe(2);
    });
  });

  describe("getSince", () => {
    it("should get operations since a given revision", async () => {
      const documentId = generateId();
      const scope = "global";
      const branch = "main";
      const documentType = "powerhouse/test-doc";

      for (let i = 0; i < 3; i++) {
        await store.apply(documentId, documentType, scope, branch, i, (txn) => {
          txn.addOperations(
            makeOp(i, {
              timestampUtcMs: new Date(Date.now() + i * 1000).toISOString(),
            }),
          );
        });
      }

      const result = await store.getSince(documentId, scope, branch, 0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].index).toBe(1);
      expect(result.results[1].index).toBe(2);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should return empty array when no operations since revision", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(makeOp(0));
        },
      );

      const result = await store.getSince(documentId, "global", "main", 0);
      expect(result.results).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should support cursor-based paging", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      for (let i = 0; i < 5; i++) {
        await store.apply(
          documentId,
          documentType,
          "global",
          "main",
          i,
          (txn) => {
            txn.addOperations(
              makeOp(i, {
                timestampUtcMs: new Date(Date.now() + i * 1000).toISOString(),
              }),
            );
          },
        );
      }

      const page1 = await store.getSince(
        documentId,
        "global",
        "main",
        0,
        undefined,
        { cursor: "", limit: 2 },
      );
      expect(page1.results).toHaveLength(2);
      expect(page1.results[0].index).toBe(1);
      expect(page1.results[1].index).toBe(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await store.getSince(
        documentId,
        "global",
        "main",
        0,
        undefined,
        { cursor: page1.nextCursor!, limit: 2 },
      );
      expect(page2.results).toHaveLength(2);
      expect(page2.results[0].index).toBe(3);
      expect(page2.results[1].index).toBe(4);
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  describe("getSinceId", () => {
    it("should get operations across documents by ordinal", async () => {
      const doc1 = generateId();
      const doc2 = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(doc1, documentType, "global", "main", 0, (txn) => {
        txn.addOperations(makeOp(0, { action: makeAction("ACTION_A") }));
      });

      await store.apply(doc2, documentType, "global", "main", 0, (txn) => {
        txn.addOperations(makeOp(0, { action: makeAction("ACTION_B") }));
      });

      await store.apply(doc1, documentType, "global", "main", 1, (txn) => {
        txn.addOperations(makeOp(1, { action: makeAction("ACTION_C") }));
      });

      const result = await store.getSinceId(-1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].context.documentId).toBe(doc1);
      expect(result.results[0].operation.action.type).toBe("ACTION_A");
      expect(result.results[1].context.documentId).toBe(doc2);
      expect(result.results[1].operation.action.type).toBe("ACTION_B");
      expect(result.results[2].context.documentId).toBe(doc1);
      expect(result.results[2].operation.action.type).toBe("ACTION_C");
    });

    it("should support paging", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      for (let i = 0; i < 5; i++) {
        await store.apply(
          documentId,
          documentType,
          "global",
          "main",
          i,
          (txn) => {
            txn.addOperations(makeOp(i));
          },
        );
      }

      const page1 = await store.getSinceId(-1, { cursor: "", limit: 2 });
      expect(page1.results).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await store.getSinceId(-1, {
        cursor: page1.nextCursor!,
        limit: 2,
      });
      expect(page2.results).toHaveLength(2);
      expect(page2.nextCursor).toBeDefined();

      const page3 = await store.getSinceId(-1, {
        cursor: page2.nextCursor!,
        limit: 2,
      });
      expect(page3.results).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();
    });
  });

  describe("getConflicting", () => {
    it("should filter by minimum timestamp", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";
      const baseTime = Date.now();

      for (let i = 0; i < 3; i++) {
        await store.apply(
          documentId,
          documentType,
          "global",
          "main",
          i,
          (txn) => {
            txn.addOperations(
              makeOp(i, {
                timestampUtcMs: new Date(baseTime + i * 10000).toISOString(),
              }),
            );
          },
        );
      }

      const minTimestamp = new Date(baseTime + 10000).toISOString();
      const result = await store.getConflicting(
        documentId,
        "global",
        "main",
        minTimestamp,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].index).toBe(1);
      expect(result.results[1].index).toBe(2);
    });

    it("should return empty when no operations match", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(
            makeOp(0, {
              timestampUtcMs: new Date("2020-01-01").toISOString(),
            }),
          );
        },
      );

      const result = await store.getConflicting(
        documentId,
        "global",
        "main",
        new Date("2025-01-01").toISOString(),
      );
      expect(result.results).toHaveLength(0);
    });
  });

  describe("getRevisions", () => {
    it("should return revision map across scopes", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";
      const ts1 = new Date("2024-01-01T00:00:00Z").toISOString();
      const ts2 = new Date("2024-06-01T00:00:00Z").toISOString();

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(makeOp(0, { timestampUtcMs: ts1 }));
        },
      );

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        1,
        (txn) => {
          txn.addOperations(makeOp(1, { timestampUtcMs: ts2 }));
        },
      );

      await store.apply(documentId, documentType, "local", "main", 0, (txn) => {
        txn.addOperations(makeOp(0, { timestampUtcMs: ts1 }));
      });

      const revisions = await store.getRevisions(documentId, "main");
      expect(revisions.revision["global"]).toBe(2);
      expect(revisions.revision["local"]).toBe(1);
      expect(revisions.latestTimestamp).toBe(ts2);
    });

    it("should filter by branch", async () => {
      const documentId = generateId();
      const documentType = "powerhouse/test-doc";

      await store.apply(
        documentId,
        documentType,
        "global",
        "main",
        0,
        (txn) => {
          txn.addOperations(makeOp(0));
        },
      );

      await store.apply(
        documentId,
        documentType,
        "global",
        "draft",
        0,
        (txn) => {
          txn.addOperations(makeOp(0));
        },
      );

      const mainRevisions = await store.getRevisions(documentId, "main");
      expect(mainRevisions.revision["global"]).toBe(1);
      expect(mainRevisions.revision).not.toHaveProperty("draft");
    });

    it("should return empty revision map for unknown document", async () => {
      const revisions = await store.getRevisions("nonexistent", "main");
      expect(revisions.revision).toEqual({});
      expect(revisions.latestTimestamp).toBe(new Date(0).toISOString());
    });
  });

  describe("abort signal handling", () => {
    it("should abort apply operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.apply(
          generateId(),
          "powerhouse/test-doc",
          "global",
          "main",
          0,
          () => {},
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSince operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.getSince(
          generateId(),
          "global",
          "main",
          0,
          undefined,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getSinceId operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.getSinceId(1, undefined, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getConflicting operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.getConflicting(
          generateId(),
          "global",
          "main",
          new Date().toISOString(),
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should abort getRevisions operation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.getRevisions(generateId(), "main", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
