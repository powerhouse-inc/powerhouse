import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_remotes")
    .addColumn("name", "text", (col) => col.primaryKey())
    .addColumn("collection_id", "text", (col) => col.notNull())
    .addColumn("channel_type", "text", (col) => col.notNull())
    .addColumn("channel_parameters", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("filter_document_ids", "jsonb")
    .addColumn("filter_scopes", "jsonb")
    .addColumn("filter_branch", "text", (col) =>
      col.notNull().defaultTo("main"),
    )
    .addColumn("push_state", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("push_last_success_utc_ms", "bigint")
    .addColumn("push_last_failure_utc_ms", "bigint")
    .addColumn("push_failure_count", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("pull_state", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("pull_last_success_utc_ms", "bigint")
    .addColumn("pull_last_failure_utc_ms", "bigint")
    .addColumn("pull_failure_count", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_sync_remotes_collection")
    .on("sync_remotes")
    .column("collection_id")
    .execute();

  await db.schema
    .createTable("sync_cursors")
    .addColumn("remote_name", "text", (col) =>
      col.primaryKey().references("sync_remotes.name").onDelete("cascade"),
    )
    .addColumn("cursor_ordinal", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("last_synced_at_utc_ms", "bigint")
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_sync_cursors_ordinal")
    .on("sync_cursors")
    .column("cursor_ordinal")
    .execute();
}
