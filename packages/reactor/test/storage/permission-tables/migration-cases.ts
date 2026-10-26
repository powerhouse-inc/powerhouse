import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as migration029 from "../../../src/storage/migrations/029_create_permission_tables.js";
import { runMigrations } from "../../../src/storage/migrations/migrator.js";

/** A fresh, empty database; `destroy` releases it. */
export type MigrationTestDatabase = {
  base: Kysely<any>;
  destroy: () => Promise<void>;
};

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  character_maximum_length: number | null;
  has_default: boolean;
};

type ConstraintRow = { table_name: string; name: string; kind: string };

type IndexRow = { tablename: string; indexname: string };

/**
 * The catalog reactor-api's migrations 001 to 003 leave behind, with the one
 * intended change: timestamps are `timestamp with time zone`.
 */
const EXPECTED_COLUMNS: Omit<ColumnRow, "has_default">[] = [
  ["DocumentPermission", "createdAt", "timestamp with time zone", "NO", null],
  ["DocumentPermission", "documentId", "character varying", "NO", 255],
  ["DocumentPermission", "grantedBy", "character varying", "NO", 255],
  ["DocumentPermission", "id", "integer", "NO", null],
  ["DocumentPermission", "permission", "character varying", "NO", 20],
  ["DocumentPermission", "updatedAt", "timestamp with time zone", "NO", null],
  ["DocumentPermission", "userAddress", "character varying", "NO", 255],
  ["DocumentProtection", "createdAt", "timestamp with time zone", "NO", null],
  ["DocumentProtection", "documentId", "character varying", "NO", 255],
  ["DocumentProtection", "ownerAddress", "character varying", "YES", 255],
  ["DocumentProtection", "protected", "boolean", "NO", null],
  ["DocumentProtection", "updatedAt", "timestamp with time zone", "NO", null],
  [
    "OperationUserPermission",
    "createdAt",
    "timestamp with time zone",
    "NO",
    null,
  ],
  ["OperationUserPermission", "documentId", "character varying", "NO", 255],
  ["OperationUserPermission", "grantedBy", "character varying", "NO", 255],
  ["OperationUserPermission", "id", "integer", "NO", null],
  ["OperationUserPermission", "operationType", "character varying", "NO", 255],
  ["OperationUserPermission", "userAddress", "character varying", "NO", 255],
].map(
  ([
    table_name,
    column_name,
    data_type,
    is_nullable,
    character_maximum_length,
  ]) => ({
    table_name: table_name as string,
    column_name: column_name as string,
    data_type: data_type as string,
    is_nullable: is_nullable as string,
    character_maximum_length: character_maximum_length as number | null,
  }),
);

const EXPECTED_CONSTRAINTS: ConstraintRow[] = [
  {
    table_name: "DocumentPermission",
    name: "DocumentPermission_documentId_userAddress_key",
    kind: "u",
  },
  {
    table_name: "DocumentPermission",
    name: "DocumentPermission_permission_check",
    kind: "c",
  },
  {
    table_name: "DocumentPermission",
    name: "DocumentPermission_pkey",
    kind: "p",
  },
  {
    table_name: "DocumentProtection",
    name: "DocumentProtection_pkey",
    kind: "p",
  },
  {
    table_name: "OperationUserPermission",
    name: "OperationUserPermission_documentId_operationType_userAddres_key",
    kind: "u",
  },
  {
    table_name: "OperationUserPermission",
    name: "OperationUserPermission_pkey",
    kind: "p",
  },
];

const EXPECTED_INDEXES: IndexRow[] = [
  {
    tablename: "DocumentPermission",
    indexname: "DocumentPermission_documentId_userAddress_key",
  },
  { tablename: "DocumentPermission", indexname: "DocumentPermission_pkey" },
  {
    tablename: "DocumentPermission",
    indexname: "documentpermission_documentid_index",
  },
  {
    tablename: "DocumentPermission",
    indexname: "documentpermission_useraddress_index",
  },
  { tablename: "DocumentProtection", indexname: "DocumentProtection_pkey" },
  {
    tablename: "DocumentProtection",
    indexname: "documentprotection_owneraddress_index",
  },
  {
    tablename: "DocumentProtection",
    indexname: "documentprotection_protected_index",
  },
  {
    tablename: "OperationUserPermission",
    indexname:
      "OperationUserPermission_documentId_operationType_userAddres_key",
  },
  {
    tablename: "OperationUserPermission",
    indexname: "OperationUserPermission_pkey",
  },
  {
    tablename: "OperationUserPermission",
    indexname: "operationuserpermission_documentid_index",
  },
  {
    tablename: "OperationUserPermission",
    indexname: "operationuserpermission_useraddress_index",
  },
];

const TABLES = [
  "DocumentPermission",
  "DocumentProtection",
  "OperationUserPermission",
];

/**
 * The migration's cases against one backend. Runs in a schema other than the
 * reactor's default, so every statement is proven to follow the schema the
 * migrator bound.
 */
export function definePermissionTablesMigrationCases(
  backend: string,
  open: () => Promise<MigrationTestDatabase>,
): void {
  describe(`migration 029 permission tables [${backend}]`, () => {
    const schema = "permission_tables_test";
    let database: MigrationTestDatabase | undefined;
    let db: Kysely<any>;

    const migrate = async () => {
      const result = await runMigrations(database!.base, schema);
      if (!result.success) {
        throw result.error ?? new Error("migration failed");
      }
      return result;
    };

    const columns = async (): Promise<ColumnRow[]> => {
      const result = await sql<ColumnRow>`
        select table_name, column_name, data_type, is_nullable,
          character_maximum_length, column_default is not null as has_default
        from information_schema.columns
        where table_schema = ${schema}
          and table_name in (${sql.join(TABLES)})
        order by table_name, column_name
      `.execute(database!.base);
      return result.rows;
    };

    const constraints = async (): Promise<ConstraintRow[]> => {
      const result = await sql<ConstraintRow>`
        select rel.relname as table_name, con.conname as name,
          con.contype::text as kind
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        where ns.nspname = ${schema}
          and rel.relname in (${sql.join(TABLES)})
        order by rel.relname, con.conname
      `.execute(database!.base);
      return result.rows;
    };

    const indexes = async (): Promise<IndexRow[]> => {
      const result = await sql<IndexRow>`
        select tablename, indexname from pg_indexes
        where schemaname = ${schema}
          and tablename in (${sql.join(TABLES)})
        order by tablename, indexname
      `.execute(database!.base);
      return result.rows;
    };

    beforeEach(async () => {
      const opened = await open();
      database = opened;
      db = opened.base.withSchema(schema);
    });

    afterEach(async () => {
      await database?.destroy();
    });

    it("creates the three tables with the legacy columns, keys and indexes", async () => {
      const result = await migrate();

      expect(result.migrationsExecuted).toContain(
        "029_create_permission_tables",
      );
      const found = await columns();
      expect(
        found.map(({ has_default: _hasDefault, ...column }) => ({
          ...column,
          character_maximum_length:
            column.character_maximum_length === null
              ? null
              : Number(column.character_maximum_length),
        })),
      ).toEqual(EXPECTED_COLUMNS);
      expect(
        found
          .filter((column) => column.has_default)
          .map((column) => `${column.table_name}.${column.column_name}`),
      ).toEqual([
        "DocumentPermission.createdAt",
        "DocumentPermission.id",
        "DocumentPermission.updatedAt",
        "DocumentProtection.createdAt",
        "DocumentProtection.protected",
        "DocumentProtection.updatedAt",
        "OperationUserPermission.createdAt",
        "OperationUserPermission.id",
      ]);
      expect(await constraints()).toEqual(EXPECTED_CONSTRAINTS);
      expect(await indexes()).toEqual(EXPECTED_INDEXES);
    });

    it("enforces the unique grant and the permission level check", async () => {
      await migrate();
      const grant = {
        documentId: "doc-1",
        userAddress: "0xabc",
        permission: "READ",
        grantedBy: "0xowner",
      };
      await db.insertInto("DocumentPermission").values(grant).execute();

      await expect(
        db.insertInto("DocumentPermission").values(grant).execute(),
      ).rejects.toThrow();
      await expect(
        db
          .insertInto("DocumentPermission")
          .values({ ...grant, userAddress: "0xdef", permission: "OWNER" })
          .execute(),
      ).rejects.toThrow();
    });

    it("round-trips timestamps as the same instant", async () => {
      await migrate();
      const instant = new Date("2026-10-25T10:00:00.000Z");
      await db
        .insertInto("DocumentProtection")
        .values({
          documentId: "doc-1",
          protected: true,
          ownerAddress: "0xowner",
          createdAt: instant,
          updatedAt: instant,
        })
        .execute();

      const row = await db
        .selectFrom("DocumentProtection")
        .select(["createdAt", "updatedAt"])
        .executeTakeFirstOrThrow();

      expect((row.createdAt as Date).toISOString()).toBe(instant.toISOString());
      expect((row.updatedAt as Date).toISOString()).toBe(instant.toISOString());
    });

    it("leaves tables and rows unchanged when run a second time", async () => {
      await migrate();
      await db
        .insertInto("OperationUserPermission")
        .values({
          documentId: "doc-1",
          operationType: "SET_NAME",
          userAddress: "0xabc",
          grantedBy: "0xowner",
        })
        .execute();

      await migration029.up(db);

      expect(await indexes()).toEqual(EXPECTED_INDEXES);
      const rows = await db
        .selectFrom("OperationUserPermission")
        .select(["documentId", "operationType", "userAddress"])
        .execute();
      expect(rows).toEqual([
        {
          documentId: "doc-1",
          operationType: "SET_NAME",
          userAddress: "0xabc",
        },
      ]);
    });

    it("drops the tables on down", async () => {
      await migrate();

      await migration029.down(db);

      expect(await columns()).toEqual([]);
    });
  });
}
