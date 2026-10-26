import { sql, type Kysely } from "kysely";

/**
 * Replaces 023's index with one keyed by the creation's protocolVersions and
 * model, so startup reads each distinct (model, versions) pair and judges the
 * model's reducers too.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_created_model_protocol_versions")
    .ifNotExists()
    .on("Operation")
    .expression(
      sql`(md5((action->'input'->'protocolVersions')::text) || coalesce(action->'input'->>'model', ''))`,
    )
    .where(
      sql<boolean>`scope = 'document' and "index" = 0 and (action->'input'->'protocolVersions') is not null`,
    )
    .execute();
  await db.schema
    .dropIndex("idx_operation_created_protocol_versions")
    .ifExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_created_protocol_versions")
    .ifNotExists()
    .on("Operation")
    .expression(sql`md5((action->'input'->'protocolVersions')::text)`)
    .where(
      sql<boolean>`scope = 'document' and "index" = 0 and (action->'input'->'protocolVersions') is not null`,
    )
    .execute();
  await db.schema
    .dropIndex("idx_operation_created_model_protocol_versions")
    .execute();
}
