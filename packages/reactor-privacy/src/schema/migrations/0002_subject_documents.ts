import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("subject_documents")
    .ifNotExists()
    .addColumn("subjectHash", "text", (col) => col.notNull())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("firstOrdinal", "bigint", (col) => col.notNull())
    .addColumn("lastOrdinal", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("subject_documents_pkey", [
      "subjectHash",
      "documentId",
      "role",
    ])
    .execute();

  await db.schema
    .createIndex("idx_subject_documents_document")
    .ifNotExists()
    .on("subject_documents")
    .column("documentId")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("subject_documents").execute();
}
