import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("ProcessorCursor")
    .addColumn("processorId", "text", (col) => col.primaryKey())
    .addColumn("factoryId", "text", (col) => col.notNull())
    .addColumn("driveId", "text", (col) => col.notNull())
    .addColumn("processorIndex", "integer", (col) => col.notNull())
    .addColumn("lastOrdinal", "integer", (col) =>
      col.notNull().defaultTo(sql`0`),
    )
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo(sql`'active'`),
    )
    .addColumn("lastError", "text")
    .addColumn("lastErrorTimestamp", "timestamptz")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}
