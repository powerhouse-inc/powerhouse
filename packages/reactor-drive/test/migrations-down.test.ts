import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely, Migrator, PostgresDialect, sql, type Migration } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getReactorDriveMigrationStatus,
  runReactorDriveMigrations,
} from "../src/schema/migrations/migrator.js";

const SCHEMA = "reactor";
const LAST_IN_6_2_3 = "0002_document_name";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

type Backend = { db: Kysely<unknown>; close: () => Promise<void> };

let databaseCount = 0;

function pgliteBackend(): Promise<Backend> {
  const db = new Kysely<unknown>({
    dialect: new PGliteDialect(new PGlite({ fs: new MemoryFS() })),
  });
  return Promise.resolve({ db, close: () => db.destroy() });
}

async function postgresBackend(): Promise<Backend> {
  const name = `reactor_drive_down_${process.pid}_${databaseCount++}`;
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    async close() {
      try {
        await db.destroy();
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

async function shape(db: Kysely<unknown>) {
  const columns = await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = ${SCHEMA}
    order by table_name, column_name`.execute(db);
  const indexes = await sql`
    select indexname, indexdef from pg_indexes where schemaname = ${SCHEMA}
    order by indexname`.execute(db);
  const constraints = await sql`
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where connamespace = ${SCHEMA}::regnamespace order by conname`.execute(db);
  return {
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
  };
}

/** The drive migrator 6.2.3 ships: same tables, migrations through 0002. */
function migrator623(db: Kysely<unknown>): Migrator {
  const older: Record<string, Migration> = {
    "0001_drive_node": { up: () => Promise.resolve() },
    "0002_document_name": { up: () => Promise.resolve() },
  };
  return new Migrator({
    db: db.withSchema(SCHEMA),
    provider: { getMigrations: () => Promise.resolve(older) },
    migrationTableSchema: SCHEMA,
    migrationTableName: "kysely_migration_reactor_drive",
    migrationLockTableName: "kysely_migration_reactor_drive_lock",
  });
}

describe.each([
  ["PGlite", pgliteBackend],
  ["Postgres", postgresBackend],
] as const)("runReactorDriveMigrations with a target [%s]", (_, open) => {
  const backends: Backend[] = [];
  let db: Kysely<unknown>;

  async function openDb(): Promise<Kysely<unknown>> {
    const backend = await open();
    backends.push(backend);
    return backend.db;
  }

  beforeEach(async () => {
    db = await openDb();
  });

  afterEach(async () => {
    for (const backend of backends.splice(0)) await backend.close();
  });

  async function executed(): Promise<string[]> {
    return (await getReactorDriveMigrationStatus(db, SCHEMA))
      .filter((migration) => migration.executedAt !== undefined)
      .map((migration) => migration.name);
  }

  it("migrates down to the named migration", async () => {
    expect((await runReactorDriveMigrations(db, SCHEMA)).success).toBe(true);

    const result = await runReactorDriveMigrations(db, SCHEMA, LAST_IN_6_2_3);

    expect(result.success).toBe(true);
    expect(result.migrationsExecuted).toEqual([
      "0005_drive_node_sibling_name_index",
      "0004_drop_drive_node_parent_name",
      "0003_drive_node_listing_indexes",
    ]);
    expect(await executed()).toEqual(["0001_drive_node", "0002_document_name"]);
  });

  it("migrates up only to the named migration", async () => {
    const result = await runReactorDriveMigrations(db, SCHEMA, LAST_IN_6_2_3);

    expect(result.success).toBe(true);
    expect(await executed()).toEqual(["0001_drive_node", "0002_document_name"]);
  });

  it("leaves the schema a store migrated up to the target has", async () => {
    expect((await runReactorDriveMigrations(db, SCHEMA)).success).toBe(true);
    expect(
      (await runReactorDriveMigrations(db, SCHEMA, LAST_IN_6_2_3)).success,
    ).toBe(true);

    const fresh = await openDb();
    expect(
      (await runReactorDriveMigrations(fresh, SCHEMA, LAST_IN_6_2_3)).success,
    ).toBe(true);

    expect(await shape(db)).toEqual(await shape(fresh));
  });

  it("lets the 6.2.3 drive migrator start only once migrated down", async () => {
    expect((await runReactorDriveMigrations(db, SCHEMA)).success).toBe(true);
    const before = await migrator623(db).migrateToLatest();
    expect((before.error as Error).message).toBe(
      "corrupted migrations: previously executed migration 0003_drive_node_listing_indexes is missing",
    );

    expect(
      (await runReactorDriveMigrations(db, SCHEMA, LAST_IN_6_2_3)).success,
    ).toBe(true);

    const after = await migrator623(db).migrateToLatest();
    expect(after.error).toBeUndefined();
  });
});
