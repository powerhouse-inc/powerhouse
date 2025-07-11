import { type Kysely } from "kysely";

export async function up(db: Kysely<unknown>) {
  await db.schema
    .createTable("listener")
    .ifNotExists()
    .addColumn("parent_id", "varchar", (col) => col.notNull())
    .addColumn("listener_id", "varchar", (col) => col.notNull())
    .addColumn("label", "varchar")
    .addColumn("block", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("system", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("filter", "jsonb", (col) => col.notNull())
    .addColumn("call_info", "jsonb")
    .addPrimaryKeyConstraint("listener_pkey", ["parent_id", "listener_id"])
    .execute();

  await db.schema
    .createIndex("listener_parent_id_idx")
    .on("listener")
    .column("parent_id")
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropIndex("listener_parent_id_idx").ifExists().execute();
  await db.schema.dropTable("listener").ifExists().execute();
}
