import type { Kysely } from "kysely";
import { sql } from "kysely";

/** Tombstones, kept forever; `purgedOrdinals` are the index ordinals removed. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("document_purges")
    .addColumn("ordinal", "bigserial", (col) => col.primaryKey())
    .addColumn("documentId", "text", (col) => col.notNull().unique())
    .addColumn("directiveId", "text", (col) => col.notNull())
    .addColumn("purgedOrdinals", sql`int8range[]`, (col) => col.notNull())
    .addColumn("purgedAtUtc", "timestamptz", (col) => col.notNull())
    .addColumn("purgedBy", "text")
    .execute();

  await db.schema
    .alterTable("ViewState")
    .addColumn("lastPurgeOrdinal", "bigint", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("ViewState")
    .dropColumn("lastPurgeOrdinal")
    .execute();
  await db.schema.dropTable("document_purges").execute();
}
