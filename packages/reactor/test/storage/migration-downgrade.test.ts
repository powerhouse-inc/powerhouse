import { PGlite } from "@electric-sql/pglite";
import { Kysely, Migrator, type Migration } from "kysely";
import { PostgresDialect, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMigrationStatus,
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";

/** The last migration a build without peer agreement registers. */
const PRE_FEATURE = "020_add_snapshot_operation_ordinal";

describe("a pre-feature build over a store this build migrated", () => {
  let db: Kysely<any>;

  beforeEach(async () => {
    db = new Kysely<any>({ dialect: new PGliteDialect(new PGlite()) });
    const result = await runMigrations(db, REACTOR_SCHEMA);
    expect(result.success).toBe(true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("fails its migrations, which its builder turns into a refusal to start", async () => {
    const executed = await getMigrationStatus(db, REACTOR_SCHEMA);
    const older: Record<string, Migration> = Object.fromEntries(
      executed
        .filter((migration) => migration.name <= PRE_FEATURE)
        .map((migration) => [migration.name, { up: () => Promise.resolve() }]),
    );

    // The Migrator configuration runMigrations has had since before the feature.
    const { error } = await new Migrator({
      db: db.withSchema(REACTOR_SCHEMA),
      provider: { getMigrations: () => Promise.resolve(older) },
      migrationTableSchema: REACTOR_SCHEMA,
    }).migrateToLatest();

    expect((error as Error).message).toBe(
      "corrupted migrations: previously executed migration 021_add_sync_remote_peer is missing",
    );
  });
});

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

type Backend = { db: Kysely<any>; close: () => Promise<void> };

let databaseCount = 0;

function pgliteBackend(): Promise<Backend> {
  const db = new Kysely<any>({ dialect: new PGliteDialect(new PGlite()) });
  return Promise.resolve({ db, close: () => db.destroy() });
}

async function postgresBackend(): Promise<Backend> {
  const name = `reactor_downgrade_${process.pid}_${databaseCount++}`;
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
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

async function shape(db: Kysely<any>) {
  const columns = await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = ${REACTOR_SCHEMA}
    order by table_name, column_name`.execute(db);
  const indexes = await sql`
    select indexname, indexdef from pg_indexes
    where schemaname = ${REACTOR_SCHEMA} order by indexname`.execute(db);
  const constraints = await sql`
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where connamespace = ${REACTOR_SCHEMA}::regnamespace
    order by conname`.execute(db);
  return {
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
  };
}

/** The Migrator of a build whose last migration is `last`. */
async function olderMigrator(db: Kysely<any>, last: string) {
  const older: Record<string, Migration> = Object.fromEntries(
    (await getMigrationStatus(db, REACTOR_SCHEMA))
      .filter((migration) => migration.name <= last)
      .map((migration) => [migration.name, { up: () => Promise.resolve() }]),
  );
  return new Migrator({
    db: db.withSchema(REACTOR_SCHEMA),
    provider: { getMigrations: () => Promise.resolve(older) },
    migrationTableSchema: REACTOR_SCHEMA,
  });
}

describe.each([
  ["PGlite", pgliteBackend],
  ["Postgres", postgresBackend],
] as const)("rolling a store back for an older build [%s]", (_, open) => {
  const backends: Backend[] = [];

  async function openDb(): Promise<Kysely<any>> {
    const backend = await open();
    backends.push(backend);
    return backend.db;
  }

  afterEach(async () => {
    for (const backend of backends.splice(0)) await backend.close();
  });

  it.each([
    [
      "the build before undo v3",
      "029_create_permission_tables",
      "030_index_operation_retracts",
    ],
    [
      "6.2.3",
      "023_index_created_protocol_versions",
      "024_create_document_purges",
    ],
  ])(
    "migrates down to %s's last migration, which that build starts over",
    async (_build, last, firstNewer) => {
      const db = await openDb();
      expect((await runMigrations(db, REACTOR_SCHEMA)).success).toBe(true);
      const refused = await (await olderMigrator(db, last)).migrateToLatest();
      expect((refused.error as Error).message).toBe(
        `corrupted migrations: previously executed migration ${firstNewer} is missing`,
      );

      const down = await runMigrations(db, REACTOR_SCHEMA, last);
      expect(down.error).toBeUndefined();
      expect(down.migrationsExecuted.at(-1)).toBe(firstNewer);
      const executed = (await getMigrationStatus(db, REACTOR_SCHEMA)).filter(
        (migration) => migration.executedAt !== undefined,
      );
      expect(executed.at(-1)?.name).toBe(last);

      const fresh = await openDb();
      expect((await runMigrations(fresh, REACTOR_SCHEMA, last)).success).toBe(
        true,
      );
      expect(await shape(db)).toEqual(await shape(fresh));

      const { error } = await (await olderMigrator(db, last)).migrateToLatest();
      expect(error).toBeUndefined();
    },
  );
});
