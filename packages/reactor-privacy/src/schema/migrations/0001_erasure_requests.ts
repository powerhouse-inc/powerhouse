import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>, schema: string): Promise<void> {
  await db.schema
    .createTable("erasure_requests")
    .ifNotExists()
    .addColumn("requestId", "text", (col) => col.primaryKey())
    .addColumn("subjectHash", "text")
    .addColumn("requestedBy", "text", (col) => col.notNull())
    .addColumn("requestedAt", "timestamptz", (col) => col.notNull())
    .addColumn("deadline", "timestamptz", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("erasure_items")
    .ifNotExists()
    .addColumn("requestId", "text", (col) =>
      col.notNull().references("erasure_requests.requestId"),
    )
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("allowLarge", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("markerOrdinal", "bigint")
    .addColumn("lastError", "text")
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("erasure_items_pkey", ["requestId", "documentId"])
    .execute();

  await db.schema
    .createTable("erasure_audit")
    .ifNotExists()
    .addColumn("ordinal", "bigserial", (col) => col.primaryKey())
    .addColumn("requestId", "text", (col) => col.notNull())
    .addColumn("documentId", "text")
    .addColumn("event", "text", (col) => col.notNull())
    .addColumn("detail", "jsonb")
    .addColumn("atUtc", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_erasure_audit_request")
    .ifNotExists()
    .on("erasure_audit")
    .column("requestId")
    .execute();

  // Append-only: retention may delete old rows, nothing may rewrite one.
  await sql`
    create or replace function ${sql.id(schema, "erasure_audit_append_only")}()
    returns trigger
    language plpgsql as $$
    begin
      raise exception 'erasure_audit is append-only';
    end $$
  `.execute(db);
  await sql`
    create trigger erasure_audit_no_update
    before update on ${sql.id(schema, "erasure_audit")}
    for each row execute function ${sql.id(schema, "erasure_audit_append_only")}()
  `.execute(db);
}

export async function down(db: Kysely<unknown>, schema: string): Promise<void> {
  await db.schema.dropTable("erasure_audit").execute();
  await sql`drop function if exists ${sql.id(schema, "erasure_audit_append_only")}()`.execute(
    db,
  );
  await db.schema.dropTable("erasure_items").execute();
  await db.schema.dropTable("erasure_requests").execute();
}
