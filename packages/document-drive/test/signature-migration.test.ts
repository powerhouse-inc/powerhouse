import { DocumentDriveDocument } from "#drive-document-model/gen/types";
import { ActionContext, Operation, generateId } from "document-model";
import { beforeEach, describe, it } from "vitest";
import { addFile } from "../src/drive-document-model/gen/creators.js";
import { reducer } from "../src/drive-document-model/gen/reducer.js";
import { createDocument } from "../src/drive-document-model/gen/utils.js";
import { BrowserStorage } from "../src/storage/browser.js";
import { PrismaClient } from "../src/storage/prisma/client/index.js";
import { migrateLegacyOperationSignature } from "../src/utils/migrations.js";
import { buildOperation, createBaseState } from "./utils.js";

const prismaClient = new PrismaClient();

const storageLayers = [
  [
    "BrowserStorage",
    async () => {
      const storage = new BrowserStorage();
      await storage.clear();
      return storage;
    },
  ],
  //["PrismaStorage", () => new PrismaStorage(prismaClient, new InMemoryCache())],
] as const;

describe("Signature migration", () => {
  it("should migrate signature", ({ expect }) => {
    const operation = {
      index: 0,
      type: "TEST",
      input: { test: "test" },
      id: "123",
      scope: "global",
      hash: "hash",
      skip: 1,
      resultingState: {},
      action: {
        type: "TEST",
        input: { test: "test" },
        context: {
          signer: {
            app: {
              name: "name",
              key: "key",
            },
            user: {
              address: "address",
              chainId: 1,
              networkId: "1",
            },
            signature: "0x456",
          },
        },
      },
    };

    const newOperation = migrateLegacyOperationSignature(
      operation as unknown as Operation,
    );
    expect(newOperation).toStrictEqual({
      index: 0,
      type: "TEST",
      input: { test: "test" },
      id: "123",
      scope: "global",
      hash: "hash",
      skip: 1,
      resultingState: {},
      action: {
        type: "TEST",
        input: { test: "test" },
        context: {
          signer: {
            app: {
              name: "name",
              key: "key",
            },
            user: {
              address: "address",
              chainId: 1,
              networkId: "1",
            },
            signatures: ["0x456"],
          },
        },
      },
      context: {
        signer: {
          app: {
            name: "name",
            key: "key",
          },
          user: {
            address: "address",
            chainId: 1,
            networkId: "1",
          },
          signatures: ["0x456"],
        },
      },
    });
  });
});

describe.each(storageLayers)(
  "should migrate operations in %s",
  async (_storageName, buildStorage) => {
    const driveId = generateId();
    beforeEach(async () => {
      //const storage = storageLayers[1][1]();
      //return storage.deleteDrive(driveId);
    });

    it("should migrate operation without context", async ({ expect }) => {
      const storage = await buildStorage();
      const drive = createDocument({
        state: createBaseState(
          {
            icon: null,
            name: "name",
            nodes: [],
          },
          {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        ),
      });
      drive.header.id = driveId;
      drive.header.slug = driveId;
      drive.header.name = "name";
      await storage.create(drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
        }),
      );
      expect(driveOperation.action?.context).toBeUndefined();

      await storage.addDriveOperations(driveId, [driveOperation], drive);

      const storedDrive = await storage.get<DocumentDriveDocument>(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.get<DocumentDriveDocument>(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(
        storedDrive.operations.global.map((o: any) => o.context),
      ).toStrictEqual([undefined]);
    });

    it("should migrate operation with empty string signature", async ({
      expect,
    }) => {
      const storage = await buildStorage();
      const drive = createDocument({
        state: createBaseState(
          {
            icon: null,
            name: "name",
            nodes: [],
          },
          {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        ),
      });
      drive.header.id = driveId;
      drive.header.name = "name";

      await storage.create(drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
        }),
      );
      driveOperation.action!.context = {
        signer: {
          app: {
            name: "name",
            key: "key",
          },
          user: {
            address: "address",
            chainId: 1,
            networkId: "1",
          },
          signatures: [""],
        },
      } as unknown as ActionContext;

      await storage.addDriveOperations(driveId, [driveOperation], drive);

      const storedDrive = await storage.get<DocumentDriveDocument>(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.get<DocumentDriveDocument>(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(
        migratedDrive.operations.global.map((o: any) => o.context),
      ).toStrictEqual([
        {
          signer: {
            app: {
              name: "name",
              key: "key",
            },
            user: {
              address: "address",
              chainId: 1,
              networkId: "1",
            },
            signatures: [],
          },
        },
      ]);
    });

    it("should migrate operation with a signature", async ({ expect }) => {
      const storage = await buildStorage();
      const drive = createDocument({
        state: createBaseState(
          {
            icon: null,
            name: "name",
            nodes: [],
          },
          {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        ),
      });
      drive.header.id = driveId;
      drive.header.slug = driveId;
      drive.header.name = "name";
      await storage.create(drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
        }),
      );
      driveOperation.action!.context = {
        signer: {
          app: {
            name: "name",
            key: "key",
          },
          user: {
            address: "address",
            chainId: 1,
            networkId: "1",
          },
          signature: "0x123",
        },
      } as unknown as ActionContext;

      await storage.addDriveOperations(driveId, [driveOperation], drive);

      const storedDrive = await storage.get<DocumentDriveDocument>(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.get<DocumentDriveDocument>(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(
        migratedDrive.operations.global.map((o: any) => o.context),
      ).toStrictEqual([
        {
          signer: {
            app: {
              name: "name",
              key: "key",
            },
            user: {
              address: "address",
              chainId: 1,
              networkId: "1",
            },
            signatures: ["0x123"],
          },
        },
      ]);
    });
  },
);
