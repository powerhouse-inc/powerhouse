import { type Action } from "document-model";
import { generateId } from "document-model/core";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type OperationFilter } from "../../src/storage/interfaces.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

function createAction(type: string, timestampUtcMs?: number): Action {
  const ts = timestampUtcMs ?? Date.now();
  return {
    type,
    input: {},
    scope: "global",
    id: generateId(),
    timestampUtcMs: new Date(ts).toISOString(),
  };
}

describe("KyselyOperationStore.getSince with OperationFilter", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let documentId: string;
  const scope = "global";
  const branch = "main";
  const documentType = "powerhouse/test";

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    documentId = generateId();
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function insertOperations(
    operations: Array<{
      type: string;
      timestampUtcMs?: number;
      index?: number;
    }>,
  ): Promise<void> {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const action = createAction(op.type, op.timestampUtcMs);
      await store.apply(documentId, documentType, scope, branch, i, (txn) => {
        txn.addOperations({
          index: i,
          timestampUtcMs: new Date(action.timestampUtcMs).toISOString(),
          hash: generateId(),
          skip: 0,
          id: generateId(),
          action,
        });
      });
    }
  }

  describe("actionTypes filtering", () => {
    it("filters by single actionType", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
        { type: "DELETE" },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["SET_NAME"],
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results.every((op) => op.action.type === "SET_NAME")).toBe(
        true,
      );
    });

    it("filters by multiple actionTypes (OR logic)", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
        { type: "DELETE" },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["SET_NAME", "DELETE"],
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(3);
      expect(
        result.results.every(
          (op) => op.action.type === "SET_NAME" || op.action.type === "DELETE",
        ),
      ).toBe(true);
    });
  });

  describe("timestamp filtering", () => {
    it("filters by timestampFrom (inclusive)", async () => {
      const baseTime = new Date("2024-01-15T00:00:00.000Z").getTime();

      await insertOperations([
        { type: "OP1", timestampUtcMs: baseTime },
        { type: "OP2", timestampUtcMs: baseTime + 1000 },
        { type: "OP3", timestampUtcMs: baseTime + 2000 },
        { type: "OP4", timestampUtcMs: baseTime + 3000 },
      ]);

      const filter: OperationFilter = {
        timestampFrom: new Date(baseTime + 2000).toISOString(),
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].action.type).toBe("OP3");
      expect(result.results[1].action.type).toBe("OP4");
    });

    it("filters by timestampTo (inclusive)", async () => {
      const baseTime = new Date("2024-01-15T00:00:00.000Z").getTime();

      await insertOperations([
        { type: "OP1", timestampUtcMs: baseTime },
        { type: "OP2", timestampUtcMs: baseTime + 1000 },
        { type: "OP3", timestampUtcMs: baseTime + 2000 },
        { type: "OP4", timestampUtcMs: baseTime + 3000 },
      ]);

      const filter: OperationFilter = {
        timestampTo: new Date(baseTime + 1000).toISOString(),
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].action.type).toBe("OP1");
      expect(result.results[1].action.type).toBe("OP2");
    });

    it("filters by timestamp range", async () => {
      const baseTime = new Date("2024-01-15T00:00:00.000Z").getTime();

      await insertOperations([
        { type: "OP1", timestampUtcMs: baseTime },
        { type: "OP2", timestampUtcMs: baseTime + 1000 },
        { type: "OP3", timestampUtcMs: baseTime + 2000 },
        { type: "OP4", timestampUtcMs: baseTime + 3000 },
      ]);

      const filter: OperationFilter = {
        timestampFrom: new Date(baseTime + 1000).toISOString(),
        timestampTo: new Date(baseTime + 2000).toISOString(),
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].action.type).toBe("OP2");
      expect(result.results[1].action.type).toBe("OP3");
    });
  });

  describe("sinceRevision filtering", () => {
    it("filters by sinceRevision", async () => {
      await insertOperations([
        { type: "OP1" },
        { type: "OP2" },
        { type: "OP3" },
        { type: "OP4" },
      ]);

      const filter: OperationFilter = {
        sinceRevision: 2,
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].index).toBe(2);
      expect(result.results[1].index).toBe(3);
    });
  });

  describe("combined filters", () => {
    it("combines actionTypes and timestamp filters (AND logic)", async () => {
      const baseTime = new Date("2024-01-15T00:00:00.000Z").getTime();

      await insertOperations([
        { type: "SET_NAME", timestampUtcMs: baseTime },
        { type: "SET_DESCRIPTION", timestampUtcMs: baseTime + 1000 },
        { type: "SET_NAME", timestampUtcMs: baseTime + 2000 },
        { type: "DELETE", timestampUtcMs: baseTime + 3000 },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["SET_NAME"],
        timestampFrom: new Date(baseTime + 1000).toISOString(),
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].action.type).toBe("SET_NAME");
      expect(result.results[0].index).toBe(2);
    });
  });

  describe("paging with filtering", () => {
    it("returns correct page size with filtering", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["SET_NAME"],
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
        { cursor: "0", limit: 2 },
      );

      expect(result.results).toHaveLength(2);
      expect(result.nextCursor).toBeDefined();
    });

    it("handles paging cursor correctly with filtering", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "SET_NAME" },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["SET_NAME"],
      };

      const page1 = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
        { cursor: "0", limit: 2 },
      );

      expect(page1.results).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
        { cursor: page1.nextCursor!, limit: 2 },
      );

      expect(page2.results).toHaveLength(2);
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("returns empty results when no operations match filter", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
      ]);

      const filter: OperationFilter = {
        actionTypes: ["DELETE"],
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(0);
    });

    it("returns all operations when filter is undefined", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
        { type: "DELETE" },
      ]);

      const result = await store.getSince(documentId, scope, branch, -1);

      expect(result.results).toHaveLength(3);
    });

    it("handles empty actionTypes array", async () => {
      await insertOperations([
        { type: "SET_NAME" },
        { type: "SET_DESCRIPTION" },
      ]);

      const filter: OperationFilter = {
        actionTypes: [],
      };

      const result = await store.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
      );

      expect(result.results).toHaveLength(2);
    });
  });
});
