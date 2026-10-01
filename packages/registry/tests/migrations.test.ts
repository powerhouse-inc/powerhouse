import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createPGliteDatabase,
  createPostgresDatabase,
  type Database,
} from "../src/db/database.js";
import {
  checkSchema,
  migrate,
  migrateOnBoot,
  pendingMigrations,
} from "../src/db/migrations.js";
import { createRuntime } from "../src/run.js";

const PG_URL = process.env.REGISTRY_TEST_PG_URL;

describe("migrateOnBoot", () => {
  const saved = process.env.PH_REGISTRY_MIGRATE_ON_BOOT;
  afterEach(() => {
    if (saved === undefined) delete process.env.PH_REGISTRY_MIGRATE_ON_BOOT;
    else process.env.PH_REGISTRY_MIGRATE_ON_BOOT = saved;
  });

  it("migrates PGlite at boot and leaves Postgres to `migrate`", () => {
    delete process.env.PH_REGISTRY_MIGRATE_ON_BOOT;
    expect(migrateOnBoot(undefined, undefined)).toBe(true);
    expect(migrateOnBoot(undefined, "postgres://x/y")).toBe(false);
  });

  it("takes the env, then the flag, over the default", () => {
    process.env.PH_REGISTRY_MIGRATE_ON_BOOT = "true";
    expect(migrateOnBoot(undefined, "postgres://x/y")).toBe(true);
    expect(migrateOnBoot(false, "postgres://x/y")).toBe(false);
    process.env.PH_REGISTRY_MIGRATE_ON_BOOT = "false";
    expect(migrateOnBoot(undefined, undefined)).toBe(false);
  });
});

describe("migrations (pglite)", () => {
  let db: Database;
  afterEach(async () => {
    await db.close();
  });

  it("refuses a database that is behind, then passes once migrated", async () => {
    db = await createPGliteDatabase();
    await expect(checkSchema(db)).rejects.toThrow(/ph-registry migrate/);
    await migrate(db);
    await migrate(db);
    await checkSchema(db);
    expect(await pendingMigrations(db)).toEqual([]);
  });

  it("builds the online migration's indexes", async () => {
    db = await createPGliteDatabase();
    await migrate(db);
    const indexes = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = 'registry_pieces_latest'",
    );
    expect(indexes.rows).toHaveLength(1);
  });
});

// Its own database, so it can't disturb other files sharing the server
describe.skipIf(!PG_URL)("migrations (postgres)", () => {
  const url = new URL(PG_URL ?? "postgres://localhost/x");
  const name = `${url.pathname.slice(1)}_migrations`;
  const dbUrl = Object.assign(new URL(url), { pathname: `/${name}` }).href;
  const admin = new pg.Client({ connectionString: url.href });
  const open: Database[] = [];
  const connect = () => {
    const db = createPostgresDatabase(dbUrl);
    open.push(db);
    return db;
  };

  beforeAll(async () => {
    await admin.connect();
  });
  afterAll(async () => {
    await admin.end();
  });
  afterEach(async () => {
    await Promise.all(open.splice(0).map((db) => db.close()));
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  });
  const fresh = async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  };

  it("lets several processes migrate at once", async () => {
    await fresh();
    await Promise.all(
      [connect(), connect(), connect()].map((db) => migrate(db)),
    );
    const db = connect();
    await checkSchema(db);
    const invalid = await db.query(
      `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE NOT i.indisvalid`,
    );
    expect(invalid.rows).toEqual([]);
  });

  it("rebuilds an index a failed concurrent build left INVALID", async () => {
    await fresh();
    const db = connect();
    await migrate(db);
    await db.query("DROP INDEX registry_pieces_latest");
    await db.query(
      `INSERT INTO registry_pieces (name, version, package, display_name,
         descriptor_path, bundle_file, is_latest)
       VALUES ('a', '1.0.0', 'p', 'a', 'd', 'b', true),
              ('b', '1.0.0', 'p', 'b', 'd', 'b', true)`,
    );
    // A unique build over duplicates fails and leaves the index INVALID
    await expect(
      db.query(
        "CREATE UNIQUE INDEX CONCURRENTLY registry_pieces_latest ON registry_pieces (package) WHERE is_latest",
      ),
    ).rejects.toThrow();
    await db.query("DELETE FROM registry_migrations WHERE id = 5");

    await migrate(db);
    const index = await db.query<{ valid: boolean; unique: boolean }>(
      `SELECT indisvalid AS valid, indisunique AS unique FROM pg_index
        WHERE indexrelid = 'registry_pieces_latest'::regclass`,
    );
    expect(index.rows).toEqual([{ valid: true, unique: false }]);
  });

  it("won't start a runtime on a schema that is behind", async () => {
    await fresh();
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "registry-mig-"));
    try {
      await expect(
        createRuntime({ databaseUrl: dbUrl, dataDir, migrateOnBoot: false }),
      ).rejects.toThrow(/missing migration\(s\) 1 \(registry state\)/);
      const runtime = await createRuntime({
        databaseUrl: dbUrl,
        dataDir,
        migrateOnBoot: true,
      });
      await runtime.close();
      const again = await createRuntime({
        databaseUrl: dbUrl,
        dataDir,
        migrateOnBoot: false,
      });
      await again.close();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
