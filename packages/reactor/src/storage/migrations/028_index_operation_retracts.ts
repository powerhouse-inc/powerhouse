import { sql, type Kysely } from "kysely";

/**
 * Finds the RETRACTs naming a row without reading the stream. The target is
 * hashed, as in 023, so a long target cannot exceed the btree entry limit.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_retracts")
    .on("Operation")
    .expression(
      sql`"documentId", "scope", "branch", md5(action->'input'->>'target')`,
    )
    .where(sql<boolean>`action->>'type' = 'RETRACT'`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_operation_retracts").execute();
}
