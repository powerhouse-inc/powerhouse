import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  DriveReadClient,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  runMigrations,
  type IOperationIndex,
  type IReactorClient,
  type IWriteCache,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  isFileNode,
  type Node,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorDriveClient } from "../src/client/reactor-drive-client.js";
import { createReactorDriveWriteStrategy } from "../src/client/reactor-drive-write-strategy.js";
import { REACTOR_DRIVE_DOCUMENT_TYPE } from "../src/constants.js";
import { reactorDriveDocumentModelModule } from "../src/module.js";
import {
  NodeProcessor,
  type NodeProcessorDatabase,
} from "../src/processors/node-processor.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { createP256Signer } from "./utils/p256-signer.js";

/** A node with its ids replaced by names, so two drives compare. */
type ComparableNode = {
  kind: string;
  name: string;
  parent: string | null;
  documentType: string | null;
};

function comparable(nodes: Node[]): ComparableNode[] {
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  return nodes
    .map((n) => ({
      kind: n.kind,
      name: n.name,
      parent: n.parentFolder ? (nameById.get(n.parentFolder) ?? "?") : null,
      documentType: isFileNode(n) ? n.documentType : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe("write.drives: one node sequence on both drive types", () => {
  let pg: PGlite;
  let baseDb: Kysely<unknown>;
  let client: IReactorClient;
  let kill: () => void;
  let nodeView: DriveNodeView;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Reactor migration failed: ${result.error.message}`);
    }
    const schemaDb = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as Kysely<NodeProcessorDatabase>;

    const operationIndex = {
      getSinceOrdinal: vi.fn().mockResolvedValue({ results: [] }),
    } as unknown as IOperationIndex;
    const writeCache = {
      getState: vi.fn(),
      putState: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as IWriteCache;
    const nodeProcessor = new NodeProcessor(
      baseDb,
      REACTOR_SCHEMA,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
    );
    await nodeProcessor.init();

    nodeView = new DriveNodeView(
      schemaDb as unknown as Kysely<ReactorDriveDatabase>,
    );
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModelSources([
        reactorDriveDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withReadModel(nodeProcessor)
      .withKysely(baseDb as never)
      .withMigrationStrategy("manual");

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(await createP256Signer())
      .withDriveNodeSource(nodeView)
      .withDriveWriteStrategy(
        REACTOR_DRIVE_DOCUMENT_TYPE,
        createReactorDriveWriteStrategy,
      )
      .buildModule();
    client = built.client;
    kill = () => built.reactor.kill();
  });

  afterEach(async () => {
    kill();
    await baseDb.destroy();
    await pg.close();
  });

  function makeDocument(name: string): PHDocument {
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = name;
    return doc;
  }

  /** The sequence, through `write.drives` only, each step awaited readable. */
  async function runSequence(driveId: string): Promise<void> {
    const drives = client.write.drives;
    const fileA = makeDocument("File A");
    await (
      await drives.addFile(driveId, fileA)
    ).readable;
    const folder = await drives.addFolder(driveId, "Folder");
    await folder.readable;
    const fileB = makeDocument("File B");
    await (
      await drives.addFile(driveId, fileB, folder.nodeId)
    ).readable;
    await (
      await drives.renameNode(driveId, fileA.header.id, "File A renamed")
    ).readable;
    await (
      await drives.moveNode(driveId, fileA.header.id, folder.nodeId)
    ).readable;
    await (
      await drives.removeNode(driveId, fileB.header.id)
    ).readable;
  }

  it("yields the same nodes on a legacy drive and a reactor-drive", async () => {
    const legacyHandle = await client.write.drives.create({
      global: { name: "Legacy" },
    });
    await legacyHandle.readable;
    const legacyId = legacyHandle.documentId;

    const reactorDrive = await new ReactorDriveClient({
      read: client.read,
      write: client.write,
      readModel: nodeView,
    }).create({ global: { name: "Reactor" } });
    const reactorId = reactorDrive.header.id;

    await runSequence(legacyId);
    await runSequence(reactorId);

    const expected: ComparableNode[] = [
      {
        kind: "file",
        name: "File A renamed",
        parent: "Folder",
        documentType: "powerhouse/document-model",
      },
      {
        kind: "folder",
        name: "Folder",
        parent: null,
        documentType: null,
      },
    ];

    const reactorNodes = await client.read.drives.listNodes(reactorId);
    expect(comparable(reactorNodes.results)).toEqual(expected);

    const fromState = new DriveReadClient(
      client.read,
      new ConsoleLogger(["contract"]),
    );
    const legacyFromState = await fromState.listNodes(legacyId);
    expect(comparable(legacyFromState.results)).toEqual(expected);

    const legacyFromSource = await client.read.drives.listNodes(legacyId);
    expect(comparable(legacyFromSource.results)).toEqual(expected);

    const reactorDriveDoc = await client.read.get(reactorId);
    expect(reactorDriveDoc.header.documentType).toBe(
      REACTOR_DRIVE_DOCUMENT_TYPE,
    );
  });
});
