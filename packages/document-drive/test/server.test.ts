import { driveDocumentModelModule } from "#drive-document-model/module";
import * as DriveUtils from "#drive-document-model/src/utils";
import { ReactorBuilder } from "#server/builder";
import { PrismaClient } from "@prisma/client";
import {
  ActionContext,
  DocumentModelDocument,
  documentModelDocumentModelModule,
  PHDocument,
} from "document-model";
import fs from "node:fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { reducer } from "../src/drive-document-model/gen/reducer.js";
import { generateAddNodeAction } from "../src/drive-document-model/src/utils.js";
import { BrowserStorage } from "../src/storage/browser.js";
import { FilesystemStorage } from "../src/storage/filesystem.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { PrismaStorage } from "../src/storage/prisma.js";
import { SequelizeStorage } from "../src/storage/sequelize.js";
import { IDriveStorage } from "../src/storage/types.js";
import { generateUUID } from "../src/utils/misc.js";
import { baseDocumentModels, expectUUID } from "./utils.js";

const documentModels = baseDocumentModels;

const DocumentDriveUtils = { ...driveDocumentModelModule.utils, ...DriveUtils };
const DocumentModelUtils = documentModelDocumentModelModule.utils;

const actions = driveDocumentModelModule.actions;

const FileStorageDir = path.join(__dirname, "./file-storage");
const prismaClient = new PrismaClient();
const storageLayers = [
  ["MemoryStorage", async () => new MemoryStorage()],
  ["FilesystemStorage", async () => new FilesystemStorage(FileStorageDir)],
  ["BrowserStorage", async () => new BrowserStorage()],
  ["PrismaStorage", async () => new PrismaStorage(prismaClient)],
  [
    "SequelizeStorage",
    async () => {
      const storage = new SequelizeStorage({
        dialect: "sqlite",
        storage: ":memory:",
        logging: false,
      });

      await storage.syncModels();
      return storage;
    },
  ],
] as unknown as [string, () => Promise<IDriveStorage>][];

let file: PHDocument | undefined = undefined;
// TODO import RealWorldAssets
// try {
//   file = await DocumentModelsLibs.RealWorldAssets.utils.loadFromFile(
//     "./test/rwa-document.zip",
//   );
// } catch {
//   /* empty */
// }

describe.each(storageLayers)(
  "Document Drive Server with %s",
  (storageName, buildStorage) => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2024-01-01"));
    });

    afterEach(async () => {
      vi.useRealTimers();

      if (storageName === "FilesystemStorage") {
        return fs.rm(FileStorageDir, { recursive: true, force: true });
      } else if (storageName === "BrowserStorage") {
        return (await buildStorage()).clearStorage?.();
      } else if (storageName === "PrismaStorage") {
        await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
        await prismaClient.$executeRawUnsafe('DELETE FROM "Drive";');
      }
    });

    it("adds drive to server", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: null,
        },
        local: {
          availableOffline: false,
          sharingType: "PUBLIC",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");
      expect(drive.state).toStrictEqual(
        DocumentDriveUtils.createState({
          global: {
            id: "1",
            name: "name",
            icon: "icon",
            slug: null,
          },
          local: {
            availableOffline: false,
            sharingType: "PUBLIC",
            listeners: [],
            triggers: [],
          },
        }),
      );

      const drives = await server.getDrives();
      expect(drives.includes("1")).toBeTruthy();
    });

    it.skipIf(!file)("adds file to server", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      // performs ADD_FILE operation locally
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );

      // dispatches operation to server
      const operation = drive.operations.global[0]!;
      const operationResult = await server.addDriveOperation("1", operation);
      expect(operationResult.status).toBe("SUCCESS");

      drive = await server.getDrive("1");
      expect(drive.state).toStrictEqual(operationResult.document?.state);

      expect(drive.state.global.nodes[0]).toStrictEqual({
        id: "1.1",
        kind: "file",
        name: "document 1",
        documentType: "powerhouse/document-model",
        parentFolder: null,
        synchronizationUnits: [
          {
            branch: "main",
            scope: "global",
            syncId: expectUUID(expect),
          },
          {
            branch: "main",
            scope: "local",
            syncId: expectUUID(expect),
          },
        ],
      });
    });

    it("creates new document of the correct document type when file is added to server", async ({
      expect,
    }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );
      const operation = drive.operations.global[0]!;

      const result = await server.addDriveOperation("1", operation);
      if (result.error) {
        console.error(result.error);
        throw result.error;
      }
      expect(result.status).toBe("SUCCESS");

      const document = await server.getDocument("1", "1.1");
      expect(document.documentType).toBe("powerhouse/document-model");
      expect(document.state).toStrictEqual(DocumentModelUtils.createState());

      const driveDocuments = await server.getDocuments("1");
      expect(driveDocuments).toStrictEqual(["1.1"]);
    });

    it("deletes file from server", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      // adds file
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );
      let result = await server.addDriveOperation(
        "1",
        drive.operations.global[0]!,
      );
      expect(result.status).toBe("SUCCESS");

      // removes file
      drive = reducer(
        drive,
        actions.deleteNode({
          id: "1.1",
        }),
      );
      result = await server.addDriveOperation("1", drive.operations.global[1]!);
      expect(result.status).toBe("SUCCESS");

      const serverDrive = await server.getDrive("1");
      expect(serverDrive.state.global.nodes).toStrictEqual([]);
    });

    it("deletes document when file is removed from server", async ({
      expect,
    }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );
      drive = reducer(
        drive,
        actions.deleteNode({
          id: "1.1",
        }),
      );

      const result = await server.addDriveOperations(
        "1",
        drive.operations.global,
      );
      expect(result.status).toBe("SUCCESS");

      const documents = await server.getDocuments("1");
      expect(documents).toStrictEqual([]);

      await expect(server.getDocument("1", "1.1")).rejects.toThrowError(
        "Document with id 1.1 not found",
      );
    });

    it("deletes documents inside a folder when it is removed from a drive", async ({
      expect,
    }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      drive = reducer(
        drive,
        actions.addFolder({
          id: "1.1",
          name: "document 1",
        }),
      );
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",

            parentFolder: "1.1",
          },
          ["global", "local"],
        ),
      );
      drive = reducer(
        drive,
        actions.deleteNode({
          id: "1.1",
        }),
      );

      const result = await server.addDriveOperations(
        "1",
        drive.operations.global,
      );
      expect(result.status).toBe("SUCCESS");

      const documents = await server.getDocuments("1");
      expect(documents).toStrictEqual([]);

      await expect(server.getDocument("1", "1.1")).rejects.toThrowError(
        "Document with id 1.1 not found",
      );
    });

    it("deletes drive from server", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });

      await server.deleteDrive("1");

      const drives = await server.getDrives();
      expect(drives).toStrictEqual([]);
    });

    it("deletes documents when drive is deleted from server", async ({
      expect,
    }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });

      let drive = await server.getDrive("1");
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );

      const result = await server.addDriveOperation(
        "1",
        drive.operations.global[0]!,
      );
      expect(result.status).toBe("SUCCESS");

      await server.deleteDrive("1");

      const documents = await server.getDocuments("1");
      expect(documents).toStrictEqual([]);
    });

    it("renames drive", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      drive = reducer(
        drive,
        actions.setDriveName({
          name: "new name",
        }),
      );

      const result = await server.addDriveOperation(
        "1",
        drive.operations.global[0]!,
      );
      expect(result.status).toBe("SUCCESS");

      drive = await server.getDrive("1");
      expect(drive.state.global.name).toBe("new name");
    });

    it("copies document when file is copied drive", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      drive = reducer(
        drive,
        actions.addFolder({
          id: "1",
          name: "1",
        }),
      );
      drive = reducer(
        drive,
        actions.addFolder({
          id: "2",
          name: "2",
        }),
      );
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "1.1",
            documentType: "powerhouse/document-model",
            parentFolder: "1",
          },
          ["global", "local"],
        ),
      );
      drive = reducer(
        drive,
        DocumentDriveUtils.generateCopyNodeAction(drive.state.global, {
          srcId: "1.1",
          targetId: "2.1",
          targetName: "2.2",
          targetParentFolder: "2",
        }),
      );
      vi.useRealTimers();
      const result = await server.addDriveOperations(
        "1",
        drive.operations.global,
      );

      expect(result.status).toBe("SUCCESS");

      drive = await server.getDrive("1");
      const document = await server.getDocument("1", "1.1");
      const documentB = await server.getDocument("1", "2.1");
      expect(document).toStrictEqual(documentB);
    });

    it("adds document operation", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      // adds file
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );
      await server.addDriveOperation("1", drive.operations.global[0]!);

      let document = (await server.getDocument(
        "1",
        "1.1",
      )) as DocumentModelDocument;

      document = documentModelDocumentModelModule.reducer(
        document,
        documentModelDocumentModelModule.actions.setModelName("Test"),
      );
      const operation = document.operations.global[0]!;
      const result = await server.addOperation("1", "1.1", operation);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe("SUCCESS");
      expect(result.operations[0]).toStrictEqual(
        expect.objectContaining(operation),
      );

      const storedDocument = await server.getDocument("1", "1.1");
      expect(storedDocument.state).toStrictEqual(document.state);
      expect(storedDocument.operations).toMatchObject(document.operations);
    });

    it("saves operation context", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      const context: ActionContext = {
        signer: {
          user: {
            address: "123",
            networkId: "1",
            chainId: 1,
          },
          app: {
            name: "name",
            key: "key",
          },
          signatures: ["test" as any],
        },
      };

      drive = reducer(drive, {
        ...DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
        context,
      });

      // dispatches operation to server
      const operation = drive.operations.global[0]!;
      const operationResult = await server.addDriveOperation("1", operation);
      expect(operationResult.status).toBe("SUCCESS");

      drive = await server.getDrive("1");
      expect(drive.operations.global[0]?.context).toStrictEqual(context);
    });

    it("get drives by slug", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      const addDrive = (driveId: string, slug: string) =>
        server.addDrive({
          global: {
            id: driveId,
            name: "name",
            icon: "icon",
            slug: slug,
          },
          local: {
            availableOffline: false,
            sharingType: "public",
            listeners: [],
            triggers: [],
          },
        });

      await addDrive("1", "slug1");
      await addDrive("2", "slug2");
      await addDrive("3", "slug3");
      await addDrive("4", "slug1");

      let drive = await server.getDriveBySlug("slug1");
      expect(drive.state.global.id).toBe("4");

      drive = await server.getDriveBySlug("slug2");
      expect(drive.state.global.id).toBe("2");

      drive = await server.getDriveBySlug("slug3");
      expect(drive.state.global.id).toBe("3");
    });

    it.skipIf(!file)("import document from zip", async ({ expect }) => {
      const storage = await buildStorage();
      const server = new ReactorBuilder(documentModels)
        .withStorage(storage)
        .build();
      const drive = await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      const id = generateUUID();
      const action = generateAddNodeAction(
        drive.state.global,
        {
          id,
          name: "name",
          parentFolder: null,
          documentType: file!.documentType,

          document: file,
        },
        ["global"],
      );
      const result = await server.addDriveAction("1", action);
      expect(result.status).toBe("SUCCESS");
      const document = await server.getDocument("1", id);
      expect(document).toStrictEqual(file);
    });

    it("should get synchronization units revision", async ({ expect }) => {
      const storage = await buildStorage();
      const server = new ReactorBuilder(documentModels)
        .withStorage(storage)
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      // adds file
      drive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );
      await server.addDriveOperation("1", drive.operations.global[0]!);

      let document = (await server.getDocument(
        "1",
        "1.1",
      )) as DocumentModelDocument;
      document = documentModelDocumentModelModule.reducer(
        document,
        documentModelDocumentModelModule.actions.setModelName("Test"),
      );
      const operation = document.operations.global[0]!;
      await server.addOperation("1", "1.1", operation);
      await server.getDocument("1", "1.1");

      const syncUnits = await server.getSynchronizationUnits("1");
      expect(syncUnits).toStrictEqual([
        {
          driveId: "1",
          documentId: "",
          documentType: "powerhouse/document-drive",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 0,
          syncId: "0",
        },
        {
          driveId: "1",
          documentId: "1.1",
          documentType: "powerhouse/document-model",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 0,
          syncId: expectUUID(expect),
        },
        {
          driveId: "1",
          documentId: "1.1",
          documentType: "powerhouse/document-model",
          scope: "local",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          syncId: expectUUID(expect),
        },
      ]);
    });

    it("should store all operation attributes", async ({ expect }) => {
      const storage = await buildStorage();
      const server = new ReactorBuilder(documentModels)
        .withStorage(storage)
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");

      const context: ActionContext = {
        signer: {
          user: {
            address: "123",
            networkId: "1",
            chainId: 1,
          },
          app: {
            name: "name",
            key: "key",
          },
          signatures: ["test" as any],
        },
      };

      // adds file
      drive = reducer(drive, {
        ...DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
        context,
      });

      await server.addDriveOperation("1", drive.operations.global[0]!);
      const storedDrive = await server.getDrive("1");
      expect(storedDrive.operations.global[0]).toMatchObject(
        drive.operations.global[0]!,
      );
    });

    it("gets document at specific revision", async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(await buildStorage())
        .build();
      await server.addDrive({
        global: {
          id: "1",
          name: "name",
          icon: "icon",
          slug: "slug",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");

      // adds file
      const newDrive = reducer(
        drive,
        DocumentDriveUtils.generateAddNodeAction(
          drive.state.global,
          {
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
          },
          ["global", "local"],
        ),
      );

      await server.addDriveOperation("1", newDrive.operations.global[0]!);

      const drive0 = await server.getDrive("1", { revisions: { global: -1 } });
      expect(drive0.operations.global.length).toBe(0);
      expect(drive0).toStrictEqual(drive);
    });
  },
);
