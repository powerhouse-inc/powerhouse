import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS "DocumentProtection" (
      "documentId" VARCHAR(255) PRIMARY KEY,
      "protected" BOOLEAN NOT NULL DEFAULT false,
      "ownerAddress" VARCHAR(255),
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS "documentprotection_owneraddress_index" ON "DocumentProtection" ("ownerAddress")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "documentprotection_protected_index" ON "DocumentProtection" ("protected")`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "DocumentProtection"`.execute(db);
}
