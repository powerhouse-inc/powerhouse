import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create DocumentPermission table
  await sql`
    CREATE TABLE IF NOT EXISTS "DocumentPermission" (
      "id" SERIAL PRIMARY KEY,
      "documentId" VARCHAR(255) NOT NULL,
      "userAddress" VARCHAR(255) NOT NULL,
      "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
      "grantedBy" VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("documentId", "userAddress")
    )
  `.execute(db);

  // Create indexes for DocumentPermission
  await sql`CREATE INDEX IF NOT EXISTS "documentpermission_documentid_index" ON "DocumentPermission" ("documentId")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "documentpermission_useraddress_index" ON "DocumentPermission" ("userAddress")`.execute(
    db,
  );

  // Create Group table
  await sql`
    CREATE TABLE IF NOT EXISTS "Group" (
      "id" SERIAL PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "description" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db);

  // Create UserGroup table (user-group membership)
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

  // Create DocumentGroupPermission table
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

  // Create OperationUserPermission table
  await sql`
    CREATE TABLE IF NOT EXISTS "OperationUserPermission" (
      "id" SERIAL PRIMARY KEY,
      "documentId" VARCHAR(255) NOT NULL,
      "operationType" VARCHAR(255) NOT NULL,
      "userAddress" VARCHAR(255) NOT NULL,
      "grantedBy" VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("documentId", "operationType", "userAddress")
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS "operationuserpermission_documentid_index" ON "OperationUserPermission" ("documentId")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "operationuserpermission_useraddress_index" ON "OperationUserPermission" ("userAddress")`.execute(
    db,
  );

  // Create OperationGroupPermission table
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

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "OperationGroupPermission"`.execute(db);
  await sql`DROP TABLE IF EXISTS "OperationUserPermission"`.execute(db);
  await sql`DROP TABLE IF EXISTS "DocumentGroupPermission"`.execute(db);
  await sql`DROP TABLE IF EXISTS "UserGroup"`.execute(db);
  await sql`DROP TABLE IF EXISTS "Group"`.execute(db);
  await sql`DROP TABLE IF EXISTS "DocumentPermission"`.execute(db);
}
