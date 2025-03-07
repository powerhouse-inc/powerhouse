import { addListener, deleteNode } from "#drive-document-model/gen/creators";
import { generateUUID } from "#utils/misc";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
} from "document-model";
import { documentModels as legacyDocumentModels } from "document-model-libs";
import { createClient, RedisClientType } from "redis";
import { describe, it } from "vitest";
import InMemoryCache from "../src/cache/memory";
import {
  addFile,
  addFolder,
} from "../src/drive-document-model/gen/node/creators.js";
import {
  reducer as documentDriveReducer,
  reducer,
} from "../src/drive-document-model/gen/reducer.js";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types.js";
import { generateAddNodeAction } from "../src/drive-document-model/src/utils.js";
import { BaseQueueManager } from "../src/queue/base";
import { RedisQueueManager } from "../src/queue/redis";
import { IQueueManager } from "../src/queue/types";
import { ReactorBuilder } from "../src/server/builder";
import {
  IBaseDocumentDriveServer,
  IOperationResult,
} from "../src/server/types";
import { MemoryStorage } from "../src/storage/memory";
import { buildOperation, buildOperations } from "./utils";

const docModelByName = (name: string) => {
  const docModel = legacyDocumentModels.find((m) => m.name === name);
  if (!docModel) {
    throw new Error(`Document model with name ${name} not found`);
  }
  return docModel;
};

const {
  actions: budgetStatementActions,
  BudgetStatementDocument,
  reducer: budgetStatementReducer,
  utils,
} = docModelByName("budget-statement");

const REDIS_TLS_URL = process.env.REDIS_TLS_URL;

const documentModels = [
  documentModelDocumentModelModule,
] as DocumentModelModule[];

const queueLayers: [string, () => Promise<IQueueManager>][] = [
  ["Memory Queue", () => Promise.resolve(new BaseQueueManager())],
  [
    "Redis Queue",
    async () => {
      const client = await createClient({ url: REDIS_TLS_URL }).connect();
      await client.flushAll();
      return new RedisQueueManager(3, 0, client as RedisClientType);
    },
  ],
] as unknown as [string, () => Promise<IQueueManager>][];

describe.each(queueLayers)(
  "Document Drive Server queuing with %s",
  async (_, buildQueue) => {
    const CREATE_DRIVES = 10;
    const ADD_OPERATIONS_TO_DRIVE = 10;
    let queueValid = false;
    try {
      const testQueue = await buildQueue();
      queueValid = !!testQueue;
    } catch {
      queueValid = false;
    }

    const createDrive = async (server: IBaseDocumentDriveServer) => {
      const driveState = await server.addDrive({
        global: {
          id: generateUUID(),
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

      const drive = await server.getDrive(driveState.state.global.id);
      return drive;
    };

    const addOperationsToDrive = async (
      server: IBaseDocumentDriveServer,
      drive: DocumentDriveDocument,
      queue = true,
    ) => {
      const promisses: Promise<IOperationResult<DocumentDriveDocument>>[] = [];
      for (let i = 0; i < ADD_OPERATIONS_TO_DRIVE; i++) {
        const id = generateUUID();
        drive = reducer(
          drive,
          generateAddNodeAction(
            drive.state.global,
            {
              id,
              name: id,
              documentType: "powerhouse/budget-statement",
            },
            ["global", "local"],
          ),
        );
        promisses.push(
          queue
            ? server.queueDriveOperations(
                drive.state.global.id,
                drive.operations.global,
              )
            : server.addDriveOperations(
                drive.state.global.id,
                drive.operations.global,
              ),
        );
      }
      return Promise.all(promisses);
    };

    it.skipIf(!queueValid)(
      "block document queue until ADD_FILE is processed",
      async ({ expect }) => {
        const server = new ReactorBuilder(documentModels)
          .withStorage(new MemoryStorage())
          .build();
        await server.initialize();
        let drive = await createDrive(server);
        const driveId = drive.state.global.id;
        const driveOperations = buildOperations(reducer, drive, [
          addFolder({ id: "folder 1", name: "folder 1" }),
          addFile({
            id: "file 1",
            name: "file 1",
            parentFolder: "folder 1",
            documentType: "powerhouse/budget-statement",
            synchronizationUnits: [
              { syncId: "1", scope: "global", branch: "main" },
            ],
          }),
        ]);
        let budget = utils.createDocument();
        const budgetOperation = buildOperation(
          budgetStatementReducer,
          budget,
          budgetStatementActions.addAccount({
            address: "0x123",
          }),
        );

        const documentResult = server.queueOperations(driveId, "file 1", [
          budgetOperation,
        ]);
        await expect(
          server.getDocument(driveId, "file 1"),
        ).rejects.toThrowError("Document with id file 1 not found");
        const results = await server.queueDriveOperations(
          driveId,
          driveOperations,
        );

        const errors = [results, await documentResult].filter((r) => !!r.error);
        if (errors.length) {
          errors.forEach((error) => console.error(error));
        }
        expect(errors.length).toBe(0);

        drive = await server.getDrive(driveId);
        expect(drive.state.global.nodes).toStrictEqual([
          expect.objectContaining({
            id: "folder 1",
            name: "folder 1",
            kind: "folder",
            parentFolder: null,
          }),
          expect.objectContaining({
            id: "file 1",
            name: "file 1",
            kind: "file",
            parentFolder: "folder 1",
            documentType: "powerhouse/budget-statement",
            synchronizationUnits: [
              { syncId: "1", scope: "global", branch: "main" },
            ],
          }),
        ]);

        budget = (await server.getDocument(
          driveId,
          "file 1",
        )) as BudgetStatementDocument;
        expect(budget.state.global.accounts).toStrictEqual([
          expect.objectContaining({ address: "0x123" }),
        ]);
      },
    );

    it.skipIf(!queueValid)("orders strands correctly", async ({ expect }) => {
      const queue = await buildQueue();
      const server = new ReactorBuilder(documentModels)
        .withStorage(new MemoryStorage())
        .withCache(new InMemoryCache())
        .withQueueManager(queue)
        .build();
      await server.initialize();
      let drive = await createDrive(server);
      const driveId = drive.state.global.id;
      const driveOperations = buildOperations(reducer, drive, [
        addFolder({ id: "folder 1", name: "folder 1" }),
        addFile({
          id: "file 1",
          name: "file 1",
          parentFolder: "folder 1",
          documentType: "powerhouse/budget-statement",
          synchronizationUnits: [
            { syncId: "1", scope: "global", branch: "main" },
          ],
        }),
      ]);
      let budget = utils.createDocument();
      const budgetOperation = buildOperation(
        budgetStatementReducer,
        budget,
        budgetStatementActions.addAccount({
          address: "0x123",
        }),
      );

      const results = await Promise.all([
        server.queueOperations(driveId, "file 1", [budgetOperation]),
        server.queueDriveOperations(driveId, driveOperations),
        server.queueDriveOperations(driveId, [
          buildOperation(
            reducer,
            drive,
            addFolder({
              id: "folder 2",
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
      expect(drive.state.global.nodes).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "folder 1",
            name: "folder 1",
            kind: "folder",
            parentFolder: null,
          }),
          expect.objectContaining({
            id: "file 1",
            name: "file 1",
            kind: "file",
            parentFolder: "folder 1",
            documentType: "powerhouse/budget-statement",
            synchronizationUnits: [
              { syncId: "1", scope: "global", branch: "main" },
            ],
          }),
          expect.objectContaining({
            id: "folder 2",
            name: "folder 2",
            kind: "folder",
            parentFolder: null,
          }),
        ]),
      );

      // add file 1 operation has to be processed after add folder 1
      expect(
        drive.state.global.nodes.findIndex((n) => n.id === "file 1"),
      ).toBeGreaterThan(
        drive.state.global.nodes.findIndex((n) => n.id === "folder 1"),
      );

      budget = (await server.getDocument(
        driveId,
        "file 1",
      )) as BudgetStatementDocument;
      expect(budget.state.global.accounts).toStrictEqual([
        expect.objectContaining({ address: "0x123" }),
      ]);
    });

    it.skipIf(!queueValid)(
      "it blocks a document queue when the drive queue processes a delete node operation",
      async ({ expect }) => {
        const queue = await buildQueue();
        const server = new ReactorBuilder(documentModels)
          .withStorage(new MemoryStorage())
          .withCache(new InMemoryCache())
          .withQueueManager(queue)
          .build();
        await server.initialize();
        let drive = await createDrive(server);
        const driveId = drive.state.global.id;

        const budget = utils.createDocument();

        // first doc op
        const budgetOperation = buildOperation(
          budgetStatementReducer,
          budget,
          budgetStatementActions.addAccount({
            address: "0x123",
          }),
        );

        // second doc op
        const budgetOperation2 = buildOperation(
          budgetStatementReducer,
          budget,
          budgetStatementActions.addAccount({
            address: "0x123456",
          }),
        );

        // add file op
        const driveOperations = buildOperations(reducer, drive, [
          addFile({
            id: "file 1",
            name: "file 1",
            parentFolder: "folder 1",
            documentType: "powerhouse/budget-statement",
            synchronizationUnits: [
              { syncId: "1", scope: "global", branch: "main" },
            ],
          }),
        ]);

        // queue addFile and first doc op
        const results1 = await Promise.all([
          server.queueDriveOperations(driveId, driveOperations),
          server.queueOperations(driveId, "file 1", [budgetOperation]),
        ]);

        const errors = results1
          .flat()
          .filter((r) => !!(r as IOperationResult).error);
        if (errors.length) {
          errors.forEach((error) => console.error(error));
        }

        // delete node op
        drive = await server.getDrive(driveId);
        const deleteNodeOps = buildOperations(documentDriveReducer, drive, [
          deleteNode({ id: "file 1" }),
        ]);

        // queue delete node op
        await server.queueDriveOperations(driveId, deleteNodeOps);
        // ==> receives deleteNode and addFile operation?

        await expect(
          server.queueOperations(driveId, "file 1", [budgetOperation2]),
        ).rejects.toThrowError("Queue is deleted");

        drive = await server.getDrive(driveId);
        expect(drive.state.global.nodes).toStrictEqual([]);
      },
    );

    it.skipIf(!queueValid)(
      "produces error on addDriveOperations with wrong index",
      async ({ expect }) => {
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
            return addOperationsToDrive(server, drive, false);
          }),
        );

        expect(
          driveResults.flat().filter((f) => f.status === "ERROR").length,
        ).toBeGreaterThan(0);
      },
    );

    it.skipIf(!queueValid)(
      "produces no errors on queueDriveOperations",
      async ({ expect }) => {
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
            return addOperationsToDrive(server, drive);
          }),
        );
        expect(
          driveResults.flat().filter((f) => f.status !== "SUCCESS").length,
        ).toBe(0);
      },
    );

    it.skipIf(!queueValid)(
      "adds operations with queueDriveAction",
      async ({ expect }) => {
        const queue = await buildQueue();
        const server = new ReactorBuilder(documentModels)
          .withStorage(new MemoryStorage())
          .withCache(new InMemoryCache())
          .withQueueManager(queue)
          .build();
        await server.initialize();
        const drive = await createDrive(server);
        const driveId = drive.state.global.id;
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

        expect(drive2.state.local.listeners.length).toBe(1);
      },
    );
  },
);
