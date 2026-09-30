import type { Kysely } from "kysely";

/** Received purge markers awaiting their outcome; removed with their remote. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_received_markers")
    .addColumn("remote_name", "text", (col) => col.notNull())
    .addColumn("marker_id", "text", (col) => col.notNull())
    .addColumn("document_id", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("operation", "jsonb", (col) => col.notNull())
    .addColumn("received_at_utc_ms", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("sync_received_markers_pkey", [
      "remote_name",
      "marker_id",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sync_received_markers").execute();
}
