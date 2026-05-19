import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("DriveNode")
    .ifNotExists()
    .addColumn("driveId", "text", (col) => col.notNull())
    .addColumn("id", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("requestedName", "text", (col) => col.notNull())
    .addColumn("parentFolder", "text")
    .addColumn("documentType", "text")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addPrimaryKeyConstraint("pk_drive_node", ["driveId", "id"])
    .addCheckConstraint(
      "chk_drive_node_document_type",
      sql`(kind = 'file' AND "documentType" IS NOT NULL) OR (kind = 'folder' AND "documentType" IS NULL)`,
    )
    .execute();

  await db.schema
    .createIndex("idx_drive_node_parent_name")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "name"])
    .execute();

  await db.schema
    .createIndex("idx_drive_node_parent_kind_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "kind", "id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("DriveNode").execute();
}
