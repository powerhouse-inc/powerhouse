import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  REACTOR_SCHEMA,
  runMigrations,
  type IOperationIndex,
  type IWriteCache,
} from "@powerhousedao/reactor";
import {
  generateId,
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
import type { BenchRunOptions } from "vitest";
import { addFolderAction } from "../../src/actions.js";
import { NodeProcessor } from "../../src/processors/node-processor.js";
import { DriveNodeView } from "../../src/read-model/drive-node-view.js";
import { runReactorDriveMigrations } from "../../src/schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../../src/schema/tables.js";

/** tinybench 2's defaults, which earlier runs of this file used. */
const RUN_OPTIONS: BenchRunOptions = {
  time: 500,
  iterations: 10,
  warmupTime: 100,
  warmupIterations: 5,
};

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

      const name = "listChildren first page of 50";
      test(name, { timeout: 0 }, async ({ bench }) => {
        await bench(name, async () => {
          await fixture.view.listChildren(fixture.driveId, null, {
            cursor: "",
            limit: 50,
          });
        }).run(RUN_OPTIONS);
      });
    });
  }
});

async function createProcessor(fixture: BenchFixture): Promise<NodeProcessor> {
  const db = fixture.db as unknown as Kysely<unknown>;
  await runMigrations(db, REACTOR_SCHEMA);
  await db.schema
    .createTable("ViewState")
    .ifNotExists()
    .addColumn("readModelId", "text", (col) => col.primaryKey())
    .addColumn("lastOrdinal", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
  const operationIndex = {
    getSinceOrdinal: vi.fn().mockResolvedValue({ results: [] }),
  } as unknown as IOperationIndex;
  const writeCache = {
    invalidate: vi.fn().mockReturnValue(0),
  } as unknown as IWriteCache;
  const processor = new NodeProcessor(
    db,
    "public",
    operationIndex,
    writeCache,
    new ConsistencyTracker(),
  );
  await processor.init();
  return processor;
}

describe("NodeProcessor sibling name resolution at scale", () => {
  const sizes = [50000];
  for (const size of sizes) {
    describe(`drive with ${size} siblings`, () => {
      let fixture: BenchFixture;
      let processor: NodeProcessor;
      let ordinal = 1;

      function addFolder(folderId: string, name: string): OperationWithContext {
        const operation: Operation = {
          id: generateId(),
          index: 0,
          skip: 0,
          timestampUtcMs: new Date().toISOString(),
          hash: "",
          action: addFolderAction({ folderId, parentFolderId: null, name }),
        };
        return {
          operation,
          context: {
            documentId: fixture.driveId,
            documentType: "powerhouse/reactor-drive",
            scope: "document",
            branch: "main",
            ordinal: ordinal++,
          },
        };
      }

      beforeAll(async () => {
        fixture = await setupFixture(size);
        processor = await createProcessor(fixture);
      });

      afterAll(async () => {
        await teardownFixture(fixture);
      });

      const unique = "ADD_FOLDER with a free name";
      test(unique, { timeout: 0 }, async ({ bench }) => {
        await bench(unique, async () => {
          await processor.indexOperations([
            addFolder("bench-unique", "unique-name"),
          ]);
        }).run(RUN_OPTIONS);
      });

      const colliding = "ADD_FOLDER with a taken name";
      test(colliding, { timeout: 0 }, async ({ bench }) => {
        await bench(colliding, async () => {
          await processor.indexOperations([
            addFolder("bench-colliding", "file-0.md"),
          ]);
        }).run(RUN_OPTIONS);
      });
    });
  }
});
