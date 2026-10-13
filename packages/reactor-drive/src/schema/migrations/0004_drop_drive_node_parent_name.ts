import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_drive_node_parent_name").ifExists().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("idx_drive_node_parent_name")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "name"])
    .execute();
}
