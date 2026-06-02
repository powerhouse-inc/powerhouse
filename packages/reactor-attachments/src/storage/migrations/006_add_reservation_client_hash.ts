import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("attachment_reservation")
    .addColumn("client_hash", "text")
    .execute();

  await db.schema
    .alterTable("attachment_reservation")
    .addColumn("size_bytes", "bigint")
    .execute();

  // Structural enforcement: size_bytes must be present whenever client_hash
  // is present. The expression references only the row's own columns so the
  // known withSchema() caveat (raw SQL table references are not schema-
  // qualified) does not apply here.
  await db.schema
    .alterTable("attachment_reservation")
    .addCheckConstraint(
      "attachment_reservation_hash_size_check",
      sql`client_hash is null or size_bytes is not null`,
    )
    .execute();

  // Non-unique index. Partial unique indexes are not used here: raw SQL
  // index predicates do not respect withSchema() (see migration 001), and
  // uniqueness is deliberately not a requirement (concurrent reservations
  // for the same hash are permitted -- see the hash-first design doc).
  await db.schema
    .createIndex("idx_reservation_client_hash")
    .on("attachment_reservation")
    .column("client_hash")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_reservation_client_hash").ifExists().execute();

  await db.schema
    .alterTable("attachment_reservation")
    .dropColumn("size_bytes")
    .execute();

  await db.schema
    .alterTable("attachment_reservation")
    .dropColumn("client_hash")
    .execute();
}
