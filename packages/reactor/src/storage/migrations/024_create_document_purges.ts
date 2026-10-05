import type { Kysely } from "kysely";

/** One row per purged document: the tombstone. Written once, never deleted. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("document_purges")
    .addColumn("documentId", "text", (col) => col.primaryKey())
    .addColumn("ordinal", "bigint", (col) => col.notNull())
    .addColumn("removedRows", "jsonb", (col) => col.notNull())
    .addColumn("purgedAtUtc", "timestamptz", (col) => col.notNull())
    .addColumn("requestId", "text", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("document_purges").execute();
}
