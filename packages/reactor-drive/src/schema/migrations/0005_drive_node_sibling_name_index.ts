import type { Kysely } from "kysely";

/**
 * Sibling-name resolution checks candidate names one at a time instead of
 * loading every sibling, so (driveId, parentFolder, name) is a filter again.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("idx_drive_node_parent_name")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "name"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_drive_node_parent_name").ifExists().execute();
}
