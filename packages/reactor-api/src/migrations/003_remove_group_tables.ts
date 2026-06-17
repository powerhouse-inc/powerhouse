import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Removes the group-permission feature: the Group, UserGroup,
 * DocumentGroupPermission, and OperationGroupPermission tables. The feature had
 * no consumers and disclosed ACL/membership metadata (AUTH_REVIEW S-H3/S-H5);
 * it is retired in favor of direct user grants, ownership, and protection.
 *
 * Tables are dropped in reverse dependency order. There are no DB-enforced
 * foreign keys, so the drops cannot violate referential integrity and do not
 * touch the surviving DocumentPermission / OperationUserPermission /
 * DocumentProtection tables.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "OperationGroupPermission"`.execute(db);
  await sql`DROP TABLE IF EXISTS "DocumentGroupPermission"`.execute(db);
  await sql`DROP TABLE IF EXISTS "UserGroup"`.execute(db);
  await sql`DROP TABLE IF EXISTS "Group"`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate the group tables exactly as migration 001 created them.
  await sql`
    CREATE TABLE IF NOT EXISTS "Group" (
      "id" SERIAL PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "description" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS "UserGroup" (
      "userAddress" VARCHAR(255) NOT NULL,
      "groupId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("userAddress", "groupId")
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS "usergroup_groupid_index" ON "UserGroup" ("groupId")`.execute(
    db,
  );

  await sql`
    CREATE TABLE IF NOT EXISTS "DocumentGroupPermission" (
      "id" SERIAL PRIMARY KEY,
      "documentId" VARCHAR(255) NOT NULL,
      "groupId" INTEGER NOT NULL,
      "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
      "grantedBy" VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("documentId", "groupId")
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS "documentgrouppermission_documentid_index" ON "DocumentGroupPermission" ("documentId")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "documentgrouppermission_groupid_index" ON "DocumentGroupPermission" ("groupId")`.execute(
    db,
  );

  await sql`
    CREATE TABLE IF NOT EXISTS "OperationGroupPermission" (
      "id" SERIAL PRIMARY KEY,
      "documentId" VARCHAR(255) NOT NULL,
      "operationType" VARCHAR(255) NOT NULL,
      "groupId" INTEGER NOT NULL,
      "grantedBy" VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("documentId", "operationType", "groupId")
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS "operationgrouppermission_documentid_index" ON "OperationGroupPermission" ("documentId")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "operationgrouppermission_groupid_index" ON "OperationGroupPermission" ("groupId")`.execute(
    db,
  );
}
