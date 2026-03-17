import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("idx_operation_doc_branch_scope_index")
    .on("Operation")
    .columns(["documentId", "branch", "scope", "index"])
    .execute();
}
