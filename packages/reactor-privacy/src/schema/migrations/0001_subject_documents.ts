import type { Kysely } from "kysely";

/** Documents by keyed subject hash: the index an access request reads. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("subject_documents")
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
    .on("subject_documents")
    .column("documentId")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("subject_documents").execute();
}
