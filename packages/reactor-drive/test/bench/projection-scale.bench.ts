import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterAll, bench, beforeAll, describe } from "vitest";
import { DriveNodeView } from "../../src/read-model/drive-node-view.js";
import { runReactorDriveMigrations } from "../../src/schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../../src/schema/tables.js";

interface BenchFixture {
  pg: PGlite;
  db: Kysely<ReactorDriveDatabase>;
  view: DriveNodeView;
  driveId: string;
}

async function setupFixture(siblings: number): Promise<BenchFixture> {
  const pg = new PGlite({ fs: new MemoryFS() });
  const db = new Kysely<ReactorDriveDatabase>({
    dialect: new PGliteDialect(pg),
  });
  const migrationResult = await runReactorDriveMigrations(
    db as unknown as Kysely<unknown>,
    "public",
  );
  if (!migrationResult.success && migrationResult.error) {
    throw new Error(
      `Reactor drive migrations failed: ${migrationResult.error.message}`,
    );
  }

  const driveId = "drive-bench";
  const rows = Array.from({ length: siblings }, (_, i) => ({
    driveId,
    id: `file-${i}`,
    kind: "file" as const,
    name: `file-${i}.md`,
    requestedName: `file-${i}.md`,
    parentFolder: null,
    documentType: "powerhouse/document-model",
  }));

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    await db
      .insertInto("DriveNode")
      .values(rows.slice(i, i + batchSize))
      .execute();
  }

  return { pg, db, view: new DriveNodeView(db), driveId };
}

async function teardownFixture(fixture: BenchFixture): Promise<void> {
  await fixture.db.destroy();
  await fixture.pg.close();
}

describe("DriveNodeView paged listing scales with page size, not catalogue size", () => {
  const sizes = [100, 1000, 10000];
  for (const size of sizes) {
    describe(`drive with ${size} siblings`, () => {
      let fixture: BenchFixture;

      beforeAll(async () => {
        fixture = await setupFixture(size);
      });

      afterAll(async () => {
        await teardownFixture(fixture);
      });

      bench("listChildren first page of 50", async () => {
        await fixture.view.listChildren(fixture.driveId, null, {
          cursor: "",
          limit: 50,
        });
      });
    });
  }
});
