import { PGlite } from "@electric-sql/pglite";
import { Kysely, Migrator, type Migration } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
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
