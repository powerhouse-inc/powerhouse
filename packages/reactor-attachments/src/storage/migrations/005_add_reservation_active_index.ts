import { sql, type Kysely, type SqlBool } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_reservation_expires_at").ifExists().execute();

  await db.schema
    .createIndex("idx_reservation_expires_at_active")
    .on("attachment_reservation")
    .column("expires_at_utc")
    .where(sql<SqlBool>`deleted_at_utc IS NULL`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_reservation_expires_at_active")
    .ifExists()
    .execute();

  await db.schema
    .createIndex("idx_reservation_expires_at")
    .on("attachment_reservation")
    .column("expires_at_utc")
    .execute();
}
