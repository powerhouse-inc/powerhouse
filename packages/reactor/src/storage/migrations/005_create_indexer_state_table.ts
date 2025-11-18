import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("IndexerState")
    .addColumn("id", "integer", (col) =>
      col.primaryKey().generatedAlwaysAsIdentity(),
    )
    .addColumn("lastOperationId", "integer", (col) => col.notNull())
    .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}
