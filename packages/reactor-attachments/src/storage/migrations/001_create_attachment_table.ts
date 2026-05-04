import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("attachment")
    .addColumn("hash", "text", (col) => col.primaryKey())
    .addColumn("mime_type", "text", (col) => col.notNull())
    .addColumn("file_name", "text", (col) => col.notNull())
    .addColumn("size_bytes", "bigint", (col) => col.notNull())
    .addColumn("extension", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("available"))
    .addColumn("storage_path", "text", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull().defaultTo("local"))
    .addColumn("created_at_utc", "text", (col) => col.notNull())
    .addColumn("last_accessed_at_utc", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_attachment_status")
    .on("attachment")
    .column("status")
    .execute();

  // Compound index serves the LRU eviction query:
  // SELECT ... WHERE status = 'available' ORDER BY last_accessed_at_utc ASC
  // A partial index would be ideal but raw SQL doesn't respect withSchema().
  await db.schema
    .createIndex("idx_attachment_lru")
    .on("attachment")
    .columns(["status", "last_accessed_at_utc"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("attachment").ifExists().execute();
}
