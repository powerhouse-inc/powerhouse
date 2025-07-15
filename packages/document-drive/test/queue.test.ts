import { describe, it } from "vitest";
import {
  DocumentModelDocument,
  DocumentModelModule,
  generateId,
} from "../../document-model/index.js";
import { setModelName } from "../../document-model/src/document-model/gen/creators.js";
import { createDocument as createDocumentModelDocument } from "../../document-model/src/document-model/gen/utils.js";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module.js";
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
import { generateAddNodeAction } from "../src/drive-document-model/src/utils.js";
import { BaseQueueManager } from "../src/queue/base.js";
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
] as DocumentModelModule[];

const queueLayers: [string, () => Promise<IQueueManager>][] = [
  ["Memory Queue", () => Promise.resolve(new BaseQueueManager())],
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
      const promisses: Promise<IOperationResult<DocumentDriveDocument>>[] = [];
      for (let i = 0; i < ADD_OPERATIONS_TO_DRIVE; i++) {
        const id = generateId();
        drive = reducer(
          drive,
          generateAddNodeAction(
            drive.state.global,
            {
              id,
              name: id,
              documentType: documentModelDocumentModelModule.documentModel.id,
            },
            ["global", "local"],
          ),
        );
        promisses.push(
          queue
            ? server.queueDriveOperations(
                drive.header.id,
                drive.operations.global,
              )
            : server.addDriveOperations(
                drive.header.id,
                drive.operations.global,
              ),
        );
      }
      return Promise.all(promisses);
    };

    it("block document queue until ADD_FILE is processed", async ({
      expect,
    }) => {
      const documentId = generateId();
      const folderId = generateId();

      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .build();
      await server.initialize();

      let drive = await createDrive(server);

      const driveId = drive!.header.id;
      const driveOperations = buildOperations(reducer, drive!, [
        addFolder({ id: folderId, name: "folder 1" }),
        addFile({
          id: documentId,
          name: "file 1",
          parentFolder: folderId,
          documentType: documentModelDocumentModelModule.documentModel.id,
          synchronizationUnits: [
            { syncId: "1", scope: "global", branch: "main" },
          ],
        }),
      ]);

      const document = createDocumentModelDocument();
      const mutation = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "foo",
        }),
      );

      // queue mutation
      const documentResult = server.queueOperations(driveId, documentId, [
        mutation,
      ]);
      await expect(
        server.getDocument(driveId, documentId),
      ).rejects.toThrowError(`Document with id ${documentId} not found`);

      // now queue add file
      const results = await server.queueDriveOperations(
        driveId,
        driveOperations,
      );

      const errors = [results, await documentResult].filter((r) => !!r.error);
      if (errors.length) {
        errors.forEach((error) => console.error("Error queueing", error));
      }
      expect(errors.length).toBe(0);

      // now get the drive and check that the rename was applied
      drive = await server.getDrive(driveId);
      expect(drive!.state.global.nodes).toStrictEqual([
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
          synchronizationUnits: [
            { syncId: "1", scope: "global", branch: "main" },
          ],
        }),
      ]);

      const docModelDocument = (await server.getDocument(
        driveId,
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

      const driveId = drive!.header.id;
      const folderId = generateId();
      const folderId2 = generateId();
      const fileId = generateId();
      const driveOperations = buildOperations(reducer, drive!, [
        addFolder({ id: folderId, name: "folder 1" }),
        addFile({
          id: fileId,
          name: "file 1",
          parentFolder: folderId,
          documentType: documentModelDocumentModelModule.documentModel.id,
          synchronizationUnits: [
            { syncId: "1", scope: "global", branch: "main" },
          ],
        }),
      ]);

      const document = createDocumentModelDocument();
      const mutation = buildOperation(
        documentModelDocumentModelModule.reducer,
        document,
        setModelName({
          name: "foo",
        }),
      );

      const results = await Promise.all([
        server.queueOperations(driveId, fileId, [mutation]),
        server.queueDriveOperations(driveId, driveOperations),
        server.queueDriveOperations(driveId, [
          buildOperation(
            reducer,
            drive!,
            addFolder({
              id: folderId2,
              name: "folder 2",
            }),
          ),
        ]),
      ]);

      const errors = results
        .flat()
        .filter((r) => !!(r as IOperationResult).error);
      if (errors.length) {
        errors.forEach((error) => console.error(error));
      }
      expect(errors.length).toBe(0);

      drive = await server.getDrive(driveId);
      expect(drive!.state.global.nodes).toStrictEqual(
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
            synchronizationUnits: [
              { syncId: "1", scope: "global", branch: "main" },
            ],
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
        drive!.state.global.nodes.findIndex((n) => n.id === fileId),
      ).toBeGreaterThan(
        drive!.state.global.nodes.findIndex((n) => n.id === folderId),
      );

      const docModelDocument = (await server.getDocument(
        driveId,
        fileId,
      )) as DocumentModelDocument;
      expect(docModelDocument.state.global.name).toBe("foo");
    });

    it("it blocks a document queue when the drive queue processes a delete node operation", async ({
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
      const driveId = drive!.header.id;

      const document = createDocumentModelDocument();

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
      const driveOperations = buildOperations(reducer, drive!, [
        addFile({
          id: "file 1",
          name: "file 1",
          parentFolder: "folder 1",
          documentType: documentModelDocumentModelModule.documentModel.id,
          synchronizationUnits: [
            { syncId: "1", scope: "global", branch: "main" },
          ],
        }),
      ]);

      // queue addFile and first doc op
      const results1 = await Promise.all([
        server.queueDriveOperations(driveId, driveOperations),
        server.queueOperations(driveId, "file 1", [mutation]),
      ]);

      const errors = results1
        .flat()
        .filter((r) => !!(r as IOperationResult).error);
      if (errors.length) {
        errors.forEach((error) => console.error(error));
      }

      // delete node op
      drive = await server.getDrive(driveId);
      const deleteNodeOps = buildOperations(documentDriveReducer, drive!, [
        deleteNode({ id: "file 1" }),
      ]);

      // queue delete node op
      await server.queueDriveOperations(driveId, deleteNodeOps);
      // ==> receives deleteNode and addFile operation?

      await expect(
        server.queueOperations(driveId, "file 1", [mutation2]),
      ).rejects.toThrowError("Queue is deleted");

      drive = await server.getDrive(driveId);
      expect(drive!.state.global.nodes).toStrictEqual([]);
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
        drives.map((drive) => {
          expect(drive).toBeDefined();
          return addOperationsToDrive(server, drive!, false);
        }),
      );

      expect(
        driveResults.flat().filter((f) => f.status === "ERROR").length,
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
        drives.map((drive) => {
          expect(drive).toBeDefined();
          return addOperationsToDrive(server, drive!);
        }),
      );

      // log errors
      driveResults.flat().forEach((f) => {
        if (f.status === "ERROR") {
          console.error(f.error);
        }
      });

      expect(
        driveResults.flat().filter((f) => f.status !== "SUCCESS").length,
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
      const driveId = drive!.header.id;
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
      const result = await server.queueDriveAction(driveId, action);
      const drive2 = await server.getDrive(driveId);

      expect(drive2!.state.local.listeners.length).toBe(1);
    });
  },
);
