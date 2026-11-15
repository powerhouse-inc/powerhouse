import { sql } from "kysely";
import type { Kysely } from "kysely";

/**
 * The store's migration release: the platform release that last completed its
 * one-shot migrations on this store, and when. One row, written by
 * `recordMigrationRelease` and read by `checkMigrationFloor`.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("MigrationRelease")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().check(sql`id = 1`))
    .addColumn("release", "text", (col) => col.notNull())
    .addColumn("completedAtUtcIso", "text", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("MigrationRelease").ifExists().execute();
}
