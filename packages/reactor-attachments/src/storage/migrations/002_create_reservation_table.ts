import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("attachment_reservation")
    .addColumn("reservation_id", "text", (col) => col.primaryKey())
    .addColumn("mime_type", "text", (col) => col.notNull())
    .addColumn("file_name", "text", (col) => col.notNull())
    .addColumn("extension", "text")
    .addColumn("created_at_utc", "text", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("attachment_reservation").ifExists().execute();
}
