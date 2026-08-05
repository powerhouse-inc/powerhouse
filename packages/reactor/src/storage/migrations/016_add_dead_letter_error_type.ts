import type { Kysely } from "kysely";

/**
 * The classification a dead letter falls into, stored because it decides whether
 * the document stays quarantined and the in-memory error is gone after a restart.
 * Defaulted rather than nullable, so a pre-existing row rehydrates.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_dead_letters")
    .addColumn("error_type", "text", (col) =>
      col.notNull().defaultTo("UNCLASSIFIED"),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_dead_letters")
    .dropColumn("error_type")
    .execute();
}
