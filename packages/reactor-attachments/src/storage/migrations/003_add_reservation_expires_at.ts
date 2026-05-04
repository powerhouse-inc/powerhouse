import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("attachment_reservation")
    .addColumn("expires_at_utc", "text")
    .execute();

  await db
    .updateTable("attachment_reservation")
    .set({ expires_at_utc: sql`created_at_utc` })
    .where("expires_at_utc", "is", null)
    .execute();

  await db.schema
    .alterTable("attachment_reservation")
    .alterColumn("expires_at_utc", (col) => col.setNotNull())
    .execute();

  await db.schema
    .createIndex("idx_reservation_expires_at")
    .on("attachment_reservation")
    .column("expires_at_utc")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_reservation_expires_at").ifExists().execute();

  await db.schema
    .alterTable("attachment_reservation")
    .dropColumn("expires_at_utc")
    .execute();
}
