import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database } from "../../src/core/types.js";
import {
  checkMigrationFloor,
  compareReleases,
  MIGRATION_FLOOR,
  MigrationFloorError,
  PLATFORM_RELEASE,
  readMigrationState,
  recordMigrationRelease,
} from "../../src/storage/migration-floor.js";
import {
  getMigrationStatus,
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";

/** The last migration of a build that keeps no migration release. */
const BEFORE_RECORD = "031_index_created_model_protocol_versions";
const RECORD_MIGRATION = "032_create_migration_release";

describe("compareReleases", () => {
  it("orders a release after each of its dev pre-releases", () => {
    const ascending = [
      "6.2.3-dev.106",
      "6.2.3",
      "6.3.0-dev.5",
      "6.3.0-dev.10",
      "6.3.0-rc.1",
      "6.3.0",
      "6.3.1",
      "6.4.0-dev.1",
      "6.10.0",
    ];
    for (let i = 0; i < ascending.length; i++) {
      for (let j = 0; j < ascending.length; j++) {
        expect(
          Math.sign(compareReleases(ascending[i], ascending[j])),
          `${ascending[i]} against ${ascending[j]}`,
        ).toBe(Math.sign(i - j));
      }
    }
  });

  it("orders pre-release identifiers by semver precedence", () => {
    expect(compareReleases("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(compareReleases("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBeLessThan(
      0,
    );
    expect(compareReleases("1.0.0-2", "1.0.0-11")).toBeLessThan(0);
    expect(compareReleases("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
    expect(compareReleases("v1.2.3", "1.2.3")).toBe(0);
  });

  it("orders a string that is not a version before every version", () => {
    expect(compareReleases("unknown", "0.0.0")).toBeLessThan(0);
    expect(compareReleases("0.0.0", "unknown")).toBeGreaterThan(0);
    expect(compareReleases("unknown", "")).toBe(0);
  });
});

describe("the migration floor", () => {
  let db: Kysely<any>;

  beforeEach(() => {
    db = new Kysely<any>({ dialect: new PGliteDialect(new PGlite()) });
  });

  afterEach(async () => {
    await db.destroy();
  });

  /** A store with operations that a build before the record migrated. */
  async function storeWithoutRecord(): Promise<void> {
    const result = await runMigrations(db, REACTOR_SCHEMA, BEFORE_RECORD);
    expect(result.error).toBeUndefined();
    await db
      .withSchema(REACTOR_SCHEMA)
      .insertInto("Operation")
      .values({
        jobId: "job-1",
        opId: "op-1",
        prevOpId: "",
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        timestampUtcMs: "2026-01-01T00:00:00.000Z",
        index: 0,
        skip: 0,
        hash: "h",
        action: sql`${JSON.stringify({ id: "act-1", type: "SET_NAME" })}::jsonb`,
      })
      .execute();
  }

  /** A store with operations whose record says `release`. */
  async function storeRecordedAt(release: string): Promise<void> {
    await storeWithoutRecord();
    expect((await runMigrations(db, REACTOR_SCHEMA)).error).toBeUndefined();
    expect(await recordMigrationRelease(db, REACTOR_SCHEMA, release)).toBe(
      true,
    );
  }

  async function recordMigrationApplied(): Promise<boolean> {
    const migrations = await getMigrationStatus(db, REACTOR_SCHEMA);
    return migrations.some(
      (migration) =>
        migration.name === RECORD_MIGRATION &&
        migration.executedAt !== undefined,
    );
  }

  it("admits every store while the floor is zero", () => {
    expect(MIGRATION_FLOOR).toBe("0.0.0");
  });

  it("records a fresh store at the running release", async () => {
    expect(await readMigrationState(db, REACTOR_SCHEMA)).toEqual({
      empty: true,
    });

    const before = new Date().toISOString();
    expect((await runMigrations(db, REACTOR_SCHEMA)).error).toBeUndefined();

    const state = await readMigrationState(db, REACTOR_SCHEMA);
    expect(state.empty).toBe(true);
    expect(state.release).toBe(PLATFORM_RELEASE);
    expect((state.completedAtUtcIso ?? "") >= before).toBe(true);
  });

  it("records a fresh store a reactor is built on", async () => {
    const reactor = await new ReactorBuilder()
      .withKysely(db as Kysely<Database>)
      .build();
    try {
      const state = await readMigrationState(db, REACTOR_SCHEMA);
      expect(state.release).toBe(PLATFORM_RELEASE);
    } finally {
      await reactor.kill().completed;
    }
  });

  it("boots a store without a record under floor zero, recorded once its one-shot migrations completed", async () => {
    await storeWithoutRecord();

    const migrated = await runMigrations(db, REACTOR_SCHEMA);
    expect(migrated.error).toBeUndefined();
    expect(await readMigrationState(db, REACTOR_SCHEMA)).toEqual({
      empty: false,
      release: undefined,
      completedAtUtcIso: undefined,
    });

    const reactor = await new ReactorBuilder()
      .withKysely(db as Kysely<Database>)
      .build();
    try {
      const state = await readMigrationState(db, REACTOR_SCHEMA);
      expect(state.release).toBe(PLATFORM_RELEASE);
    } finally {
      await reactor.kill().completed;
    }
  });

  it("leaves the record to a host that runs one-shot migrations of its own", async () => {
    await storeWithoutRecord();

    const reactor = await new ReactorBuilder()
      .withKysely(db as Kysely<Database>)
      .withHostMigrations()
      .build();
    try {
      const built = await readMigrationState(db, REACTOR_SCHEMA);
      expect(built.release).toBeUndefined();

      await recordMigrationRelease(db, REACTOR_SCHEMA);
      const recorded = await readMigrationState(db, REACTOR_SCHEMA);
      expect(recorded.release).toBe(PLATFORM_RELEASE);
    } finally {
      await reactor.kill().completed;
    }
  });

  it("raises the record and never lowers it", async () => {
    await storeRecordedAt("6.3.0-dev.5");

    await recordMigrationRelease(db, REACTOR_SCHEMA, "6.3.0");
    expect((await readMigrationState(db, REACTOR_SCHEMA)).release).toBe(
      "6.3.0",
    );

    const raisedAt = (await readMigrationState(db, REACTOR_SCHEMA))
      .completedAtUtcIso;
    await recordMigrationRelease(db, REACTOR_SCHEMA, "6.2.3");
    await recordMigrationRelease(db, REACTOR_SCHEMA, "6.3.0-dev.9");
    expect(await readMigrationState(db, REACTOR_SCHEMA)).toEqual({
      empty: false,
      release: "6.3.0",
      completedAtUtcIso: raisedAt,
    });
  });

  it("boots a store a newer release recorded, and keeps that record", async () => {
    await storeRecordedAt("99.0.0");

    const state = await checkMigrationFloor(db, REACTOR_SCHEMA, "6.3.0");
    expect(state.release).toBe("99.0.0");

    const reactor = await new ReactorBuilder()
      .withKysely(db as Kysely<Database>)
      .build();
    try {
      expect((await readMigrationState(db, REACTOR_SCHEMA)).release).toBe(
        "99.0.0",
      );
    } finally {
      await reactor.kill().completed;
    }
  });

  it("ends at the highest release when several reactors record at once", async () => {
    await storeWithoutRecord();
    expect((await runMigrations(db, REACTOR_SCHEMA)).error).toBeUndefined();

    const releases = ["6.3.0", "6.3.0-dev.7", "6.4.0-dev.1", "6.3.1", "6.3.0"];
    await Promise.all(
      releases.map((release) =>
        recordMigrationRelease(db, REACTOR_SCHEMA, release),
      ),
    );

    expect((await readMigrationState(db, REACTOR_SCHEMA)).release).toBe(
      "6.4.0-dev.1",
    );
    const rows = await db
      .withSchema(REACTOR_SCHEMA)
      .selectFrom("MigrationRelease")
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
  });

  it("refuses a store without a record under a raised floor, before changing it", async () => {
    await storeWithoutRecord();

    const result = await runMigrations(db, REACTOR_SCHEMA, undefined, "6.3.0");

    expect(result.success).toBe(false);
    expect(result.migrationsExecuted).toEqual([]);
    expect(result.error).toBeInstanceOf(MigrationFloorError);
    expect(result.error?.message).toBe(
      `This store is below the migration floor of release ${PLATFORM_RELEASE}: ` +
        "its one-shot migrations were last completed by no recorded release, " +
        `and release ${PLATFORM_RELEASE} needs 6.3.0 or later. ` +
        "Run release 6.3.0 on this store first, then start this release again.",
    );
    expect(await recordMigrationApplied()).toBe(false);
  });

  it("refuses a store recorded below a raised floor, naming its release", async () => {
    await storeRecordedAt("6.3.0-dev.5");

    await expect(
      checkMigrationFloor(db, REACTOR_SCHEMA, "6.3.0", "6.4.0"),
    ).rejects.toThrow(
      "This store is below the migration floor of release 6.4.0: " +
        "its one-shot migrations were last completed by release 6.3.0-dev.5, " +
        "and release 6.4.0 needs 6.3.0 or later. " +
        "Run release 6.3.0 on this store first, then start this release again.",
    );
    const refused = await runMigrations(db, REACTOR_SCHEMA, undefined, "6.3.0");
    expect(refused.error).toBeInstanceOf(MigrationFloorError);
    expect((await readMigrationState(db, REACTOR_SCHEMA)).release).toBe(
      "6.3.0-dev.5",
    );
  });

  it("admits a store recorded at the floor or above it", async () => {
    await storeRecordedAt("6.3.0");

    const atFloor = await runMigrations(db, REACTOR_SCHEMA, undefined, "6.3.0");
    expect(atFloor.error).toBeUndefined();
    await recordMigrationRelease(db, REACTOR_SCHEMA, "6.3.2");
    const above = await checkMigrationFloor(db, REACTOR_SCHEMA, "6.3.0");
    expect(above.release).toBe("6.3.2");
  });

  it("admits a store without operations under a raised floor and records it", async () => {
    const older = await runMigrations(db, REACTOR_SCHEMA, BEFORE_RECORD);
    expect(older.error).toBeUndefined();

    const result = await runMigrations(db, REACTOR_SCHEMA, undefined, "6.3.0");

    expect(result.error).toBeUndefined();
    expect((await readMigrationState(db, REACTOR_SCHEMA)).release).toBe(
      PLATFORM_RELEASE,
    );
  });

  it("writes nothing while the store has no record table", async () => {
    await storeWithoutRecord();

    expect(await recordMigrationRelease(db, REACTOR_SCHEMA)).toBe(false);
    expect(await recordMigrationApplied()).toBe(false);
  });
});
