import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  DocumentPurgeService,
  JobStatus,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  runMigrations,
  type IOperationIndex,
  type InProcessReactorModule,
  type IWriteCache,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorDriveClient } from "../src/client/reactor-drive-client.js";
import { reactorDriveDocumentModelModule } from "../src/module.js";
import {
  NodeProcessor,
  type NodeProcessorDatabase,
} from "../src/processors/node-processor.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";

describe("NodeProcessor purge", () => {
  let pg: PGlite;
  let baseDb: Kysely<unknown>;
  let schemaDb: Kysely<NodeProcessorDatabase>;
  let reactorModule: InProcessReactorModule;
  let driveClient: ReactorDriveClient;
  let operationIndex: IOperationIndex;
  let writeCache: IWriteCache;
  let kill: () => void;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
    const migrated = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!migrated.success && migrated.error) throw migrated.error;
    schemaDb = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as Kysely<NodeProcessorDatabase>;

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModelSources([
        reactorDriveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withReadModelFactory(async (deps) => {
        operationIndex = deps.operationIndex;
        writeCache = deps.writeCache;
        const processor = new NodeProcessor(
          baseDb,
          REACTOR_SCHEMA,
          deps.operationIndex,
          deps.writeCache,
          new ConsistencyTracker(),
        );
        await processor.init();
        return processor;
      })
      .withKysely(baseDb as never)
      .withMigrationStrategy("manual");

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
    reactorModule = built.reactorModule!;
    kill = () => built.reactor.kill();
    driveClient = new ReactorDriveClient({
      reactor: built.client,
      readModel: new DriveNodeView(
        schemaDb as unknown as Kysely<ReactorDriveDatabase>,
      ),
    });
  });

  afterEach(async () => {
    kill();
    await baseDb.destroy();
    await pg.close();
  });

  function childDocument(name: string): PHDocument {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.name = name;
    return document;
  }

  async function nodeRows(): Promise<
    Array<{ driveId: string; id: string; kind: string }>
  > {
    return schemaDb
      .selectFrom("DriveNode")
      .select(["driveId", "id", "kind"])
      .orderBy("id")
      .execute();
  }

  async function deleteWithoutUnlinking(id: string): Promise<void> {
    const job = await reactorModule.reactor.deleteDocument(id);
    await vi.waitUntil(async () => {
      const info = await reactorModule.reactor.getJobStatus(job.id);
      if (info.status === JobStatus.FAILED)
        throw new Error(info.error?.message);
      return info.status === JobStatus.READ_READY;
    });
    await reactorModule.readModelCoordinator.drain();
  }

  it("leaves no node or name row for a purged drive, folders included", async () => {
    const drive = await driveClient.create({ global: { name: "Drive" } });
    const driveId = drive.header.id;
    const folder = await driveClient.addFolder(driveId, "Folder");
    const file = childDocument("File");
    await driveClient.addFile(driveId, file, folder.id);
    await reactorModule.readModelCoordinator.drain();

    await deleteWithoutUnlinking(file.header.id);
    await deleteWithoutUnlinking(driveId);
    // DELETE_DOCUMENT matches node ids only, so the drive's folder row stays.
    expect((await nodeRows()).map((row) => row.id)).toEqual([folder.id]);
    const names = await schemaDb
      .selectFrom("DocumentName")
      .select("docId")
      .where("docId", "in", [driveId, file.header.id])
      .execute();
    expect(names).toEqual([]);

    const result = await new DocumentPurgeService(reactorModule).purgeDocuments(
      [driveId, file.header.id],
      { directiveId: "drive" },
    );

    expect(await nodeRows()).toEqual([]);
    expect(
      result.readModels.find(
        (outcome) => outcome.readModelId === "reactor-drive-node-processor",
      ),
    ).toEqual({
      readModelId: "reactor-drive-node-processor",
      rowsAffected: 1,
      covered: true,
    });
  });

  it("purges a child's rows, and a fresh processor replaying the drive ends without them", async () => {
    const drive = await driveClient.create({ global: { name: "Drive" } });
    const driveId = drive.header.id;
    const kept = childDocument("Kept");
    const purged = childDocument("Purged");
    await driveClient.addFile(driveId, kept);
    await driveClient.addFile(driveId, purged);
    await reactorModule.readModelCoordinator.drain();

    await deleteWithoutUnlinking(purged.header.id);
    await new DocumentPurgeService(reactorModule).purgeDocuments(
      [purged.header.id],
      { directiveId: "child" },
    );
    expect((await nodeRows()).map((row) => row.id)).toEqual([kept.header.id]);

    // A fresh model: no cursor, no rows. The drive's own log still adds the child.
    await schemaDb
      .deleteFrom("ViewState")
      .where("readModelId", "=", "reactor-drive-node-processor")
      .execute();
    await schemaDb.deleteFrom("DriveNode").execute();
    await schemaDb.deleteFrom("DocumentName").execute();

    const fresh = new NodeProcessor(
      baseDb,
      REACTOR_SCHEMA,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
    );
    await fresh.init();

    expect((await nodeRows()).map((row) => row.id)).toEqual([kept.header.id]);
    const cursor = await schemaDb
      .selectFrom("ViewState")
      .select(sql<number>`"lastPurgeOrdinal"::int`.as("purge"))
      .where("readModelId", "=", "reactor-drive-node-processor")
      .executeTakeFirstOrThrow();
    expect(cursor.purge).toBeGreaterThan(0);
  });
});
