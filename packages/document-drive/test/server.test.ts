import {
  ActionContext,
  createPresignedHeader,
  DocumentModelDocument,
  documentModelDocumentModelModule,
  generateId,
  PHDocument,
  setModelName,
} from "document-model";
import fs from "node:fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import InMemoryCache from "../src/cache/memory.js";
import * as actions from "../src/drive-document-model/gen/creators.js";
import { reducer } from "../src/drive-document-model/gen/reducer.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import * as DriveUtils from "../src/drive-document-model/src/utils.js";
import { ReactorBuilder } from "../src/server/builder.js";
import { DocumentAlreadyExistsError } from "../src/server/error.js";
import SynchronizationManager from "../src/server/sync-manager.js";
import { BrowserStorage } from "../src/storage/browser.js";
import { FilesystemStorage } from "../src/storage/filesystem.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { PrismaClient } from "../src/storage/prisma/client/index.js";
import { PrismaStorage } from "../src/storage/prisma/prisma.js";
import {
  IDocumentStorage,
  IDriveOperationStorage,
} from "../src/storage/types.js";
import { baseDocumentModels, expectUUID } from "./utils.js";

const documentModels = baseDocumentModels;

const DocumentDriveUtils = { ...driveDocumentModelModule.utils, ...DriveUtils };
const DocumentModelUtils = documentModelDocumentModelModule.utils;

const FileStorageDir = path.join(__dirname, "./file-storage");
const prismaClient = new PrismaClient();
const cache = new InMemoryCache();
const storageLayers = [
  ["MemoryStorage", async () => new MemoryStorage()],
  ["FilesystemStorage", async () => new FilesystemStorage(FileStorageDir)],
  [
    "BrowserStorage",
    async () => {
      const storage = new BrowserStorage();
      await storage.clear();
      return storage;
    },
  ],
  ["PrismaStorage", async () => new PrismaStorage(prismaClient, cache)],
] as unknown as [
  string,
  () => Promise<IDriveOperationStorage & IDocumentStorage>,
][];

let file: PHDocument | undefined = undefined;
// TODO import RealWorldAssets
// try {
//   file = await DocumentModelsLibs.RealWorldAssets.utils.loadFromFile(
//     "./test/rwa-document.zip",
//   );
// } catch {
//   /* empty */
// }

describe.each(storageLayers)("%s", (storageName, buildStorage) => {
  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));

    cache.clear();

    if (storageName === "FilesystemStorage") {
      return fs.rm(FileStorageDir, { recursive: true, force: true });
    } else if (storageName === "BrowserStorage") {
      return ((await buildStorage()) as any).clear();
    } else if (storageName === "PrismaStorage") {
      await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
      await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
      await prismaClient.$executeRawUnsafe('DELETE FROM "DriveDocument";');
      await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
      await prismaClient.$executeRawUnsafe('DELETE FROM "Drive";');
    }
  });

  afterEach(async () => {
    vi.useRealTimers();

    if (storageName === "FilesystemStorage") {
      return fs.rm(FileStorageDir, { recursive: true, force: true });
    } else if (storageName === "BrowserStorage") {
      return ((await buildStorage()) as any).clear();
    } else if (storageName === "PrismaStorage") {
      //await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
      //await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
      //await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
      //await prismaClient.$executeRawUnsafe('DELETE FROM "Drive";');
    }
  });

  function createDocumentModelWithId(id: string): DocumentModelDocument {
    return {
      ...documentModelDocumentModelModule.utils.createDocument(),
      header: createPresignedHeader(
        id,
        documentModelDocumentModelModule.documentModel.id,
      ),
    };
  }

  it("adds drive to server", async ({ expect }) => {
    const driveId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "PUBLIC",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(driveId);
    expect(drive.state).toStrictEqual(
      DocumentDriveUtils.createState({
        global: {
          name: "name",
          icon: "icon",
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
    expect(drives.includes(driveId)).toBeTruthy();
  });

  it.skipIf(!file)("adds file to server", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();

    await server.addDocument(createDocumentModelWithId(documentId));

    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);
    // performs ADD_FILE operation locally
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );

    // dispatches operation to server
    const operation = drive.operations.global[0]!;
    const operationResult = await server.addOperation(driveId, operation);
    expect(operationResult.status).toBe("SUCCESS");

    drive = await server.getDrive(driveId);
    expect(drive.state).toStrictEqual(operationResult.document?.state);

    expect(drive.state.global.nodes[0]).toStrictEqual({
      id: documentId,
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

  it("adds document to server with documentType", async ({ expect }) => {
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();

    const document = await server.addDocument("powerhouse/document-model");

    const expectedDocument =
      documentModelDocumentModelModule.utils.createDocument();
    expect(document.state).toStrictEqual(expectedDocument.state);
  });

  it("adds document as child when file is added to server", async ({
    expect,
  }) => {
    const driveId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    await server.addDocument(createDocumentModelWithId(documentId));
    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([]);
    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    const operation = drive.operations.global[0]!;

    const result = await server.addOperation(driveId, operation);
    if (result.error) {
      console.error(result.error);
      throw result.error;
    }
    expect(result.status).toBe("SUCCESS");

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([documentId]);

    const document = await server.getDocument(documentId);
    expect(document.header.documentType).toBe("powerhouse/document-model");
    expect(document.state).toStrictEqual(DocumentModelUtils.createState());

    const driveDocuments = await server.getDocuments(driveId);
    expect(driveDocuments).toStrictEqual([documentId]);
  });

  it("adds document as child even if document is not previously added to server", async ({
    expect,
  }) => {
    const driveId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([]);
    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    const operation = drive.operations.global[0]!;

    const result = await server.addOperation(driveId, operation);
    if (result.error) {
      console.error(result.error);
      throw result.error;
    }
    expect(result.status).toBe("SUCCESS");

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([documentId]);

    // const document = await server.getDocument(documentId);
    // expect(document.documentType).toBe("powerhouse/document-model");
    // expect(document.state).toStrictEqual(DocumentModelUtils.createState());

    // const driveDocuments = await server.getDocuments(driveId);
    // expect(driveDocuments).toStrictEqual([documentId]);
  });

  it("removes file as child", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();

    await server.addDocument(createDocumentModelWithId(documentId));

    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

    // adds file
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    let result = await server.addOperation(
      driveId,
      drive.operations.global[0]!,
    );
    expect(result.status).toBe("SUCCESS");

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([documentId]);

    // removes file
    drive = reducer(
      drive,
      actions.deleteNode({
        id: documentId,
      }),
    );
    result = await server.addOperation(driveId, drive.operations.global[1]!);
    expect(result.status).toBe("SUCCESS");

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([]);

    const serverDrive = await server.getDrive(driveId);
    expect(serverDrive.state.global.nodes).toStrictEqual([]);
  });

  it("deletes document node when file is removed from server", async ({
    expect,
  }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    drive = reducer(
      drive,
      actions.deleteNode({
        id: documentId,
      }),
    );

    const result = await server.addOperations(driveId, drive.operations.global);
    expect(result.status).toBe("SUCCESS");

    const documents = await server.getDocuments(driveId);
    expect(documents).toStrictEqual([]);

    await expect(server.getDocument(documentId)).rejects.toThrowError(
      `Document with id ${documentId} not found`,
    );
  });

  it("removes documents as child when it is removed from inside a folder on a drive", async ({
    expect,
  }) => {
    const driveId = generateId();
    const folderId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

    const document = createDocumentModelWithId(documentId);

    await server.addDocument(document);

    drive = reducer(
      drive,
      actions.addFolder({
        id: folderId,
        name: "document 1",
      }),
    );
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
        parentFolder: folderId,
      }),
    );
    drive = reducer(
      drive,
      actions.deleteNode({
        id: folderId,
      }),
    );

    const result = await server.addOperations(driveId, drive.operations.global);
    expect(result.status).toBe("SUCCESS");

    await expect(
      (storage as IDocumentStorage).getChildren(driveId),
    ).resolves.toStrictEqual([]);

    const documents = await server.getDocuments(driveId);
    expect(documents).toStrictEqual([]);

    await expect(server.getDocument(documentId)).resolves.toMatchObject(
      document,
    );
  });

  it("deletes drive from server", async ({ expect }) => {
    const driveId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    await server.deleteDrive(driveId);

    const drives = await server.getDrives();
    expect(drives).toStrictEqual([]);
  });

  it("deletes documents when drive is deleted from server", async ({
    expect,
  }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    const document = createDocumentModelWithId(documentId);

    await server.addDocument(document);

    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );

    const result = await server.addOperation(
      driveId,
      drive.operations.global[0]!,
    );
    expect(result.status).toBe("SUCCESS");

    await server.deleteDrive(driveId);

    const documents = await server.getDocuments(driveId);
    expect(documents).toStrictEqual([]);

    await expect(server.getDocument(documentId)).resolves.toMatchObject(
      document,
    );
  });

  it("renames drive", async ({ expect }) => {
    const driveId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.setDriveName({
        name: "new name",
      }),
    );

    const result = await server.addOperation(
      driveId,
      drive.operations.global[0]!,
    );
    expect(result.status).toBe("SUCCESS");

    drive = await server.getDrive(driveId);
    expect(drive.state.global.name).toBe("new name");
  });

  it("copies document when file is copied drive", async ({ expect }) => {
    const driveId = generateId();
    const folder1Id = generateId();
    const folder2Id = generateId();
    const document1Id = generateId();
    const document2Id = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();

    await server.addDocument(createDocumentModelWithId(document1Id));
    await server.addDocument(createDocumentModelWithId(document2Id));

    await server.addDrive({
      id: driveId,
      slug: "drive",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);
    drive = reducer(
      drive,
      actions.addFolder({
        id: folder1Id,
        name: "1",
      }),
    );
    drive = reducer(
      drive,
      actions.addFolder({
        id: folder2Id,
        name: "2",
      }),
    );
    drive = reducer(
      drive,
      actions.addFile({
        id: document1Id,
        name: "1.1",
        documentType: "powerhouse/document-model",
        parentFolder: folder1Id,
      }),
    );
    drive = reducer(
      drive,
      actions.copyNode({
        srcId: document1Id,
        targetId: document2Id,
        targetName: "2.2",
        targetParentFolder: folder2Id,
      }),
    );
    vi.useRealTimers();
    const result = await server.addOperations(driveId, drive.operations.global);

    expect(result.status).toBe("SUCCESS");

    drive = await server.getDrive(driveId);
    const document = await server.getDocument(document1Id);
    const documentB = await server.getDocument(document2Id);

    // slugs have to change, as they are unique
    expect(document.header.slug).not.toBe(documentB.header.slug);

    // compare everything but the slug + id (which are supposed to be different)
    const {
      header: { slug, id, ...restHeader },
      ...rest
    } = document;
    const {
      header: { slug: slug2, id: id2, ...restHeader2 },
      ...rest2
    } = documentB;
    expect(rest).toStrictEqual(rest2);
    expect(restHeader).toStrictEqual(restHeader2);
    expect(id).toBe(document1Id);
    expect(slug).toBe(document1Id);
    expect(id2).toBe(document2Id);
    expect(slug2).toBe(document2Id);
  });

  it("adds document operation", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

    await server.addDocument(createDocumentModelWithId(documentId));

    // adds file
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    await server.addOperation(driveId, drive.operations.global[0]!);

    let document = await server.getDocument<DocumentModelDocument>(documentId);

    document = documentModelDocumentModelModule.reducer(
      document,
      setModelName({ name: "Test" }),
    );
    const operation = document.operations.global[0]!;
    const result = await server.addOperation(documentId, operation);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.operations[0]).toStrictEqual(
      expect.objectContaining(operation),
    );

    const storedDocument = await server.getDocument(documentId);
    expect(storedDocument.state).toStrictEqual(document.state);
    expect(storedDocument.operations).toMatchObject(document.operations);
  });

  it("adds document operations", async ({ expect }) => {
    const driveId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();

    let document = documentModelDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;

    // adds document
    await server.addDocument(document);

    document = await server.getDocument(documentId);

    document = documentModelDocumentModelModule.reducer(
      document,
      documentModelDocumentModelModule.actions.setModelName({ name: "Test" }),
    );
    document = documentModelDocumentModelModule.reducer(
      document,
      documentModelDocumentModelModule.actions.setStateSchema({
        schema:
          'type TestState {\n  "Add your global state fields here"\n  _placeholder: String\n}',
        scope: "global",
      }),
    );
    const operations = document.operations.global;
    const result = await server.addOperations(documentId, operations);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.operations).toStrictEqual(
      expect.objectContaining(operations),
    );

    const storedDocument = await server.getDocument(driveId, documentId);
    expect(storedDocument.state).toStrictEqual(document.state);
    expect(storedDocument.operations).toMatchObject(document.operations);
  });

  it("adds drive operations", async ({ expect }) => {
    const driveId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

    drive = reducer(
      drive,
      actions.addFolder({ id: generateId(), name: "folder 1" }),
    );
    drive = reducer(
      drive,
      actions.addFolder({ id: generateId(), name: "folder 2" }),
    );

    const operations = drive.operations.global;
    const result = await server.addDriveOperations(driveId, operations);

    expect(result.status).toBe("SUCCESS");
    expect(result.operations).toStrictEqual(
      expect.objectContaining(operations),
    );

    const storedDrive = await server.getDrive(driveId);
    expect(storedDrive.state).toStrictEqual(drive.state);
    expect(storedDrive.operations).toMatchObject(drive.operations);
  });

  it("saves operation context", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

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
      ...actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
      context,
    });

    // dispatches operation to server
    const operation = drive.operations.global[0]!;
    const operationResult = await server.addOperation(driveId, operation);
    expect(operationResult.status).toBe("SUCCESS");

    drive = await server.getDrive(driveId);
    expect(drive.operations.global[0]?.context).toStrictEqual(context);
  });

  it("get drives by slug", async ({ expect }) => {
    const driveId1 = generateId();
    const driveId2 = generateId();
    const driveId3 = generateId();
    const driveId4 = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    const addDrive = (driveId: string, slug: string) =>
      server.addDrive({
        id: driveId,
        slug,
        global: {
          name: "name",
          icon: "icon",
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          listeners: [],
          triggers: [],
        },
      });

    await addDrive(driveId1, "slug1");
    await addDrive(driveId2, "slug2");
    await addDrive(driveId3, "slug3");

    // add drive with the same slug as the first drive, which should throw an error
    try {
      await addDrive(driveId4, "slug1");

      throw new Error("created drive with duplicate slug");
    } catch (error) {
      expect((error as DocumentAlreadyExistsError).documentId).toContain(
        driveId4,
      );
    }

    let drive = await server.getDriveBySlug("slug1");
    expect(drive.header.id).toBe(driveId1);

    drive = await server.getDriveBySlug("slug2");
    expect(drive.header.id).toBe(driveId2);

    drive = await server.getDriveBySlug("slug3");
    expect(drive.header.id).toBe(driveId3);
  });

  it.skipIf(!file)("import document from zip", async ({ expect }) => {
    const driveId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();
    const drive = await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    const documentId = generateId();
    await server.addDocument({
      ...file!,
      header: createPresignedHeader(documentId, file!.header.documentType),
    });
    const action = actions.addFile({
      id: documentId,
      name: "name",
      parentFolder: null,
      documentType: file!.header.documentType,
    });
    const result = await server.addAction(driveId, action);
    expect(result.status).toBe("SUCCESS");
    const document = await server.getDocument(documentId);
    expect(document).toStrictEqual(file);
  });

  it("should get synchronization units revision", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const cache = new InMemoryCache();
    const syncManager = new SynchronizationManager(
      storage,
      storage as any,
      cache,
      documentModels,
    );
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .withSynchronizationManager(syncManager)
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

    await server.addDocument(createDocumentModelWithId(documentId));

    // adds file
    drive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );
    await server.addOperation(driveId, drive.operations.global[0]!);

    let document = await server.getDocument<DocumentModelDocument>(documentId);
    document = documentModelDocumentModelModule.reducer(
      document,
      setModelName({ name: "Test" }),
    );
    const operation = document.operations.global[0]!;
    await server.addOperation(documentId, operation);
    await server.getDocument(documentId);

    const syncUnits = await syncManager.getSynchronizationUnits(driveId);
    expect(syncUnits).toStrictEqual([
      {
        documentId: drive.header.id,
        documentType: "powerhouse/document-drive",
        scope: "global",
        branch: "main",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        revision: 1,
      },
      {
        documentId: documentId,
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        lastUpdated: "2024-01-01T00:00:00.000Z",
        revision: 1,
      },
    ]);

    const storageUnits = await storage.findStorageUnitsBy({}, 10);
    expect(storageUnits.units).toHaveLength(5);
  });

  it("should store all operation attributes", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const storage = await buildStorage();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(storage)
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    let drive = await server.getDrive(driveId);

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
      ...actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
      context,
    });

    await server.addOperation(driveId, drive.operations.global[0]!);
    const storedDrive = await server.getDrive(driveId);
    expect(storedDrive.operations.global[0]).toMatchObject(
      drive.operations.global[0]!,
    );
  });

  it("gets document at specific revision", async ({ expect }) => {
    const driveId = generateId();
    const documentId = generateId();
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();
    await server.addDrive({
      id: driveId,
      slug: "slug",
      global: {
        name: "name",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(driveId);

    // adds file
    const newDrive = reducer(
      drive,
      actions.addFile({
        id: documentId,
        name: "document 1",
        documentType: "powerhouse/document-model",
      }),
    );

    await server.addOperation(driveId, newDrive.operations.global[0]!);

    const drive0 = await server.getDrive(driveId, {
      revisions: { global: -1 },
    });
    expect(drive0.operations.global.length).toBe(0);
    expect(drive0).toStrictEqual(drive);
  });

  it("should allow removing a drive and then adding a new drive with the same id and slug", async ({
    expect,
  }) => {
    const server = new ReactorBuilder(documentModels)
      .withCache(cache)
      .withStorage(await buildStorage())
      .build();

    await server.addDrive({
      id: "test-drive",
      slug: "test-drive",
      global: {
        name: "test-drive",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    await server.deleteDrive("test-drive");

    await server.addDrive({
      id: "test-drive",
      slug: "test-drive",
      global: {
        name: "test-drive",
        icon: "icon",
      },
      local: {
        availableOffline: false,
        sharingType: "public",
        listeners: [],
        triggers: [],
      },
    });

    const drive = await server.getDriveBySlug("test-drive");
    expect(drive.header.slug).toBe("test-drive");
  });
});
