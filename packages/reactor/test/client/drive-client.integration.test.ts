import {
  driveDocumentModelModule,
  isFileNode,
  isFolderNode,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { IDocumentIndexer } from "../../src/storage/interfaces.js";
import type { Database } from "../../src/storage/kysely/types.js";
import {
  createTestDocumentIndexer,
  createTestOperationStore,
} from "../factories.js";

describe("DriveClient Integration Tests", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let documentIndexer: IDocumentIndexer;
  let db: Kysely<Database>;
  let eventBus: IEventBus;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;

    eventBus = new EventBus();

    const tracker = new ConsistencyTracker();
    documentIndexer = createTestDocumentIndexer(db, tracker);
    await documentIndexer.init();

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModelSources([
        driveDocumentModelModule as any,
        documentModelDocumentModelModule,
      ])
      .withReadModel(documentIndexer)
      .withEventBus(eventBus);
    client = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .build();

    reactor = (client as any).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  async function createDrive(
    name = "Test Drive",
  ): Promise<DocumentDriveDocument> {
    return client.drives.create({ global: { name } });
  }

  async function createDocInDrive(
    drive: DocumentDriveDocument,
    name: string,
    parentFolder?: string,
  ) {
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = name;
    return client.drives.addFile(drive.header.id, doc, parentFolder);
  }

  describe("create", () => {
    it("creates a drive document with name and icon", async () => {
      const drive = await client.drives.create({
        global: { name: "My Drive", icon: "rocket" },
      });
      expect(drive.header.documentType).toBe("powerhouse/document-drive");
      expect(drive.state.global.name).toBe("My Drive");
      expect(drive.state.global.icon).toBe("rocket");
      expect(drive.state.global.nodes).toEqual([]);
    });

    it("applies preferredEditor when supplied", async () => {
      const drive = await client.drives.create({
        global: { name: "Drive" },
        preferredEditor: "custom-editor",
      });
      expect(drive.header.meta?.preferredEditor).toBe("custom-editor");
    });
  });

  describe("addFile", () => {
    it("creates a document and registers it as a FileNode in the drive", async () => {
      const drive = await createDrive();
      const doc = documentModelDocumentModelModule.utils.createDocument();
      doc.header.name = "Doc One";

      const created = await client.drives.addFile(drive.header.id, doc);

      expect(created.header.id).toBe(doc.header.id);
      expect(created.header.name).toBe("Doc One");

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const fileNode = reloaded.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(fileNode).toBeDefined();
      expect(fileNode!.kind).toBe("file");
      expect(fileNode!.name).toBe("Doc One");
      expect(fileNode!.parentFolder).toBeFalsy();
    });

    it("nests under a parent folder when supplied", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Inbox");

      const doc = documentModelDocumentModelModule.utils.createDocument();
      doc.header.name = "Nested";
      await client.drives.addFile(drive.header.id, doc, folder.id);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const fileNode = reloaded.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(fileNode?.parentFolder).toBe(folder.id);
    });

    it("registers the parent->child relationship for getOutgoingRelationships", async () => {
      const drive = await createDrive();
      const child = await createDocInDrive(drive, "Child");
      const children = await client.getOutgoingRelationships(
        drive.header.id,
        "child",
      );
      const ids = children.results.map((c) => c.header.id);
      expect(ids).toContain(child.header.id);
    });
  });

  describe("addFolder", () => {
    it("returns a FolderNode with a fresh id and the given name", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Notes");
      expect(folder.kind).toBe("folder");
      expect(folder.name).toBe("Notes");
      expect(folder.id).toBeTruthy();
    });

    it("nests folders under a parent", async () => {
      const drive = await createDrive();
      const parent = await client.drives.addFolder(drive.header.id, "Parent");
      const child = await client.drives.addFolder(
        drive.header.id,
        "Child",
        parent.id,
      );
      expect(child.parentFolder).toBe(parent.id);
    });
  });

  describe("removeNode", () => {
    it("removes a single FileNode and its document", async () => {
      const drive = await createDrive();
      const doc = await createDocInDrive(drive, "Doomed");

      await client.drives.removeNode(drive.header.id, doc.header.id);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const node = reloaded.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(node).toBeUndefined();
      await expect(client.get(doc.header.id)).rejects.toThrow();
    });

    it("cascades deletes for a folder with file descendants", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Trash");
      const doc1 = await createDocInDrive(drive, "Doc 1", folder.id);
      const doc2 = await createDocInDrive(drive, "Doc 2", folder.id);

      await client.drives.removeNode(drive.header.id, folder.id);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      expect(
        reloaded.state.global.nodes.find((n) => n.id === folder.id),
      ).toBeUndefined();
      expect(
        reloaded.state.global.nodes.find((n) => n.id === doc1.header.id),
      ).toBeUndefined();
      expect(
        reloaded.state.global.nodes.find((n) => n.id === doc2.header.id),
      ).toBeUndefined();
      await expect(client.get(doc1.header.id)).rejects.toThrow();
      await expect(client.get(doc2.header.id)).rejects.toThrow();
    });

    it("throws when the node is not found", async () => {
      const drive = await createDrive();
      await expect(
        client.drives.removeNode(drive.header.id, "missing-id"),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("renameNode", () => {
    it("updates both the document header and the drive node entry", async () => {
      const drive = await createDrive();
      const doc = await createDocInDrive(drive, "Original");

      const updatedNode = await client.drives.renameNode(
        drive.header.id,
        doc.header.id,
        "Renamed",
      );
      expect(updatedNode.name).toBe("Renamed");

      const reloadedDoc = await client.get(doc.header.id);
      expect(reloadedDoc.header.name).toBe("Renamed");

      const reloadedDrive = await client.get<DocumentDriveDocument>(
        drive.header.id,
      );
      const node = reloadedDrive.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(node?.name).toBe("Renamed");
    });
  });

  describe("moveNode", () => {
    it("moves a file under a different parent folder", async () => {
      const drive = await createDrive();
      const folderA = await client.drives.addFolder(drive.header.id, "A");
      const folderB = await client.drives.addFolder(drive.header.id, "B");
      const doc = await createDocInDrive(drive, "Doc", folderA.id);

      await client.drives.moveNode(drive.header.id, doc.header.id, folderB.id);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const node = reloaded.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(node?.parentFolder).toBe(folderB.id);
    });
  });

  describe("copyNode", () => {
    it("copies a single file and its document", async () => {
      const drive = await createDrive();
      const original = await createDocInDrive(drive, "Original");

      await client.drives.copyNode(
        drive.header.id,
        original.header.id,
        undefined,
      );

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const fileNodes = reloaded.state.global.nodes.filter(isFileNode);
      expect(fileNodes.length).toBe(2);
      const originalNode = fileNodes.find((n) => n.id === original.header.id);
      const copiedNode = fileNodes.find((n) => n.id !== original.header.id);
      expect(originalNode).toBeDefined();
      expect(copiedNode).toBeDefined();
      expect(copiedNode!.id).not.toBe(original.header.id);

      const copiedDoc = await client.get(copiedNode!.id);
      expect(copiedDoc.header.documentType).toBe(original.header.documentType);
    });

    it("copies a folder subtree", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Source");
      await createDocInDrive(drive, "Inner", folder.id);

      await client.drives.copyNode(drive.header.id, folder.id, undefined);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const folderNodes = reloaded.state.global.nodes.filter(isFolderNode);
      const fileNodes = reloaded.state.global.nodes.filter(isFileNode);
      expect(folderNodes.length).toBe(2);
      expect(fileNodes.length).toBe(2);
    });
  });

  describe("getNode", () => {
    it("returns the requested node", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Folder");
      const node = await client.drives.getNode(drive.header.id, folder.id);
      expect(node.id).toBe(folder.id);
      expect(node.name).toBe("Folder");
    });

    it("throws when the node does not exist", async () => {
      const drive = await createDrive();
      await expect(
        client.drives.getNode(drive.header.id, "no-such-node"),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("listNodes", () => {
    it("returns all nodes when no parent filter is given", async () => {
      const drive = await createDrive();
      await client.drives.addFolder(drive.header.id, "A");
      await client.drives.addFolder(drive.header.id, "B");
      const page = await client.drives.listNodes(drive.header.id);
      expect(page.results.length).toBe(2);
    });

    it("filters by parentFolder when a folder id is provided", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Parent");
      await client.drives.addFolder(drive.header.id, "Inside", folder.id);
      await client.drives.addFolder(drive.header.id, "Outside");

      const inside = await client.drives.listNodes(drive.header.id, folder.id);
      expect(inside.results.length).toBe(1);
      expect(inside.results[0].name).toBe("Inside");
    });

    it("filters root nodes when null is supplied", async () => {
      const drive = await createDrive();
      const folder = await client.drives.addFolder(drive.header.id, "Root");
      await client.drives.addFolder(drive.header.id, "Inside", folder.id);

      const root = await client.drives.listNodes(drive.header.id, null);
      expect(root.results.length).toBe(1);
      expect(root.results[0].id).toBe(folder.id);
    });
  });

  describe("createDocumentInDrive delegation", () => {
    it("still creates a document via the legacy ReactorClient method", async () => {
      const drive = await createDrive();
      const doc = documentModelDocumentModelModule.utils.createDocument();
      doc.header.name = "Legacy";
      const created = await client.createDocumentInDrive(drive.header.id, doc);
      expect(created.header.id).toBe(doc.header.id);

      const reloaded = await client.get<DocumentDriveDocument>(drive.header.id);
      const node = reloaded.state.global.nodes.find(
        (n) => n.id === doc.header.id,
      );
      expect(node).toBeDefined();
    });
  });
});
