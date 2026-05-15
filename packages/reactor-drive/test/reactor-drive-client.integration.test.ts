import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  driveCollectionId,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  runMigrations,
  type IOperationIndex,
  type IReactorClient,
  type IWriteCache,
  type ReactorModule,
} from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorDriveClient } from "../src/client/reactor-drive-client.js";
import { migrateLegacyDriveState } from "../src/migration/migrate-legacy-state.js";
import {
  NodeProcessor,
  type NodeProcessorDatabase,
} from "../src/processors/node-processor.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { reactorDriveDocumentModelModule } from "../src/module.js";
import { up as createDocumentNameTable } from "../src/schema/migrations/0002_document_name.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";

describe("ReactorDriveClient Integration", () => {
  let pg: PGlite;
  let baseDb: Kysely<unknown>;
  let schemaDb: Kysely<NodeProcessorDatabase>;
  let driveClient: ReactorDriveClient;
  let reactorClient: IReactorClient;
  let reactorModule: ReactorModule;
  let killReactor: () => void;
  let driveId: string;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) {
      throw new Error(`Reactor migration failed: ${result.error.message}`);
    }
    schemaDb = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as Kysely<NodeProcessorDatabase>;
    await createDriveNodeTable(schemaDb as unknown as Kysely<unknown>);
    await createDocumentNameTable(schemaDb as unknown as Kysely<unknown>);

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
    const tracker = new ConsistencyTracker();

    const nodeProcessor = new NodeProcessor(
      schemaDb,
      operationIndex,
      writeCache,
      tracker,
    );
    await nodeProcessor.init();

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        reactorDriveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule,
      ])
      .withReadModel(nodeProcessor)
      .withKysely(baseDb as never)
      .withMigrationStrategy("manual");

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
    reactorClient = built.client;
    reactorModule = built.reactorModule!;
    killReactor = () => built.reactor.kill();

    driveClient = new ReactorDriveClient({
      reactor: reactorClient,
      readModel: new DriveNodeView(
        schemaDb as unknown as Kysely<ReactorDriveDatabase>,
      ),
    });

    const drive = await driveClient.create({ global: { name: "Test Drive" } });
    driveId = drive.header.id;
  });

  afterEach(async () => {
    killReactor();
    await baseDb.destroy();
    await pg.close();
  });

  function makeChildDocument(name: string): PHDocument {
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = name;
    return doc;
  }

  describe("addFolder", () => {
    it("creates a folder at the drive root", async () => {
      const folder = await driveClient.addFolder(driveId, "Root Folder");
      expect(folder.kind).toBe("folder");
      expect(folder.name).toBe("Root Folder");

      const fetched = await driveClient.getNode(driveId, folder.id);
      expect(fetched.kind).toBe("folder");
      expect(fetched.name).toBe("Root Folder");
      expect(fetched.parentFolder).toBeNull();
    });

    it("creates a folder nested under an existing folder", async () => {
      const parent = await driveClient.addFolder(driveId, "Parent");
      const child = await driveClient.addFolder(driveId, "Child", parent.id);

      expect(child.parentFolder).toBe(parent.id);
      const fetched = await driveClient.getNode(driveId, child.id);
      expect(fetched.parentFolder).toBe(parent.id);
    });

    it("returns the nested folder via listNodes scoped to the parent", async () => {
      const parent = await driveClient.addFolder(driveId, "Parent");
      const child = await driveClient.addFolder(driveId, "Child", parent.id);

      const page = await driveClient.listNodes(driveId, parent.id);
      expect(page.results.map((n) => n.id)).toContain(child.id);
    });
  });

  describe("addFile", () => {
    it("adds a file under a parent folder", async () => {
      const folder = await driveClient.addFolder(driveId, "Inbox");
      const doc = makeChildDocument("File One");
      await driveClient.addFile(driveId, doc, folder.id);

      const fetched = await driveClient.getNode(driveId, doc.header.id);
      expect(fetched.kind).toBe("file");
      expect(fetched.parentFolder).toBe(folder.id);
      expect(fetched.name).toBe("File One");
    });
  });

  describe("renameNode", () => {
    it("renames a folder via UPDATE_FOLDER", async () => {
      const folder = await driveClient.addFolder(driveId, "Old Name");
      const updated = await driveClient.renameNode(
        driveId,
        folder.id,
        "New Name",
      );
      expect(updated.name).toBe("New Name");

      const fetched = await driveClient.getNode(driveId, folder.id);
      expect(fetched.name).toBe("New Name");
    });

    it("renames a file via reactor.rename and updates the projection", async () => {
      const doc = makeChildDocument("Original");
      await driveClient.addFile(driveId, doc);
      const updated = await driveClient.renameNode(
        driveId,
        doc.header.id,
        "Renamed",
      );
      expect(updated.name).toBe("Renamed");

      const fetched = await driveClient.getNode(driveId, doc.header.id);
      expect(fetched.name).toBe("Renamed");
    });
  });

  describe("moveNode", () => {
    it("moves a folder under a different parent folder", async () => {
      const folderA = await driveClient.addFolder(driveId, "A");
      const folderB = await driveClient.addFolder(driveId, "B");
      const movable = await driveClient.addFolder(
        driveId,
        "Movable",
        folderA.id,
      );

      await driveClient.moveNode(driveId, movable.id, folderB.id);

      const fetched = await driveClient.getNode(driveId, movable.id);
      expect(fetched.parentFolder).toBe(folderB.id);
    });

    it("moves a file under a different parent folder", async () => {
      const folderA = await driveClient.addFolder(driveId, "A");
      const folderB = await driveClient.addFolder(driveId, "B");
      const doc = makeChildDocument("Movable File");
      await driveClient.addFile(driveId, doc, folderA.id);

      await driveClient.moveNode(driveId, doc.header.id, folderB.id);

      const fetched = await driveClient.getNode(driveId, doc.header.id);
      expect(fetched.parentFolder).toBe(folderB.id);
    });
  });

  describe("removeNode", () => {
    it("removes a single file and deletes the underlying document", async () => {
      const doc = makeChildDocument("Doomed");
      await driveClient.addFile(driveId, doc);

      await driveClient.removeNode(driveId, doc.header.id);

      await expect(driveClient.getNode(driveId, doc.header.id)).rejects.toThrow(
        /not found/,
      );
      await expect(reactorClient.get(doc.header.id)).rejects.toThrow();
    });

    it("cascades through a folder with file and folder descendants", async () => {
      const root = await driveClient.addFolder(driveId, "Trash");
      const sub = await driveClient.addFolder(driveId, "Sub", root.id);
      const fileA = makeChildDocument("File A");
      const fileB = makeChildDocument("File B");
      await driveClient.addFile(driveId, fileA, root.id);
      await driveClient.addFile(driveId, fileB, sub.id);

      await driveClient.removeNode(driveId, root.id);

      await expect(driveClient.getNode(driveId, root.id)).rejects.toThrow(
        /not found/,
      );
      await expect(driveClient.getNode(driveId, sub.id)).rejects.toThrow(
        /not found/,
      );
      await expect(
        driveClient.getNode(driveId, fileA.header.id),
      ).rejects.toThrow(/not found/);
      await expect(
        driveClient.getNode(driveId, fileB.header.id),
      ).rejects.toThrow(/not found/);
      await expect(reactorClient.get(fileA.header.id)).rejects.toThrow();
      await expect(reactorClient.get(fileB.header.id)).rejects.toThrow();
    });
  });

  describe("collection membership", () => {
    it("tags child documents with the drive's collection", async () => {
      const doc = makeChildDocument("Tagged File");
      await driveClient.addFile(driveId, doc);

      const expectedCollectionId = driveCollectionId("main", driveId);
      const memberships =
        await reactorModule.operationIndex.getCollectionsForDocuments([
          doc.header.id,
        ]);

      expect(memberships[doc.header.id]).toContain(expectedCollectionId);
    });

    it("removes child membership when the file is removed", async () => {
      const doc = makeChildDocument("Transient File");
      await driveClient.addFile(driveId, doc);
      await driveClient.removeNode(driveId, doc.header.id);

      const memberships =
        await reactorModule.operationIndex.getCollectionsForDocuments([
          doc.header.id,
        ]);

      expect(memberships[doc.header.id] ?? []).not.toContain(
        driveCollectionId("main", driveId),
      );
    });
  });

  describe("copyNode", () => {
    it("copies a folder with descendants under a different parent", async () => {
      const source = await driveClient.addFolder(driveId, "Source");
      const child = await driveClient.addFolder(driveId, "Inner", source.id);
      const file = makeChildDocument("Inner File");
      await driveClient.addFile(driveId, file, child.id);
      const target = await driveClient.addFolder(driveId, "Target");

      await driveClient.copyNode(driveId, source.id, target.id);

      const targetChildren = await driveClient.listNodes(driveId, target.id);
      expect(targetChildren.results.length).toBe(1);
      const copiedRoot = targetChildren.results[0];
      expect(copiedRoot.id).not.toBe(source.id);
      expect(copiedRoot.name).toBe("Source");

      const copiedInner = await driveClient.listNodes(driveId, copiedRoot.id);
      expect(copiedInner.results.length).toBe(1);
      const copiedInnerFolder = copiedInner.results[0];
      expect(copiedInnerFolder.id).not.toBe(child.id);
      expect(copiedInnerFolder.name).toBe("Inner");

      const copiedFiles = await driveClient.listNodes(
        driveId,
        copiedInnerFolder.id,
      );
      expect(copiedFiles.results.length).toBe(1);
      expect(copiedFiles.results[0].id).not.toBe(file.header.id);

      const originalStillExists = await driveClient.getNode(driveId, source.id);
      expect(originalStillExists.id).toBe(source.id);
    });

    it("copies a deep folder chain preserving parent linkages at every level", async () => {
      const depth = 6;
      const folders: { id: string; name: string }[] = [];
      let parentId: string | undefined;
      for (let i = 0; i < depth; i++) {
        const name = `L${i}`;
        const folder = await driveClient.addFolder(driveId, name, parentId);
        folders.push({ id: folder.id, name });
        parentId = folder.id;
      }
      const leaf = makeChildDocument("Leaf File");
      await driveClient.addFile(driveId, leaf, folders[depth - 1].id);

      const target = await driveClient.addFolder(driveId, "Target");
      await driveClient.copyNode(driveId, folders[0].id, target.id);

      let currentParent = target.id;
      let walkedDepth = 0;
      for (let i = 0; i < depth; i++) {
        const page = await driveClient.listNodes(driveId, currentParent);
        expect(page.results).toHaveLength(1);
        const node = page.results[0];
        expect(node.kind).toBe("folder");
        expect(node.name).toBe(`L${i}`);
        expect(node.id).not.toBe(folders[i].id);
        expect(node.parentFolder).toBe(currentParent);
        currentParent = node.id;
        walkedDepth += 1;
      }
      expect(walkedDepth).toBe(depth);

      const copiedLeafPage = await driveClient.listNodes(
        driveId,
        currentParent,
      );
      expect(copiedLeafPage.results).toHaveLength(1);
      const copiedLeaf = copiedLeafPage.results[0];
      expect(copiedLeaf.kind).toBe("file");
      expect(copiedLeaf.id).not.toBe(leaf.header.id);
      expect(copiedLeaf.parentFolder).toBe(currentParent);
    });
  });

  describe("migrateLegacyDriveState", () => {
    it("projects documentType and parent linkages through the real reactor", async () => {
      const folderRootId = "legacy-folder-root";
      const folderChildId = "legacy-folder-child";
      const filePinned = makeChildDocument("Pinned File");
      const filePinnedId = filePinned.header.id;
      const fileBareId = "legacy-bare-file";

      await reactorClient.create(filePinned);

      const legacyNodes: Node[] = [
        {
          id: folderRootId,
          kind: "folder",
          name: "Legacy Root",
          parentFolder: null,
        },
        {
          id: folderChildId,
          kind: "folder",
          name: "Legacy Child",
          parentFolder: folderRootId,
        },
        {
          id: filePinnedId,
          kind: "file",
          name: "Pinned File",
          documentType: filePinned.header.documentType,
          parentFolder: folderChildId,
        },
        {
          id: fileBareId,
          kind: "file",
          name: "Bare File",
          documentType: "powerhouse/budget",
          parentFolder: folderRootId,
        },
      ];

      const result = await migrateLegacyDriveState({
        reactor: reactorClient,
        readModel: new DriveNodeView(
          schemaDb as unknown as Kysely<ReactorDriveDatabase>,
        ),
        driveId,
        nodes: legacyNodes,
      });

      expect(result.emittedActions).toBe(legacyNodes.length);
      expect(result.skippedExisting).toBe(0);

      const projectedRoot = await driveClient.getNode(driveId, folderRootId);
      expect(projectedRoot.kind).toBe("folder");
      expect(projectedRoot.parentFolder).toBeNull();

      const projectedChild = await driveClient.getNode(driveId, folderChildId);
      expect(projectedChild.kind).toBe("folder");
      expect(projectedChild.parentFolder).toBe(folderRootId);

      const projectedPinned = await driveClient.getNode(driveId, filePinnedId);
      expect(projectedPinned.kind).toBe("file");
      const pinnedFile = projectedPinned as {
        documentType: string;
        parentFolder: string | null;
      };
      expect(pinnedFile.documentType).toBe(filePinned.header.documentType);
      expect(pinnedFile.parentFolder).toBe(folderChildId);

      const projectedBare = await driveClient.getNode(driveId, fileBareId);
      expect(projectedBare.kind).toBe("file");
      const bareFile = projectedBare as {
        documentType: string;
        parentFolder: string | null;
      };
      expect(bareFile.documentType).toBe("powerhouse/budget");
      expect(bareFile.parentFolder).toBe(folderRootId);

      const reRun = await migrateLegacyDriveState({
        reactor: reactorClient,
        readModel: new DriveNodeView(
          schemaDb as unknown as Kysely<ReactorDriveDatabase>,
        ),
        driveId,
        nodes: legacyNodes,
      });
      expect(reRun.emittedActions).toBe(0);
      expect(reRun.skippedExisting).toBe(legacyNodes.length);
    });
  });
});
