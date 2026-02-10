import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Delete any leftover fake "outbox::" cursor rows and remote records
  await db
    .deleteFrom("sync_cursors")
    .where("remote_name", "like", "outbox::%")
    .execute();
  await db
    .deleteFrom("sync_remotes")
    .where("name", "like", "outbox::%")
    .execute();

  // Recreate sync_cursors with cursor_type column and composite PK (no FK)
  await db.schema.dropTable("sync_cursors").execute();

  await db.schema
    .createTable("sync_cursors")
    .addColumn("remote_name", "text", (col) => col.notNull())
    .addColumn("cursor_type", "text", (col) => col.notNull().defaultTo("inbox"))
    .addColumn("cursor_ordinal", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("last_synced_at_utc_ms", "text")
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addPrimaryKeyConstraint("sync_cursors_pk", ["remote_name", "cursor_type"])
    .execute();

  await db.schema
    .createIndex("idx_sync_cursors_ordinal")
    .on("sync_cursors")
    .column("cursor_ordinal")
    .execute();
}
