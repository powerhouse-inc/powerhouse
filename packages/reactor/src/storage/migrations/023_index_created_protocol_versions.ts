import { sql, type Kysely } from "kysely";

/**
 * One entry per document created with protocolVersions, keyed by a hash so an
 * oversized header cannot make its creation unstorable. Startup reads the
 * distinct values without visiting every document.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_created_protocol_versions")
    .on("Operation")
    .expression(sql`md5((action->'input'->'protocolVersions')::text)`)
    .where(
      sql<boolean>`scope = 'document' and "index" = 0 and (action->'input'->'protocolVersions') is not null`,
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_operation_created_protocol_versions")
    .execute();
}
