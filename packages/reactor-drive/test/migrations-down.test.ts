import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getReactorDriveMigrationStatus,
  runReactorDriveMigrations,
} from "../src/schema/migrations/migrator.js";

const SCHEMA = "reactor";

describe("runReactorDriveMigrations with a target", () => {
  let pg: PGlite;
  let db: Kysely<unknown>;

  beforeEach(() => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function executed(): Promise<string[]> {
    return (await getReactorDriveMigrationStatus(db, SCHEMA))
      .filter((migration) => migration.executedAt !== undefined)
      .map((migration) => migration.name);
  }

  it("migrates down to the named migration", async () => {
    expect((await runReactorDriveMigrations(db, SCHEMA)).success).toBe(true);

    const result = await runReactorDriveMigrations(
      db,
      SCHEMA,
      "0002_document_name",
    );

    expect(result.success).toBe(true);
    expect(result.migrationsExecuted).toEqual([
      "0005_drive_node_sibling_name_index",
      "0004_drop_drive_node_parent_name",
      "0003_drive_node_listing_indexes",
    ]);
    expect(await executed()).toEqual(["0001_drive_node", "0002_document_name"]);
  });

  it("migrates up only to the named migration", async () => {
    const result = await runReactorDriveMigrations(
      db,
      SCHEMA,
      "0002_document_name",
    );

    expect(result.success).toBe(true);
    expect(await executed()).toEqual(["0001_drive_node", "0002_document_name"]);
  });
});
