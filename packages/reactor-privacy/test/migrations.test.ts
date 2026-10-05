import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runReactorPrivacyMigrations } from "../index.js";
import { createTestDatabase, type TestDatabase } from "./utils/reactor.js";

describe("reactor-privacy migrations [Postgres]", () => {
  let database: TestDatabase;
  let db: Kysely<any>;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_privacy_migrations");
    db = database.connect();
  });

  afterAll(async () => {
    await database.drop();
  });

  it("creates its tables and ledger in the reactor schema, once", async () => {
    const first = await runReactorPrivacyMigrations(db);
    expect(first).toEqual({
      success: true,
      migrationsExecuted: ["0001_erasure_requests", "0002_subject_documents"],
    });
    const again = await runReactorPrivacyMigrations(db);
    expect(again).toEqual({ success: true, migrationsExecuted: [] });

    const tables = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'reactor' order by table_name
    `.execute(db);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "erasure_audit",
      "erasure_items",
      "erasure_requests",
      "kysely_migration_reactor_privacy",
      "kysely_migration_reactor_privacy_lock",
      "subject_documents",
    ]);
  });

  it("keeps the audit append-only and items tied to their request", async () => {
    const r = db.withSchema("reactor");
    const now = new Date();
    await r
      .insertInto("erasure_requests")
      .values({
        requestId: "req",
        subjectHash: null,
        requestedBy: "admin",
        requestedAt: now,
        deadline: now,
        status: "open",
      })
      .execute();
    await expect(
      r
        .insertInto("erasure_items")
        .values({
          requestId: "missing",
          documentId: "d",
          status: "waiting",
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow(/foreign key/);

    await r
      .insertInto("erasure_audit")
      .values({ requestId: "req", event: "requested", atUtc: now })
      .execute();
    await expect(
      r.updateTable("erasure_audit").set({ event: "failed" }).execute(),
    ).rejects.toThrow(/append-only/);
    const deleted = await r.deleteFrom("erasure_audit").executeTakeFirst();
    expect(Number(deleted.numDeletedRows)).toBe(1);
  });
});
