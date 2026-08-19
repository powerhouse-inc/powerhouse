import type { Kysely } from "kysely";

/**
 * The address a sync channel is bound to, so a channel created by one subject
 * cannot be polled by another.
 *
 * Nullable rather than defaulted: null is a channel nobody has claimed, which is
 * what every pre-existing row is and what an anonymously created channel stays
 * until its first authenticated poll adopts it. A default would claim them all
 * for one address.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .addColumn("bound_address", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .dropColumn("bound_address")
    .execute();
}
