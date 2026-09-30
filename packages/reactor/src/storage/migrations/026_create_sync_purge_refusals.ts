import type { Kysely } from "kysely";

/** A remote's refusal of a purge marker; payload-free, kept like the tombstone. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_purge_refusals")
    .addColumn("remote_name", "text", (col) => col.notNull())
    .addColumn("document_id", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("refused_at_utc_ms", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("sync_purge_refusals_pkey", [
      "remote_name",
      "document_id",
      "branch",
    ])
    .execute();
  await db.schema
    .createIndex("idx_sync_purge_refusals_document")
    .on("sync_purge_refusals")
    .column("document_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sync_purge_refusals").execute();
}
