import { PGlite } from "@electric-sql/pglite";
import knex, { type Knex } from "knex";
import ClientPgLite from "knex-pglite";
import { Kysely, sql } from "kysely";
import { KyselyKnexDialect, PGColdDialect } from "kysely-knex";
import type { DocumentPermissionDatabase } from "../../src/utils/db.js";

/** The schema the reactor's migrations run in (`REACTOR_SCHEMA`). */
export const REACTOR_STORE_SCHEMA = "reactor";

/**
 * A fresh in-memory reactor store holding the permission tables, bound to the
 * reactor schema, as the switchboard hands it to the permission service.
 *
 * Opened like the switchboard opens its reactor PGlite: without the read
 * store's UTC timestamp parsers. The tables mirror reactor migration
 * `029_create_permission_tables`, which this package cannot run in tests
 * without a built reactor; reactor's own migration test pins the catalog.
 * Destroying the returned Kysely closes the database.
 */
export async function openReactorPermissionStore(): Promise<
  Kysely<DocumentPermissionDatabase>
> {
  const connection = {
    pglite: new PGlite(),
  } as unknown as Knex.StaticConnectionConfig;
  const knexInstance = knex({
    client: ClientPgLite as typeof knex.Client,
    connection,
  });
  const base = new Kysely<DocumentPermissionDatabase>({
    dialect: new KyselyKnexDialect({
      knex: knexInstance,
      kyselySubDialect: new PGColdDialect(),
    }),
  });
  await sql`CREATE SCHEMA IF NOT EXISTS ${sql.id(REACTOR_STORE_SCHEMA)}`.execute(
    base,
  );
  const db = base.withSchema(REACTOR_STORE_SCHEMA);
  await createReactorPermissionTables(db);
  return db;
}

/** The DDL of reactor migration 029, against a schema-bound Kysely. */
export async function createReactorPermissionTables(
  db: Kysely<DocumentPermissionDatabase>,
): Promise<void> {
  await db.schema
    .createTable("DocumentPermission")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("documentId", "varchar(255)", (col) => col.notNull())
    .addColumn("userAddress", "varchar(255)", (col) => col.notNull())
    .addColumn("permission", "varchar(20)", (col) => col.notNull())
    .addColumn("grantedBy", "varchar(255)", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("DocumentPermission_documentId_userAddress_key", [
      "documentId",
      "userAddress",
    ])
    .addCheckConstraint(
      "DocumentPermission_permission_check",
      sql`"permission" IN ('READ', 'WRITE', 'ADMIN')`,
    )
    .execute();
  await db.schema
    .createIndex("documentpermission_documentid_index")
    .ifNotExists()
    .on("DocumentPermission")
    .column("documentId")
    .execute();
  await db.schema
    .createIndex("documentpermission_useraddress_index")
    .ifNotExists()
    .on("DocumentPermission")
    .column("userAddress")
    .execute();

  await db.schema
    .createTable("OperationUserPermission")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("documentId", "varchar(255)", (col) => col.notNull())
    .addColumn("operationType", "varchar(255)", (col) => col.notNull())
    .addColumn("userAddress", "varchar(255)", (col) => col.notNull())
    .addColumn("grantedBy", "varchar(255)", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint(
      "OperationUserPermission_documentId_operationType_userAddres_key",
      ["documentId", "operationType", "userAddress"],
    )
    .execute();
  await db.schema
    .createIndex("operationuserpermission_documentid_index")
    .ifNotExists()
    .on("OperationUserPermission")
    .column("documentId")
    .execute();
  await db.schema
    .createIndex("operationuserpermission_useraddress_index")
    .ifNotExists()
    .on("OperationUserPermission")
    .column("userAddress")
    .execute();

  await db.schema
    .createTable("DocumentProtection")
    .ifNotExists()
    .addColumn("documentId", "varchar(255)", (col) => col.primaryKey())
    .addColumn("protected", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("ownerAddress", "varchar(255)")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createIndex("documentprotection_owneraddress_index")
    .ifNotExists()
    .on("DocumentProtection")
    .column("ownerAddress")
    .execute();
  await db.schema
    .createIndex("documentprotection_protected_index")
    .ifNotExists()
    .on("DocumentProtection")
    .column("protected")
    .execute();
}
