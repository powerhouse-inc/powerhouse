import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { setDriveName } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppendConditionFailedError,
  type AppendCondition,
} from "../../../src/storage/interfaces.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import { createTestOperationStore, testFsBackends } from "../../factories.js";

const DOCUMENT_TYPE = "powerhouse/document-drive";
const BRANCH = "main";

function makeOperation(index: number): Operation {
  return {
    id: generateId(),
    index,
    timestampUtcMs: new Date().toISOString(),
    hash: `hash-${index}`,
    skip: 0,
    action: setDriveName({ name: `name-${index}` }),
  };
}

async function seedStream(
  store: KyselyOperationStore,
  documentId: string,
  scope: string,
  count: number,
  startIndex = 0,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    await store.apply(
      documentId,
      DOCUMENT_TYPE,
      scope,
      BRANCH,
      index,
      (txn) => {
        txn.addOperations(makeOperation(index));
      },
    );
  }
}

async function countStreamOps(
  db: Kysely<DatabaseSchema>,
  documentId: string,
  scope: string,
): Promise<number> {
  const rows = await db
    .selectFrom("Operation")
    .select("id")
    .where("documentId", "=", documentId)
    .where("scope", "=", scope)
    .where("branch", "=", BRANCH)
    .execute();
  return rows.length;
}

describe.each(testFsBackends)(
  "KyselyOperationStore append conditions [$name]",
  ({ backend }) => {
    let db: Kysely<DatabaseSchema>;
    let store: KyselyOperationStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const setup = await createTestOperationStore(backend);
      db = setup.db;
      store = setup.store;
      cleanup = setup.cleanup;
    });

    afterEach(async () => {
      await db.destroy();
      await cleanup();
    });

    it("appends when no read-set stream has grown", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, targetId, "document", 1);
      await seedStream(store, groupId, "global", 1);

      const condition: AppendCondition = {
        streams: [
          {
            documentId: targetId,
            scope: "document",
            branch: BRANCH,
            revision: 0,
          },
          { documentId: groupId, scope: "global", branch: BRANCH, revision: 0 },
        ],
      };

      const stored = await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        0,
        (txn) => {
          txn.addOperations(makeOperation(0));
        },
        undefined,
        condition,
      );

      expect(stored).toHaveLength(1);
      expect(await countStreamOps(db, targetId, "global")).toBe(1);
    });

    it("throws AppendConditionFailedError and writes nothing when a read-set stream grew", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, groupId, "global", 1);

      const staleCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      await expect(
        store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(makeOperation(0));
          },
          undefined,
          staleCondition,
        ),
      ).rejects.toThrow(AppendConditionFailedError);

      expect(await countStreamOps(db, targetId, "global")).toBe(0);
    });

    it("fails when any one of several read-set streams grew", async () => {
      const targetId = generateId();
      const freshId = generateId();
      const staleId = generateId();
      await seedStream(store, freshId, "global", 1);
      await seedStream(store, staleId, "global", 2);

      const condition: AppendCondition = {
        streams: [
          { documentId: freshId, scope: "global", branch: BRANCH, revision: 0 },
          { documentId: staleId, scope: "global", branch: BRANCH, revision: 0 },
        ],
      };

      await expect(
        store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(makeOperation(0));
          },
          undefined,
          condition,
        ),
      ).rejects.toThrow(AppendConditionFailedError);

      expect(await countStreamOps(db, targetId, "global")).toBe(0);
    });

    it("treats revision -1 as observed-empty", async () => {
      const targetId = generateId();
      const emptyId = generateId();

      const condition: AppendCondition = {
        streams: [
          { documentId: emptyId, scope: "auth", branch: BRANCH, revision: -1 },
        ],
      };

      await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        0,
        (txn) => {
          txn.addOperations(makeOperation(0));
        },
        undefined,
        condition,
      );

      await seedStream(store, emptyId, "auth", 1);

      await expect(
        store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          1,
          (txn) => {
            txn.addOperations(makeOperation(1));
          },
          undefined,
          condition,
        ),
      ).rejects.toThrow(AppendConditionFailedError);

      expect(await countStreamOps(db, targetId, "global")).toBe(1);
    });

    it("inserts all or nothing for multi-operation appends", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, groupId, "global", 1);

      const staleCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      await expect(
        store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(
              makeOperation(0),
              makeOperation(1),
              makeOperation(2),
            );
          },
          undefined,
          staleCondition,
        ),
      ).rejects.toThrow(AppendConditionFailedError);

      expect(await countStreamOps(db, targetId, "global")).toBe(0);
    });

    it("appends multiple operations when the written stream is in its own read-set", async () => {
      const targetId = generateId();
      await seedStream(store, targetId, "global", 2);

      const condition: AppendCondition = {
        streams: [
          {
            documentId: targetId,
            scope: "global",
            branch: BRANCH,
            revision: 1,
          },
        ],
      };

      const stored = await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        2,
        (txn) => {
          txn.addOperations(makeOperation(2), makeOperation(3));
        },
        undefined,
        condition,
      );

      expect(stored).toHaveLength(2);
      expect(await countStreamOps(db, targetId, "global")).toBe(4);
    });

    it("a retry against the new heads lands after a condition failure", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, groupId, "global", 1);

      const staleCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      await expect(
        store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(makeOperation(0));
          },
          undefined,
          staleCondition,
        ),
      ).rejects.toThrow(AppendConditionFailedError);

      const revisions = await store.getRevisions(groupId, BRANCH);
      const freshCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: revisions.revision.global - 1,
          },
        ],
      };

      const stored = await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        0,
        (txn) => {
          txn.addOperations(makeOperation(0));
        },
        undefined,
        freshCondition,
      );

      expect(stored).toHaveLength(1);
      expect(await countStreamOps(db, targetId, "global")).toBe(1);
    });

    it("an empty condition guards nothing", async () => {
      const targetId = generateId();

      const stored = await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        0,
        (txn) => {
          txn.addOperations(makeOperation(0));
        },
        undefined,
        { streams: [] },
      );

      expect(stored).toHaveLength(1);
    });

    it("idempotent replay returns stored rows before the guard is evaluated", async () => {
      const targetId = generateId();
      const groupId = generateId();
      const operation = makeOperation(0);

      await store.apply(targetId, DOCUMENT_TYPE, "global", BRANCH, 0, (txn) => {
        txn.addOperations(operation);
      });

      await seedStream(store, groupId, "global", 1);

      const violatedCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      const replayed = await store.apply(
        targetId,
        DOCUMENT_TYPE,
        "global",
        BRANCH,
        0,
        (txn) => {
          txn.addOperations(operation);
        },
        undefined,
        violatedCondition,
      );

      expect(replayed).toHaveLength(1);
      expect(replayed[0].id).toBe(operation.id);
      expect(await countStreamOps(db, targetId, "global")).toBe(1);
    });

    it("carries the failed condition on the error", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, groupId, "global", 1);

      const staleCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      let caught: unknown;
      try {
        await store.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(makeOperation(0));
          },
          undefined,
          staleCondition,
        );
      } catch (error) {
        caught = error;
      }

      expect(AppendConditionFailedError.isError(caught)).toBe(true);
      expect((caught as AppendConditionFailedError).condition).toEqual(
        staleCondition,
      );
    });

    it("enforces the condition through an ambient transaction (withTransaction)", async () => {
      const targetId = generateId();
      const groupId = generateId();
      await seedStream(store, groupId, "global", 1);

      const staleCondition: AppendCondition = {
        streams: [
          {
            documentId: groupId,
            scope: "global",
            branch: BRANCH,
            revision: -1,
          },
        ],
      };

      await expect(
        db.transaction().execute(async (trx) => {
          const scoped = store.withTransaction(trx);
          await scoped.apply(
            targetId,
            DOCUMENT_TYPE,
            "global",
            BRANCH,
            0,
            (txn) => {
              txn.addOperations(makeOperation(0));
            },
            undefined,
            staleCondition,
          );
        }),
      ).rejects.toThrow(AppendConditionFailedError);

      expect(await countStreamOps(db, targetId, "global")).toBe(0);

      const freshCondition: AppendCondition = {
        streams: [
          { documentId: groupId, scope: "global", branch: BRANCH, revision: 0 },
        ],
      };

      await db.transaction().execute(async (trx) => {
        const scoped = store.withTransaction(trx);
        await scoped.apply(
          targetId,
          DOCUMENT_TYPE,
          "global",
          BRANCH,
          0,
          (txn) => {
            txn.addOperations(makeOperation(0));
          },
          undefined,
          freshCondition,
        );
      });

      expect(await countStreamOps(db, targetId, "global")).toBe(1);
    });
  },
);

describe("KyselyOperationStore advisory lock ordering", () => {
  let baseDb: Kysely<DatabaseSchema>;
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let queries: string[];
  let parameters: unknown[][];

  beforeEach(async () => {
    queries = [];
    parameters = [];
    baseDb = new Kysely<DatabaseSchema>({
      dialect: new PGliteDialect(new PGlite({ fs: new MemoryFS() })),
      log: (event) => {
        if (event.level === "query") {
          queries.push(event.query.sql);
          parameters.push([...event.query.parameters]);
        }
      },
    });

    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }

    db = baseDb.withSchema(REACTOR_SCHEMA);
    store = new KyselyOperationStore(db);

    // the kysely migrator takes its own advisory lock; only queries issued
    // by the store itself are of interest
    queries.length = 0;
    parameters.length = 0;
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  it("acquires every stream lock in one statement, sorted and deduplicated", async () => {
    const targetId = "doc-b";
    const condition: AppendCondition = {
      streams: [
        { documentId: "doc-c", scope: "global", branch: BRANCH, revision: -1 },
        { documentId: "doc-a", scope: "global", branch: BRANCH, revision: -1 },
        { documentId: targetId, scope: "global", branch: BRANCH, revision: -1 },
      ],
    };

    await store.apply(
      targetId,
      DOCUMENT_TYPE,
      "global",
      BRANCH,
      0,
      (txn) => {
        txn.addOperations(makeOperation(0));
      },
      undefined,
      condition,
    );

    const lockIndexes: number[] = [];
    for (let i = 0; i < queries.length; i++) {
      if (queries[i].includes("pg_advisory_xact_lock(hashtext(")) {
        lockIndexes.push(i);
      }
    }

    expect(lockIndexes).toHaveLength(1);
    expect(parameters[lockIndexes[0]]).toEqual([
      `doc-a:global:${BRANCH}`,
      `doc-b:global:${BRANCH}`,
      `doc-c:global:${BRANCH}`,
    ]);
  });

  it("takes no locks when no condition is provided", async () => {
    await store.apply(
      generateId(),
      DOCUMENT_TYPE,
      "global",
      BRANCH,
      0,
      (txn) => {
        txn.addOperations(makeOperation(0));
      },
    );

    const lockQueries = queries.filter((q) =>
      q.includes("pg_advisory_xact_lock(hashtext("),
    );
    expect(lockQueries).toHaveLength(0);
  });
});
