import { sql, type Kysely } from "kysely";

const LISTING_INDEXES = [
  "idx_drive_node_parent_created_id",
  "idx_drive_node_parent_kind_created_id",
  "idx_drive_node_root_created_id",
  "idx_drive_node_root_kind_created_id",
  "idx_drive_node_created_id",
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("idx_drive_node_parent_created_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "createdAt", "id"])
    .execute();

  await db.schema
    .createIndex("idx_drive_node_parent_kind_created_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "kind", "createdAt", "id"])
    .execute();

  // The planner takes no sort order from an IS NULL index column.
  await db.schema
    .createIndex("idx_drive_node_root_created_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "createdAt", "id"])
    .where(sql.ref("parentFolder"), "is", null)
    .execute();

  await db.schema
    .createIndex("idx_drive_node_root_kind_created_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "kind", "createdAt", "id"])
    .where(sql.ref("parentFolder"), "is", null)
    .execute();

  await db.schema
    .createIndex("idx_drive_node_created_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "createdAt", "id"])
    .execute();

  await db.schema
    .dropIndex("idx_drive_node_parent_kind_id")
    .ifExists()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("idx_drive_node_parent_kind_id")
    .ifNotExists()
    .on("DriveNode")
    .columns(["driveId", "parentFolder", "kind", "id"])
    .execute();

  for (const name of LISTING_INDEXES) {
    await db.schema.dropIndex(name).ifExists().execute();
  }
}
