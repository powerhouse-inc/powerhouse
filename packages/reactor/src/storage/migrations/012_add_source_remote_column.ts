import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("operation_index_operations")
    .addColumn("sourceRemote", "text", (col) => col.notNull().defaultTo(""))
    .execute();
}
