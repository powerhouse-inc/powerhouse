import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTACHMENT_SCHEMA,
  runAttachmentMigrations,
} from "../../src/storage/migrations/migrator.js";

describe("runAttachmentMigrations", () => {
  let db: Kysely<unknown>;

  beforeEach(() => {
    db = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("runs all bundled migrations on a fresh database", async () => {
    const result = await runAttachmentMigrations(db, ATTACHMENT_SCHEMA);
    expect(result.success).toBe(true);
    expect(result.migrationsExecuted).toEqual([
      "001_create_attachment_table",
      "002_create_reservation_table",
      "003_add_reservation_expires_at",
      "004_add_reservation_soft_delete",
      "005_add_reservation_active_index",
    ]);
  });

  it("tolerates previously executed migrations that are no longer shipped and warns the logger", async () => {
    const first = await runAttachmentMigrations(db, ATTACHMENT_SCHEMA);
    expect(first.success).toBe(true);

    // Simulate a downgrade or removed migration by inserting an orphan row.
    await sql`
      INSERT INTO ${sql.id(ATTACHMENT_SCHEMA)}.kysely_migration (name, timestamp)
      VALUES ('999_phantom_migration', ${new Date().toISOString()})
    `.execute(db.withSchema(ATTACHMENT_SCHEMA));

    const warn = vi.fn();
    const second = await runAttachmentMigrations(db, ATTACHMENT_SCHEMA, {
      warn,
    });
    expect(second.success).toBe(true);
    expect(second.error).toBeUndefined();
    expect(second.migrationsExecuted).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("999_phantom_migration");
  });
});
