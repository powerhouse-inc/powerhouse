import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("Keyframe")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("revision", "integer", (col) => col.notNull())
    .addColumn("document", "jsonb", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint("unique_keyframe", [
      "documentId",
      "scope",
      "branch",
      "revision",
    ])
    .execute();

  // Create index for keyframe lookup
  await db.schema
    .createIndex("keyframe_lookup")
    .on("Keyframe")
    .columns(["documentId", "scope", "branch", "revision"])
    .execute();
}
