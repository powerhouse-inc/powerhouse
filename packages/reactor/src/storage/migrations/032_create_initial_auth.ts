import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("InitialAuthCreation")
    .addColumn("intentKey", "varchar", (column) => column.primaryKey())
    .addColumn("requestDigest", "varchar", (column) => column.notNull())
    .addColumn("documentId", "varchar", (column) => column.notNull().unique())
    .addColumn("envelope", "jsonb", (column) => column.notNull())
    .addColumn("facts", "jsonb", (column) => column.notNull())
    .addColumn("committed", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();
  await db.schema
    .createTable("InitialAuthInbox")
    .addColumn("documentId", "varchar", (column) => column.notNull())
    .addColumn("actionId", "varchar", (column) => column.notNull())
    .addColumn("signerKey", "varchar", (column) => column.notNull())
    .addColumn("operation", "jsonb", (column) => column.notNull())
    .addPrimaryKeyConstraint("InitialAuthInbox_pk", [
      "documentId",
      "actionId",
      "signerKey",
    ])
    .execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("InitialAuthInbox").execute();
  await db.schema.dropTable("InitialAuthCreation").execute();
}
