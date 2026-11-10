import { generateId } from "@powerhousedao/shared/document-model";
import { addFolder } from "@powerhousedao/shared/document-drive";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { up } from "../../../src/storage/migrations/032_index_operation_document_branch_timestamp.js";
import {
  latestTimestampQuery,
  scopeHeadsQuery,
} from "../../../src/storage/kysely/revision-queries.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";

/** The plan of `query` with sequential scans off, so it shows which index can serve it. */
async function planOf(
  db: Kysely<DatabaseSchema>,
  query: (conn: Kysely<DatabaseSchema>) => {
    explain: () => Promise<Record<string, unknown>[]>;
  },
): Promise<string> {
  return db.connection().execute(async (conn) => {
    await sql`set enable_seqscan = off`.execute(conn);
    const rows = await query(conn).explain();
    return rows.map((row) => String(Object.values(row)[0])).join("\n");
  });
}

const indexName = "idx_operation_document_branch_timestamp";

describe("getRevisions query plans [Postgres]", () => {
  let db: Kysely<DatabaseSchema>;
  let store: Awaited<
    ReturnType<typeof createTestOperationStorePostgres>
  >["store"];
  let schema: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, store, schema, cleanup } = await createTestOperationStorePostgres());
  });
  afterEach(async () => {
    await cleanup();
  });

  it("finds the latest timestamp through idx_operation_document_branch_timestamp", async () => {
    const plan = await planOf(db, (conn) =>
      latestTimestampQuery(conn, generateId(), "main"),
    );
    expect(plan).toContain("idx_operation_document_branch_timestamp");
    expect(plan).not.toContain("Seq Scan");
  });

  it("finds each scope's head through unique_revision without a sequential scan", async () => {
    const plan = await planOf(db, (conn) =>
      scopeHeadsQuery(conn, generateId(), "main"),
    );
    // One backward probe per scope, not a walk of every operation.
    expect(plan).toMatch(/Scan Backward using unique_revision/);
    expect(plan).toContain("Recursive Union");
    expect(plan).not.toContain("Seq Scan");
  });

  it("leaves a pre-built index alone", async () => {
    // The migration ran in beforeEach; running it again must be a no-op.
    await expect(up(db)).resolves.toBeUndefined();
    const rows = await db
      .selectFrom("pg_catalog.pg_indexes" as never)
      .select("indexname" as never)
      .where("indexname" as never, "=", indexName as never)
      .where("schemaname" as never, "=", schema as never)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it("returns each scope's head and the latest timestamp from the main branch", async () => {
    const documentId = generateId();
    const write = (
      scope: string,
      branch: string,
      index: number,
      timestampUtcMs: string,
    ) =>
      store.apply(
        documentId,
        "powerhouse/document-drive",
        scope,
        branch,
        index,
        (txn) => {
          txn.addOperations({
            index,
            timestampUtcMs,
            hash: `hash-${scope}-${branch}-${index}`,
            skip: 0,
            id: generateId(),
            action: addFolder({
              id: generateId(),
              name: `f-${index}`,
              parentFolder: null,
            }),
          });
        },
      );
    for (let i = 0; i <= 3; i++) {
      await write("global", "main", i, `2026-01-01T00:00:0${i}.000Z`);
    }
    for (let i = 0; i <= 1; i++) {
      await write("local", "main", i, `2026-02-01T00:00:0${i}.000Z`);
    }
    await write("header", "main", 0, "2026-01-15T00:00:00.000Z");
    await write("auth", "draft", 0, "2026-09-01T00:00:00.000Z");
    for (let i = 0; i <= 4; i++) {
      await write("global", "draft", i, "2026-09-02T00:00:00.000Z");
    }

    const revisions = await store.getRevisions(documentId, "main");

    expect(revisions.revision).toEqual({ global: 4, local: 2, header: 1 });
    expect(revisions.latestTimestamp).toBe("2026-02-01T00:00:01.000Z");
  });
});
