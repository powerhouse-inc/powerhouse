import type { Kysely } from "kysely";

/** Orders header row writes across scopes; `lastOperationIndex` is per scope. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("DocumentSnapshot")
    .addColumn("lastOperationOrdinal", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("DocumentSnapshot")
    .dropColumn("lastOperationOrdinal")
    .execute();
}
