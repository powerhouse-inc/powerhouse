import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_dead_letters")
    .addColumn("ordinal", "serial", (col) => col.primaryKey())
    .addColumn("id", "text", (col) => col.unique().notNull())
    .addColumn("job_id", "text", (col) => col.notNull())
    .addColumn("job_dependencies", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("remote_name", "text", (col) =>
      col.notNull().references("sync_remotes.name").onDelete("cascade"),
    )
    .addColumn("document_id", "text", (col) => col.notNull())
    .addColumn("scopes", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("operations", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("error_source", "text", (col) => col.notNull())
    .addColumn("error_message", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_sync_dead_letters_remote")
    .on("sync_dead_letters")
    .column("remote_name")
    .execute();
}
