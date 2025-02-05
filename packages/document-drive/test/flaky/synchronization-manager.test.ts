import { Operation, PrismaClient } from "@prisma/client";
import * as DocumentDrive from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModelModule } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocumentDriveServer,
  PullResponderTransmitter,
  generateUUID,
} from "../src";
import InMemoryCache from "../src/cache/memory";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaStorage } from "../src/storage/prisma";
import {
  buildOperation,
  buildOperations,
  expectUTCTimestamp,
  expectUUID,
} from "./utils";

describe("Synchronization Units", () => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule[];

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("MemoryStorage", () => {
    it("should return drive synchronizationUnit", async () => {
      const storage = new MemoryStorage();
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });

      const storageSpy = vi.spyOn(storage, "getDrive");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const syncUnits = await server.getSynchronizationUnits("1");
      expect(syncUnits).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(1);
      expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    it("should return all synchronizationUnits", async () => {
      const storage = new MemoryStorage();
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      const getDocumentSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const syncUnits = await server.getSynchronizationUnits("1");
      expect(syncUnits).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 0,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
      ]);
      expect(getDocumentSpy).toHaveBeenCalledTimes(2);
      expect(cacheSpy).toHaveBeenCalledTimes(1);

      drive = await server.getDrive("1");
      expect(cacheSpy).toHaveBeenCalledTimes(2);
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "2",
              name: "test2",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      const syncUnits2 = await server.getSynchronizationUnits("1");
      expect(syncUnits2).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "2",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "2",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
      ]);
      expect(getDocumentSpy).toHaveBeenCalledTimes(6);
      expect(cacheSpy).toHaveBeenCalledTimes(6);
    });

    it("should return transmitter strands", async () => {
      const storage = new MemoryStorage();
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");
      const result = await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          result.document,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.actions.addListener({
            listener: {
              block: false,
              callInfo: {
                data: "",
                name: "PullResponder",
                transmitterType: "PullResponder",
              },
              filter: {
                branch: ["*"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global"],
              },
              label: `Pullresponder #3`,
              listenerId: "listenerId",
              system: false,
            },
          }),
        ),
      );
      const revisions = await storage.getSynchronizationUnitsRevision([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          documentType: "",
          syncId: "",
        },
        {
          driveId: "1",
          documentId: "1",
          scope: "global",
          branch: "main",
          documentType: "",
          syncId: "",
        },
      ]);

      expect(revisions).toStrictEqual([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 1,
        },
      ]);

      const transmitter = (await server.getTransmitter(
        "1",
        "listenerId",
      )) as PullResponderTransmitter;
      const storageSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const strands = await transmitter.getStrands();
      expect(strands).toStrictEqual([
        {
          branch: "main",
          documentId: "",
          driveId: "1",
          scope: "global",
          operations: [
            expect.objectContaining({ index: 0, type: "ADD_FILE" }),
            expect.objectContaining({ index: 1, type: "ADD_FILE" }),
          ],
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(1);
      expect(cacheSpy).toHaveBeenCalledTimes(2);
    });

    it("should db query for each document", async () => {
      const storage = new MemoryStorage();
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");
      const operations = buildOperations(
        DocumentDrive.reducer,
        drive,
        new Array(100).fill("").map((_, i) =>
          DocumentDrive.actions.addFile({
            id: `file-${i}`,
            name: `test-${i}`,
            documentType: "powerhouse/document-model",
            synchronizationUnits: [
              {
                syncId: generateUUID(),
                branch: "main",
                scope: "global",
              },
            ],
          }),
        ),
      );
      const result = await server.addDriveOperations("1", operations);
      expect(result.status).toBe("SUCCESS");

      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          result.document,
          DocumentDrive.actions.addListener({
            listener: {
              block: false,
              callInfo: {
                data: "",
                name: "PullResponder",
                transmitterType: "PullResponder",
              },
              filter: {
                branch: ["*"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global"],
              },
              label: `Pullresponder #3`,
              listenerId: "listenerId",
              system: false,
            },
          }),
        ),
      );

      const revisions = await storage.getSynchronizationUnitsRevision([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          documentType: "powerhouse/document-drive",
          syncId: "0",
        },
      ]);

      expect(revisions).toStrictEqual([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 99,
        },
      ]);

      const transmitter = (await server.getTransmitter(
        "1",
        "listenerId",
      )) as PullResponderTransmitter;
      const storageSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const strands = await transmitter.getStrands();
      expect(strands).toStrictEqual([
        {
          branch: "main",
          documentId: "",
          driveId: "1",
          scope: "global",
          operations: new Array(100).fill(null).map(
            (_, i) =>
              expect.objectContaining({
                index: i,
                type: "ADD_FILE",
              }) as Operation,
          ),
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(100);
      expect(cacheSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("PrismaStorage", () => {
    beforeEach(async () => {
      const storage = new PrismaStorage(new PrismaClient());
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();
      if ((await server.getDrives()).includes("1")) {
        await server.deleteDrive("1");
      }
    });

    it("should return drive synchronizationUnit", async () => {
      const storage = new PrismaStorage(new PrismaClient());
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });

      const storageSpy = vi.spyOn(storage, "getDrive");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const syncUnits = await server.getSynchronizationUnits("1");
      expect(syncUnits).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(0);
      expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    it("should return all synchronizationUnits", async () => {
      const storage = new PrismaStorage(new PrismaClient());
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      let drive = await server.getDrive("1");
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      const getDocumentSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const syncUnits = await server.getSynchronizationUnits("1");
      expect(syncUnits).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: expectUTCTimestamp(expect),
          revision: 0,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
      ]);
      expect(getDocumentSpy).toHaveBeenCalledTimes(0);
      expect(cacheSpy).toHaveBeenCalledTimes(1);

      drive = await server.getDrive("1");
      expect(cacheSpy).toHaveBeenCalledTimes(2);
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "2",
              name: "test2",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      const syncUnits2 = await server.getSynchronizationUnits("1");
      expect(syncUnits2).toStrictEqual([
        {
          syncId: "0",
          branch: "main",
          documentId: "",
          documentType: "powerhouse/document-drive",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "1",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "2",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "global",
        },
        {
          syncId: expectUUID(expect),
          branch: "main",
          documentId: "2",
          documentType: "powerhouse/document-model",
          driveId: "1",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: -1,
          scope: "local",
        },
      ]);
      expect(getDocumentSpy).toHaveBeenCalledTimes(1);
      expect(cacheSpy).toHaveBeenCalledTimes(7);
    });

    it("should return transmitter strands", async () => {
      const storage = new PrismaStorage(new PrismaClient());
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");
      const result = await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );
      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          result.document,
          DocumentDrive.utils.generateAddNodeAction(
            drive.state.global,
            {
              id: "1",
              name: "test",
              documentType: "powerhouse/document-model",
            },
            ["global", "local"],
          ),
        ),
      );

      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          drive,
          DocumentDrive.actions.addListener({
            listener: {
              block: false,
              callInfo: {
                data: "",
                name: "PullResponder",
                transmitterType: "PullResponder",
              },
              filter: {
                branch: ["*"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global"],
              },
              label: `Pullresponder #3`,
              listenerId: "listenerId",
              system: false,
            },
          }),
        ),
      );
      const revisions = await storage.getSynchronizationUnitsRevision([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          documentType: "",
          syncId: "",
        },
        {
          driveId: "1",
          documentId: "1",
          scope: "global",
          branch: "main",
          documentType: "",
          syncId: "",
        },
      ]);

      expect(revisions).toStrictEqual([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 1,
        },
      ]);

      const transmitter = (await server.getTransmitter(
        "1",
        "listenerId",
      )) as PullResponderTransmitter;
      const storageSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const strands = await transmitter.getStrands();
      expect(strands).toStrictEqual([
        {
          branch: "main",
          documentId: "",
          driveId: "1",
          scope: "global",
          operations: [
            expect.objectContaining({ index: 0, type: "ADD_FILE" }),
            expect.objectContaining({ index: 1, type: "ADD_FILE" }),
          ],
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(0);
      expect(cacheSpy).toHaveBeenCalledTimes(2);
    });

    it("should make single db query for all documents", async () => {
      const storage = new PrismaStorage(new PrismaClient());
      const cache = new InMemoryCache();
      const server = new DocumentDriveServer(documentModels, storage, cache);
      await server.initialize();

      await server.addDrive({
        global: { id: "1", name: "test", icon: null, slug: null },
        local: {
          availableOffline: false,
          sharingType: "PRIVATE",
          listeners: [],
          triggers: [],
        },
      });
      const drive = await server.getDrive("1");
      const operations = buildOperations(
        DocumentDrive.reducer,
        drive,
        new Array(100).fill("").map((_, i) =>
          DocumentDrive.actions.addFile({
            id: `file-${i}`,
            name: `test-${i}`,
            documentType: "powerhouse/document-model",
            synchronizationUnits: [
              {
                syncId: generateUUID(),
                branch: "main",
                scope: "global",
              },
            ],
          }),
        ),
      );
      const result = await server.addDriveOperations("1", operations);
      expect(result.status).toBe("SUCCESS");

      await server.addDriveOperation(
        "1",
        buildOperation(
          DocumentDrive.reducer,
          result.document,
          DocumentDrive.actions.addListener({
            listener: {
              block: false,
              callInfo: {
                data: "",
                name: "PullResponder",
                transmitterType: "PullResponder",
              },
              filter: {
                branch: ["*"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global"],
              },
              label: `Pullresponder #3`,
              listenerId: "listenerId",
              system: false,
            },
          }),
        ),
      );

      const revisions = await storage.getSynchronizationUnitsRevision([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          documentType: "powerhouse/document-drive",
          syncId: "0",
        },
      ]);

      expect(revisions).toStrictEqual([
        {
          driveId: "1",
          documentId: "",
          scope: "global",
          branch: "main",
          lastUpdated: "2024-01-01T00:00:00.000Z",
          revision: 99,
        },
      ]);

      const transmitter = (await server.getTransmitter(
        "1",
        "listenerId",
      )) as PullResponderTransmitter;
      const storageSpy = vi.spyOn(storage, "getDocument");
      const cacheSpy = vi.spyOn(cache, "getDocument");
      const strands = await transmitter.getStrands();
      expect(strands).toStrictEqual([
        {
          branch: "main",
          documentId: "",
          driveId: "1",
          scope: "global",
          operations: new Array(100).fill(null).map(
            (_, i) =>
              expect.objectContaining({
                index: i,
                type: "ADD_FILE",
              }) as Operation,
          ),
        },
      ]);
      expect(storageSpy).toHaveBeenCalledTimes(0);
      expect(cacheSpy).toHaveBeenCalledTimes(2);
    });
  });
});
