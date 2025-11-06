import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("Operation")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("jobId", "text", (col) => col.notNull())
    .addColumn("opId", "text", (col) => col.notNull().unique())
    .addColumn("prevOpId", "text", (col) => col.notNull())
    .addColumn("writeTimestampUtcMs", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("timestampUtcMs", "timestamptz", (col) => col.notNull())
    .addColumn("index", "integer", (col) => col.notNull())
    .addColumn("action", "jsonb", (col) => col.notNull())
    .addColumn("skip", "integer", (col) => col.notNull())
    .addColumn("error", "text")
    .addColumn("hash", "text", (col) => col.notNull())
    .addUniqueConstraint("unique_revision", [
      "documentId",
      "scope",
      "branch",
      "index",
    ])
    .execute();

  // Create index for streaming operations
  await db.schema
    .createIndex("streamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "branch", "id"])
    .execute();

  // Create index for branchless streaming operations
  await db.schema
    .createIndex("branchlessStreamOperations")
    .on("Operation")
    .columns(["documentId", "scope", "id"])
    .execute();
}
