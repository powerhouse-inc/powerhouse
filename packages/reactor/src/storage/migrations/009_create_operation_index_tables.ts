import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("document_collections")
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("collectionId", "text", (col) => col.notNull())
    .addColumn("joinedOrdinal", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("leftOrdinal", "bigint")
    .addPrimaryKeyConstraint("document_collections_pkey", [
      "documentId",
      "collectionId",
    ])
    .execute();

  await db.schema
    .createIndex("idx_document_collections_collectionId")
    .on("document_collections")
    .column("collectionId")
    .execute();

  await db.schema
    .createIndex("idx_doc_collections_collection_range")
    .on("document_collections")
    .columns(["collectionId", "joinedOrdinal"])
    .execute();

  await db.schema
    .createTable("operation_index_operations")
    .addColumn("ordinal", "serial", (col) => col.primaryKey())
    .addColumn("opId", "text", (col) => col.notNull())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("timestampUtcMs", "bigint", (col) => col.notNull())
    .addColumn("writeTimestampUtcMs", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("index", "integer", (col) => col.notNull())
    .addColumn("skip", "integer", (col) => col.notNull())
    .addColumn("hash", "text", (col) => col.notNull())
    .addColumn("action", "jsonb", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_operation_index_operations_document")
    .on("operation_index_operations")
    .columns(["documentId", "branch", "scope"])
    .execute();

  await db.schema
    .createIndex("idx_operation_index_operations_ordinal")
    .on("operation_index_operations")
    .column("ordinal")
    .execute();
}
