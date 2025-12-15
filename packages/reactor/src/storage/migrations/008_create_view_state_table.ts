import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("ViewState")
    .addColumn("readModelId", "text", (col) => col.primaryKey())
    .addColumn("lastOrdinal", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}
