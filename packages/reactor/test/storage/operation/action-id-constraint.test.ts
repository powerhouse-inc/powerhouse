import { PGlite } from "@electric-sql/pglite";
import { MemoryFS } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";

/** The last migration before the action-id constraint. */
const BEFORE_CONSTRAINT = "018_add_sync_remote_bound_address";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type OperationRow = {
  jobId: string;
  opId: string;
  prevOpId: string;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  timestampUtcMs: string;
  index: number;
  skip: number;
  hash: string;
  action: unknown;
};

function operationRow(overrides: {
  opId: string;
  index?: number;
  skip?: number;
  action: Record<string, unknown>;
}): OperationRow {
  return {
    jobId: "job-1",
    opId: overrides.opId,
    prevOpId: "",
    documentId: "doc-1",
    documentType: "powerhouse/document-model",
    scope: "global",
    branch: "main",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    index: overrides.index ?? 0,
    skip: overrides.skip ?? 0,
    hash: "h",
    action: sql`${JSON.stringify(overrides.action)}::jsonb`,
  };
}

function indexRow(overrides: {
  opId: string;
  index?: number;
  skip?: number;
  action: Record<string, unknown>;
}) {
  const row = operationRow(overrides);
  return {
    opId: row.opId,
    documentId: row.documentId,
    documentType: row.documentType,
    scope: row.scope,
    branch: row.branch,
    timestampUtcMs: row.timestampUtcMs,
    index: row.index,
    skip: row.skip,
    hash: row.hash,
    action: row.action,
  };
}

const goodAction = {
  id: "act-1",
  type: "SET_NAME",
  scope: "global",
  input: {},
};
const idlessAction = { type: "SET_NAME", scope: "global", input: {} };
const emptyIdAction = { ...idlessAction, id: "" };

describe("the action-id constraint", () => {
  let baseDb: Kysely<DatabaseSchema>;
  let db: Kysely<DatabaseSchema>;

  const migrate = async (upTo?: string) => {
    const result = await runMigrations(baseDb, REACTOR_SCHEMA, upTo);
    if (!result.success && result.error) {
      throw result.error;
    }
    return result;
  };

  const actionIds = async (table: "Operation" | "operation_index_operations") =>
    (
      await db
        .selectFrom(table as never)
        .select([
          sql<string>`"opId"`.as("opId"),
          sql<number>`index`.as("index"),
          sql<string | null>`action->>'id'`.as("actionId"),
        ])
        .orderBy(sql`"opId"`)
        .execute()
    ).map((row) => row as { opId: string; index: number; actionId: string });

  beforeEach(() => {
    baseDb = new Kysely<DatabaseSchema>({
      dialect: new PGliteDialect(new PGlite({ fs: new MemoryFS() })),
    });
    db = baseDb.withSchema(REACTOR_SCHEMA);
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  describe("once applied", () => {
    beforeEach(async () => {
      await migrate();
    });

    it("refuses an operation whose action carries no id", async () => {
      await expect(
        db
          .insertInto("Operation")
          .values(operationRow({ opId: "op-1", action: idlessAction }) as never)
          .execute(),
      ).rejects.toThrow(/action_must_have_id/);
    });

    it("refuses an operation whose action id is the empty string", async () => {
      await expect(
        db
          .insertInto("Operation")
          .values(
            operationRow({ opId: "op-1", action: emptyIdAction }) as never,
          )
          .execute(),
      ).rejects.toThrow(/action_must_have_id/);
    });

    it("refuses an index entry whose action carries no id", async () => {
      await expect(
        db
          .insertInto("operation_index_operations")
          .values(indexRow({ opId: "op-1", action: idlessAction }) as never)
          .execute(),
      ).rejects.toThrow(/action_must_have_id/);
    });

    it("admits an operation that carries one", async () => {
      await db
        .insertInto("Operation")
        .values(operationRow({ opId: "op-1", action: goodAction }) as never)
        .execute();

      expect(await actionIds("Operation")).toEqual([
        { opId: "op-1", index: 0, actionId: "act-1" },
      ]);
    });
  });

  describe("backfilling history it inherits", () => {
    beforeEach(async () => {
      await migrate(BEFORE_CONSTRAINT);
    });

    it("gives both tables the same fresh id for one operation", async () => {
      await db
        .insertInto("Operation")
        .values(operationRow({ opId: "op-1", action: idlessAction }) as never)
        .execute();
      await db
        .insertInto("operation_index_operations")
        .values(indexRow({ opId: "op-1", action: idlessAction }) as never)
        .execute();

      await migrate();

      const [operation] = await actionIds("Operation");
      const [indexed] = await actionIds("operation_index_operations");

      expect(operation.actionId).toMatch(UUID);
      expect(indexed.actionId).toBe(operation.actionId);
    });

    it("gives two id-less operations on one document distinct ids", async () => {
      // Both derive the same operation id today, which is the collision the
      // constraint exists to stop; the backfill has to separate them.
      await db
        .insertInto("Operation")
        .values([
          operationRow({ opId: "op-x", index: 0, action: idlessAction }),
          operationRow({ opId: "op-x", index: 1, action: idlessAction }),
        ] as never)
        .execute();

      await migrate();

      const ids = (await actionIds("Operation")).map((row) => row.actionId);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(UUID);
      expect(ids[1]).toMatch(UUID);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it("mints an id for an index entry the operation table never held", async () => {
      await db
        .insertInto("operation_index_operations")
        .values(indexRow({ opId: "orphan", action: idlessAction }) as never)
        .execute();

      await migrate();

      const [indexed] = await actionIds("operation_index_operations");
      expect(indexed.actionId).toMatch(UUID);
    });

    it("leaves an id that was already there alone", async () => {
      await db
        .insertInto("Operation")
        .values(operationRow({ opId: "op-1", action: goodAction }) as never)
        .execute();
      await db
        .insertInto("operation_index_operations")
        .values(indexRow({ opId: "op-1", action: goodAction }) as never)
        .execute();

      await migrate();

      expect((await actionIds("Operation"))[0].actionId).toBe("act-1");
      expect((await actionIds("operation_index_operations"))[0].actionId).toBe(
        "act-1",
      );
    });

    it("repairs an index entry from the operation table's own id", async () => {
      await db
        .insertInto("Operation")
        .values(operationRow({ opId: "op-1", action: goodAction }) as never)
        .execute();
      await db
        .insertInto("operation_index_operations")
        .values(indexRow({ opId: "op-1", action: idlessAction }) as never)
        .execute();

      await migrate();

      expect((await actionIds("operation_index_operations"))[0].actionId).toBe(
        "act-1",
      );
    });
  });
});
