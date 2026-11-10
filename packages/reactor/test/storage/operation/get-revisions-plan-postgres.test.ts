import { generateId } from "@powerhousedao/shared/document-model";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { latestTimestampQuery } from "../../../src/storage/kysely/revision-queries.js";
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

describe("getRevisions query plans [Postgres]", () => {
  let db: Kysely<DatabaseSchema>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestOperationStorePostgres());
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

  it("leaves a pre-built index alone", async () => {
    // The migration ran in beforeEach; running its statement again must be a no-op.
    await expect(
      db.schema
        .createIndex("idx_operation_document_branch_timestamp")
        .ifNotExists()
        .on("Operation")
        .expression(sql`"documentId", branch, "timestampUtcMs" desc`)
        .execute(),
    ).resolves.not.toThrow();
  });
});
