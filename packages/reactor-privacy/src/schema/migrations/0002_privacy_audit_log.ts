import type { Kysely } from "kysely";
import { sql } from "kysely";

/** Append-only; kept apart from documents so it survives what it records. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("privacy_audit_log")
    .addColumn("ordinal", "bigserial", (col) => col.primaryKey())
    .addColumn("id", "text", (col) => col.notNull().unique())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("requestId", "text")
    .addColumn("requester", "text")
    .addColumn("authoriser", "text")
    .addColumn("subjectHash", "text")
    .addColumn("documentIds", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("detail", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("createdAtUtc", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_privacy_audit_log_created")
    .on("privacy_audit_log")
    .column("createdAtUtc")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("privacy_audit_log").execute();
}
