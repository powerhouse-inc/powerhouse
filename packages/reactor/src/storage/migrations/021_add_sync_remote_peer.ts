import type { Kysely } from "kysely";

/**
 * The peer's manifest as canonical JSON, and when it was heard. Both null: not
 * yet heard. A time with no manifest: a silent peer, which gets the baselines.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .addColumn("peer_manifest", "text")
    .addColumn("peer_manifest_at_utc_ms", "bigint")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .dropColumn("peer_manifest")
    .dropColumn("peer_manifest_at_utc_ms")
    .execute();
}
