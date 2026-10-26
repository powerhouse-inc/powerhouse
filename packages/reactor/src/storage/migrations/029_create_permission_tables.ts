import { sql } from "kysely";
import type { Kysely } from "kysely";

/**
 * The document permission tables, moved from the read-model store into the
 * reactor store so grants and identity resolve on the same side.
 *
 * Columns, keys, constraint names and indexes are the ones reactor-api's
 * migrations 001 to 003 leave on the read store, with one change: timestamps
 * are `timestamptz`. The reactor store's PGlite runs without the read store's
 * UTC timestamp parsers, so a `timestamp` column would read back shifted by
 * the host's UTC offset; `timestamptz` round-trips the instant on PGlite and
 * Postgres alike.
 *
 * Rows are copied from the read store once, at host boot, not here: the two
 * stores are separate databases. Every statement is safe to run again.
 */
export async function up(db: Kysely<any>): Promise<void> {
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

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("DocumentProtection").ifExists().execute();
  await db.schema.dropTable("OperationUserPermission").ifExists().execute();
  await db.schema.dropTable("DocumentPermission").ifExists().execute();
}
