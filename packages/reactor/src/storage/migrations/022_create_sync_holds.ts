import type { Kysely } from "kysely";

/** Documents held back from a remote whose peer cannot run their versions. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_holds")
    .addColumn("remote_name", "text", (col) =>
      col.notNull().references("sync_remotes.name").onDelete("cascade"),
    )
    .addColumn("document_id", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("protocol", "text", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("held_at_utc_ms", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("sync_holds_pkey", [
      "remote_name",
      "document_id",
      "branch",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sync_holds").execute();
}
