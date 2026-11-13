import { sql, type Kysely } from "kysely";

/**
 * Backs getStreamLatestTimestamp and each scope's newest timestamp in
 * getRevisions: without it, max("timestampUtcMs") for a document or stream
 * reads every one of its operations (#3392). Built in the
 * migration's transaction, which blocks writes to Operation while it builds.
 * On a large table, build it beforehand without blocking writes; this
 * migration then finds it and does nothing:
 *
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_scope_timestamp
 *     ON reactor."Operation" ("documentId", scope, branch, "timestampUtcMs" DESC);
 *
 * After a concurrent build, check it is valid:
 *
 *   select indisvalid from pg_index where indexrelid = 'reactor.idx_operation_scope_timestamp'::regclass;
 *
 * If it is false, drop it (DROP INDEX CONCURRENTLY reactor.idx_operation_scope_timestamp;)
 * and build it again before deploying. A failed or cancelled concurrent build
 * leaves an invalid index of the same name, which IF NOT EXISTS keeps, so this
 * migration would record itself as applied while the planner never uses it.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_scope_timestamp")
    .ifNotExists()
    .on("Operation")
    .expression(sql`"documentId", scope, branch, "timestampUtcMs" desc`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_operation_scope_timestamp")
    .ifExists()
    .execute();
}
