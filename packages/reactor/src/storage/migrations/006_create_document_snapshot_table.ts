import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("DocumentSnapshot")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("slug", "text")
    .addColumn("name", "text")
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("content", "jsonb", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("lastOperationIndex", "integer", (col) => col.notNull())
    .addColumn("lastOperationHash", "text", (col) => col.notNull())
    .addColumn("lastUpdatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("snapshotVersion", "integer", (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn("identifiers", "jsonb")
    .addColumn("metadata", "jsonb")
    .addColumn("isDeleted", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("deletedAt", "timestamptz")
    .addUniqueConstraint("unique_doc_scope_branch", [
      "documentId",
      "scope",
      "branch",
    ])
    .execute();

  // Create indexes for query optimization
  await db.schema
    .createIndex("idx_slug_scope_branch")
    .on("DocumentSnapshot")
    .columns(["slug", "scope", "branch"])
    .execute();

  await db.schema
    .createIndex("idx_doctype_scope_branch")
    .on("DocumentSnapshot")
    .columns(["documentType", "scope", "branch"])
    .execute();

  await db.schema
    .createIndex("idx_last_updated")
    .on("DocumentSnapshot")
    .column("lastUpdatedAt")
    .execute();

  await db.schema
    .createIndex("idx_is_deleted")
    .on("DocumentSnapshot")
    .column("isDeleted")
    .execute();
}
