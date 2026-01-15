import { PGlite } from "@electric-sql/pglite";
import {
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  type Database,
  type ReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dropAllTables } from "../src/pglite/drop.js";

describe("dropAllTables", () => {
  let pg: PGlite;
  let db: Kysely<any>;
  let module: ReactorClientModule;

  beforeEach(async () => {
    pg = new PGlite();
    db = new Kysely<any>({
      dialect: new PGliteDialect(pg),
    });
  });

  afterEach(async () => {
    module?.reactor?.kill();
    await db.destroy();
  });

  it("should drop all tables after ReactorClient creates them", async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withKysely(db as Kysely<Database>)
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();

    const doc = documentModelDocumentModelModule.utils.createDocument();
    await module.client.create(doc);

    const beforeCount = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM pg_catalog.pg_tables WHERE schemaname = ${REACTOR_SCHEMA}
    `.execute(db);
    expect(Number(beforeCount.rows[0]?.count)).toBeGreaterThan(0);

    await dropAllTables(pg);

    const afterCount = await sql<{ count: number }>`
      SELECT COUNT(*) as count FROM pg_catalog.pg_tables WHERE schemaname = ${REACTOR_SCHEMA}
    `.execute(db);
    expect(Number(afterCount.rows[0]?.count)).toBe(0);
  });

  it("should handle empty database without errors", async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([documentModelDocumentModelModule])
      .withKysely(db as Kysely<Database>)
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();

    await expect(dropAllTables(pg)).resolves.not.toThrow();
  });

  it("should drop multiple tables with data", async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withKysely(db as Kysely<Database>)
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();

    const parent = documentModelDocumentModelModule.utils.createDocument();
    parent.header.id = "parent-doc";
    await module.client.create(parent);

    const child = documentModelDocumentModelModule.utils.createDocument();
    child.header.id = "child-doc";
    await module.client.create(child, "parent-doc");

    const tablesBefore = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = ${REACTOR_SCHEMA}
    `.execute(db);
    expect(tablesBefore.rows.length).toBeGreaterThan(0);
    expect(tablesBefore.rows.map((r) => r.tablename)).toContain("Operation");
    expect(tablesBefore.rows.map((r) => r.tablename)).toContain("Document");

    await dropAllTables(pg);

    const tablesAfter = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = ${REACTOR_SCHEMA}
    `.execute(db);
    expect(tablesAfter.rows.length).toBe(0);
  });
});
