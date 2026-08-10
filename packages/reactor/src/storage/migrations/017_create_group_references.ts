import type { Kysely } from "kysely";

/**
 * One row per (document, group) reference ever discovered from an auth
 * operation's input. Rows are never updated or deleted: auth evaluation is
 * positional, so a grant that named a group at any position keeps that
 * group's stream in the document's read-set even after a later operation
 * removes the reference. Read by documentId for the groups a document
 * requires (sync), and by groupId for the documents a group change affects
 * (re-evaluation).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("group_references")
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("groupId", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("group_references_pkey", ["documentId", "groupId"])
    .execute();

  await db.schema
    .createIndex("idx_group_references_groupId")
    .on("group_references")
    .column("groupId")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("group_references").execute();
}
