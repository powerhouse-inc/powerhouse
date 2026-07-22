import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("attachment_reference")
    .addColumn("document_id", "text", (col) => col.notNull())
    .addColumn("attachment_ref", "text", (col) => col.notNull())
    .addColumn("attachment_hash", "text", (col) => col.notNull())
    .addColumn("first_operation_id", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("first_seen_ordinal", "integer", (col) => col.notNull())
    .addColumn("created_at_utc", "text", (col) => col.notNull())
    .addUniqueConstraint("unique_attachment_reference_document_ref", [
      "document_id",
      "attachment_ref",
    ])
    .execute();

  await db.schema
    .createIndex("idx_attachment_reference_ref")
    .on("attachment_reference")
    .column("attachment_ref")
    .execute();

  await db.schema
    .createIndex("idx_attachment_reference_hash")
    .on("attachment_reference")
    .column("attachment_hash")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("attachment_reference").ifExists().execute();
}
