import { PrismaClient } from "@prisma/client";
import { actions, reducer, utils } from "document-model-libs/document-drive";
import { ActionContext, Operation } from "document-model/document";
import { beforeEach, describe, it } from "vitest";
import { generateUUID } from "../src";
import { BrowserStorage } from "../src/storage/browser";
import { PrismaStorage } from "../src/storage/prisma";
import { migrateLegacyOperationSignature } from "../src/utils/migrations";
import { buildOperation } from "./utils";

const prismaClient = new PrismaClient();

const storageLayers = [
  ["BrowserStorage", () => new BrowserStorage()],
  ["PrismaStorage", () => new PrismaStorage(prismaClient)],
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
          signature: null,
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
          signatures: [],
        },
      },
    });
  });
});

describe.each(storageLayers)(
  "should migrate operations in %s",
  async (_storageName, buildStorage) => {
    const driveId = generateUUID();
    beforeEach(async () => {
      const storage = storageLayers[1][1]();
      return storage.deleteDrive(driveId);
    });

    it("should migrate operation without context", async ({ expect }) => {
      const storage = buildStorage();
      const drive = utils.createDocument({
        state: {
          global: {
            icon: null,
            id: driveId,
            name: "name",
            nodes: [],
            slug: null,
          },
          local: {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        },
      });
      await storage.createDrive(driveId, drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        actions.addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
          synchronizationUnits: [],
        }),
      );
      expect(driveOperation.context).toBeUndefined();

      await storage.addDriveOperations(driveId, [driveOperation], drive);

      const storedDrive = await storage.getDrive(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.getDrive(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(storedDrive.operations.global.map((o) => o.context)).toStrictEqual(
        [undefined],
      );
    });

    it("should migrate operation with empty string signature", async ({
      expect,
    }) => {
      const storage = buildStorage();
      const drive = utils.createDocument({
        state: {
          global: {
            icon: null,
            id: driveId,
            name: "name",
            nodes: [],
            slug: null,
          },
          local: {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        },
      });
      await storage.createDrive(driveId, drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        actions.addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
          synchronizationUnits: [],
        }),
      );
      driveOperation.context = {
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
          signature: "",
        },
      } as unknown as ActionContext;

      await storage.addDriveOperations(driveId, [driveOperation], drive);

      const storedDrive = await storage.getDrive(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.getDrive(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(
        migratedDrive.operations.global.map((o) => o.context),
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
      const storage = buildStorage();
      const drive = utils.createDocument({
        state: {
          global: {
            icon: null,
            id: driveId,
            name: "name",
            nodes: [],
            slug: null,
          },
          local: {
            availableOffline: false,
            listeners: [],
            sharingType: null,
          },
        },
      });
      await storage.createDrive(driveId, drive);

      const driveOperation = buildOperation(
        reducer,
        drive,
        actions.addFile({
          id: "1.1",
          name: "Test",
          documentType: "powerhouse/budget-statement",
          synchronizationUnits: [],
        }),
      );
      driveOperation.context = {
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

      const storedDrive = await storage.getDrive(driveId);

      await storage.migrateOperationSignatures();
      const migratedDrive = await storage.getDrive(driveId);

      expect(storedDrive.operations.global.length).toEqual(
        migratedDrive.operations.global.length,
      );

      expect(
        migratedDrive.operations.global.map((o) => o.context),
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
