import { setTimeout } from "node:timers/promises";
import { describe, it } from "vitest";
import {
  DocumentModelDocument,
  DocumentModelModule,
  generateId,
} from "../../document-model/index.js";
import { setModelName } from "../../document-model/src/document-model/gen/creators.js";
import { createDocument as createDocumentModelDocument } from "../../document-model/src/document-model/gen/utils.js";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module.js";
import { createUnsignedHeader } from "../../document-model/src/document/utils/header.js";
import InMemoryCache from "../src/cache/memory.js";
import { addListener } from "../src/drive-document-model/gen/creators.js";
import {
  addFile,
  addFolder,
  deleteNode,
} from "../src/drive-document-model/gen/node/creators.js";
import {
  reducer as documentDriveReducer,
  reducer,
} from "../src/drive-document-model/gen/reducer.js";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { EventQueueManager } from "../src/queue/event.js";
import { IQueueManager } from "../src/queue/types.js";
import { ReactorBuilder } from "../src/server/builder.js";
import {
  IBaseDocumentDriveServer,
  IOperationResult,
} from "../src/server/types.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { buildOperation, buildOperations } from "./utils.js";

const REDIS_TLS_URL = process.env.REDIS_TLS_URL || "redis://localhost:6379";

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule<any>[];

const queueLayers: [string, () => Promise<IQueueManager>][] = [
  // ["Memory Queue", () => Promise.resolve(new BaseQueueManager(3))],
  ["Memory Event Queue", () => Promise.resolve(new EventQueueManager(2))],
  /*[
    "Redis Queue",
    async () => {
      try {
        const client = await createClient({ url: REDIS_TLS_URL }).connect();
        await client.flushAll();
        return new RedisQueueManager(3, 0, client as RedisClientType);
      } catch (error) {
        console.error(error);
        throw error;
      }
    },
  ],*/
] as unknown as [string, () => Promise<IQueueManager>][];

describe.each(queueLayers)(
  "Document Drive Server queuing with %s",
  async (_, buildQueue) => {
    const CREATE_DRIVES = 10;
    const ADD_OPERATIONS_TO_DRIVE = 10;

    const createDrive = async (server: IBaseDocumentDriveServer) => {
      const id = generateId();
      await server.addDrive({
        id,
        slug: `name-${id}`,
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

      const drive = await server.getDrive(id);
      return drive;
    };

    const addOperationsToDrive = async (
      server: IBaseDocumentDriveServer,
      drive: DocumentDriveDocument,
      queue = true,
    ) => {
      const promisses: Promise<IOperationResult>[] = [];
      for (let i = 0; i < ADD_OPERATIONS_TO_DRIVE; i++) {
        const id = generateId();
        drive = reducer(
          drive,
          addFile({
            id,
            name: id,
            documentType: documentModelDocumentModelModule.documentModel.id,
          }),
        );
        promisses.push(
          queue
            ? server.queueOperations(drive.header.id, drive.operations.global)
            : server.addOperations(drive.header.id, drive.operations.global),
        );
      }
      return Promise.all(promisses);
    };

    it("does not block document queue until ADD_FILE is processed", async ({
      expect,
    }) => {
      const documentId = generateId();
      const folderId = generateId();

      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .build();
      await server.initialize();

      let drive = await createDrive(server);

      const driveId = drive.header.id;
      const documentType = documentModelDocumentModelModule.documentModel.id;
      const driveOperations = buildOperations(reducer, drive, [
        addFolder({ id: folderId, name: "folder 1" }),
        addFile({
          id: documentId,
          name: "file 1",
          parentFolder: folderId,
          documentType,
        }),
      ]);

      const document = createDocumentModelDocument();
      const header = createUnsignedHeader(documentId, documentType);
      document.header = header;
      await server.addDocument(document);
      const mutation = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "foo",
        }),
      );

      // queue mutation
      const documentResult = server.queueOperations(documentId, [mutation]);
      await expect(server.getDocument(documentId)).resolves.toMatchObject(
        document,
      );

      // now queue add file
      const results = await server.queueOperations(driveId, driveOperations);

      const errors = [results, await documentResult].filter((r) => !!r.error);
      if (errors.length) {
        errors.forEach((error) => console.error("Error queueing", error));
      }
      expect(errors.length).toBe(0);

      // now get the drive and check that the rename was applied
      drive = await server.getDrive(driveId);
      expect(drive.state.global.nodes).toStrictEqual([
        expect.objectContaining({
          id: folderId,
          name: "folder 1",
          kind: "folder",
          parentFolder: null,
        }),
        expect.objectContaining({
          id: documentId,
          name: "file 1",
          kind: "file",
          parentFolder: folderId,
          documentType: documentModelDocumentModelModule.documentModel.id,
        }),
      ]);

      const docModelDocument = (await server.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(docModelDocument.state.global.name).toBe("foo");
    });

    it("orders strands correctly", async ({ expect }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();

      let drive = await createDrive(server);

      const driveId = drive.header.id;
      const folderId = generateId();
      const folderId2 = generateId();
      const fileId = generateId();
      const documentType = documentModelDocumentModelModule.documentModel.id;
      const driveOperations = buildOperations(reducer, drive, [
        addFolder({ id: folderId, name: "folder 1" }),
        addFile({
          id: fileId,
          name: "file 1",
          parentFolder: folderId,
          documentType,
        }),
      ]);

      const document = createDocumentModelDocument();
      const header = createUnsignedHeader(fileId, documentType);
      await server.addDocument({ ...document, header });
      const mutation = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "foo",
        }),
      );

      const results = [
        server.queueOperations(fileId, [mutation]),
        server.queueOperations(driveId, driveOperations),
      ];
      await setTimeout();
      results.push(
        server.queueOperations(driveId, [
          buildOperation(
            reducer,
            drive,
            addFolder({
              id: folderId2,
              name: "folder 2",
            }),
          ),
        ]),
      );

      const errors = (await Promise.all(results))
        .flat()
        .filter((r) => !!(r as IOperationResult).error);
      if (errors.length) {
        errors.forEach((error) => console.error(error));
      }
      expect(errors.length).toBe(0);

      drive = await server.getDrive(driveId);
      expect(drive.state.global.nodes).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: folderId,
            name: "folder 1",
            kind: "folder",
            parentFolder: null,
          }),
          expect.objectContaining({
            id: fileId,
            name: "file 1",
            kind: "file",
            parentFolder: folderId,
            documentType: documentModelDocumentModelModule.documentModel.id,
          }),
          expect.objectContaining({
            id: folderId2,
            name: "folder 2",
            kind: "folder",
            parentFolder: null,
          }),
        ]),
      );

      // add file 1 operation has to be processed after add folder 1
      expect(
        drive.state.global.nodes.findIndex((n: any) => n.id === fileId),
      ).toBeGreaterThan(
        drive.state.global.nodes.findIndex((n: any) => n.id === folderId),
      );

      // add folder 2 operation has to be processed before add folder 1
      expect(
        drive.state.global.nodes.findIndex((n: any) => n.id === folderId2),
      ).toBeGreaterThan(
        drive.state.global.nodes.findIndex((n: any) => n.id === folderId),
      );

      const docModelDocument = (await server.getDocument(
        fileId,
      )) as DocumentModelDocument;
      expect(docModelDocument.state.global.name).toBe("foo");
    });

    it("does not block a document queue when the drive queue processes a delete node operation", async ({
      expect,
    }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();
      let drive = await createDrive(server);
      const driveId = drive.header.id;

      const document = createDocumentModelDocument();

      await server.addDocument(document);

      // first doc op
      const mutation = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "foo",
        }),
      );

      // second doc op
      const mutation2 = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "bar",
        }),
      );

      // add file op
      const nodeId = document.header.id;
      const driveOperations = buildOperations(reducer, drive, [
        addFile({
          id: nodeId,
          name: "file 1",
          parentFolder: "folder 1",
          documentType: documentModelDocumentModelModule.documentModel.id,
        }),
      ]);

      // queue addFile and first doc op
      const results1 = await Promise.all([
        server.queueOperations(driveId, driveOperations),
        server.queueOperations(nodeId, [mutation]),
      ]);

      const errors = results1
        .flat()
        .filter((r) => !!(r as IOperationResult).error);
      expect(errors.length).toBe(0);
      // delete node op
      drive = await server.getDrive(driveId);
      const deleteNodeOps = buildOperations(documentDriveReducer, drive, [
        deleteNode({ id: nodeId }),
      ]);

      // queue delete node op
      await server.queueOperations(driveId, deleteNodeOps);
      // ==> receives deleteNode and addFile operation?

      await expect(
        server.queueOperations(nodeId, [mutation2]),
      ).resolves.toMatchObject({
        document: { state: { global: { name: "bar" } } },
      });

      drive = await server.getDrive(driveId);
      expect(drive.state.global.nodes).toStrictEqual([]);
    });

    it("queues operations when using addDriveOperations", async ({
      expect,
    }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();
      const drives = await Promise.all(
        new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
          return createDrive(server);
        }),
      );
      const driveResults = await Promise.all(
        drives.map((drive: any) => {
          expect(drive).toBeDefined();
          return addOperationsToDrive(server, drive, false);
        }),
      );

      expect(
        driveResults.flat().filter((f: any) => f.status === "ERROR").length,
      ).toBe(0);
    });

    it("produces no errors on queueDriveOperations", async ({ expect }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();
      const drives = await Promise.all(
        new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
          return createDrive(server);
        }),
      );

      const driveResults = await Promise.all(
        drives.map((drive: any) => {
          expect(drive).toBeDefined();
          return addOperationsToDrive(server, drive);
        }),
      );

      // log errors
      driveResults.flat().forEach((f: any) => {
        if (f.status === "ERROR") {
          console.error(f.error);
        }
      });

      expect(
        driveResults.flat().filter((f: any) => f.status !== "SUCCESS").length,
      ).toBe(0);
    });

    it("adds operations with queueDriveAction", async ({ expect }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();
      const drive = await createDrive(server);
      const driveId = drive.header.id;
      const action = addListener({
        listener: {
          block: true,
          callInfo: {
            data: "",
            name: "test",
            transmitterType: "Internal",
          },
          filter: {
            branch: [],
            documentId: [],
            documentType: [],
            scope: [],
          },
          label: "test",
          listenerId: "123",
          system: true,
        },
      });
      const result = await server.queueAction(driveId, action);
      const drive2 = await server.getDrive(driveId);

      expect(drive2.state.local.listeners.length).toBe(1);
    });
  },
);
