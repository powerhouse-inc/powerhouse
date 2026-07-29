import type { Kysely } from "kysely";

/**
 * Records why authorization refused an operation. Separate from `error` so a
 * denial is distinguishable from a reducer failure without matching on a
 * message. Null for every operation written before decisions were enforced.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("Operation")
    .addColumn("deniedReason", "text")
    .execute();

  // Sync reads operations from the index rather than the operation table, so
  // the reason has to be here as well or a denial does not reach a replica.
  await db.schema
    .alterTable("operation_index_operations")
    .addColumn("deniedReason", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("operation_index_operations")
    .dropColumn("deniedReason")
    .execute();
  await db.schema.alterTable("Operation").dropColumn("deniedReason").execute();
}
