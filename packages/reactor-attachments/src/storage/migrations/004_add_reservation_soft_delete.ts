import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("attachment_reservation")
    .addColumn("deleted_at_utc", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("attachment_reservation")
    .dropColumn("deleted_at_utc")
    .execute();
}
