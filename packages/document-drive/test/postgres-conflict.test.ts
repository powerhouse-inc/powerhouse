/* eslint-disable @typescript-eslint/unbound-method */
import { Prisma, PrismaClient } from "@prisma/client";
import * as Budget from "document-model-libs/budget-statement";
import { utils } from "document-model-libs/document-drive";
import { DocumentHeader, Operation, State } from "document-model/document";
import { setTimeout } from "node:timers/promises";
import { beforeAll, describe, it, vi } from "vitest";
import { generateUUID } from "../src";
import { PrismaStorage } from "../src/storage/prisma";
import { DocumentStorage } from "../src/storage/types";
import { buildOperationAndDocument } from "./utils";

describe("Storage with cache proxy", () => {
  const client = new PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel>({
    log: ["error"],
  });
  const storage = new PrismaStorage(client);
  const DRIVE_ID = "postgres-conflict-test";

  beforeAll(async () => {
    const drives = await storage.getDrives();
    if (drives.includes(DRIVE_ID)) {
      await storage.deleteDrive(DRIVE_ID);
    }
    const newDrive = utils.createDocument();
    await storage.createDrive(DRIVE_ID, newDrive);
  });

  it("should not have conflict on operations for two separate documents", async ({
    expect,
  }) => {
    await storage.createDocument(
      DRIVE_ID,
      "doc1",
      Budget.utils.createDocument(),
      [{ syncId: "1", scope: "global", branch: "main" }]
    );
    await storage.createDocument(
      DRIVE_ID,
      "doc2",
      Budget.utils.createDocument(),
      [{ syncId: "2", scope: "global", branch: "main" }]
    );

    async function callback(documentStorage: DocumentStorage): Promise<{
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    }> {
      const { document, operation } = buildOperationAndDocument(
        Budget.reducer,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        Budget.utils.createDocument(documentStorage as any),
        Budget.actions.addAccount({ address: "0x123" })
      );
      await setTimeout(100);
      operation.id = generateUUID();
      operation.resultingState = document.state[operation.scope];
      return Promise.resolve({
        header: document,
        operations: [operation],
        newState: document.state,
      });
    }

    const callbackSpy = vi.fn(callback);

    let prismaError: Prisma.LogEvent | undefined;
    client.$on("error", (error) => {
      prismaError = error;
    });

    const results = await Promise.all([
      storage.addDocumentOperationsWithTransaction(
        DRIVE_ID,
        "doc1",
        callbackSpy
      ),
      storage.addDocumentOperationsWithTransaction(
        DRIVE_ID,
        "doc2",
        callbackSpy
      ),
    ]);

    expect(prismaError).toBeUndefined();
    expect(callbackSpy).toBeCalledTimes(2);
    expect(results.map((r) => r.newState.global.accounts)).toEqual([
      [
        {
          address: "0x123",
          lineItems: [],
          name: "",
        },
      ],
      [
        {
          address: "0x123",
          lineItems: [],
          name: "",
        },
      ],
    ]);
  });

  it("should have conflict on operations for the same document", async ({
    expect,
  }) => {
    await storage.createDocument(
      DRIVE_ID,
      "doc3",
      Budget.utils.createDocument(),
      [{ syncId: "3", scope: "global", branch: "main" }]
    );

    let accountId = 1;
    async function callback(documentStorage: DocumentStorage): Promise<{
      operations: Operation[];
      header: DocumentHeader;
      newState?: State<any, any> | undefined;
    }> {
      const oldDocument = documentStorage.operations.global.reduce(
        (doc, op) =>
          Budget.reducer(doc, op as unknown as Budget.BudgetStatementAction),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        Budget.utils.createDocument(documentStorage as any)
      );
      const { document, operation } = buildOperationAndDocument(
        Budget.reducer,
        oldDocument,
        Budget.actions.addAccount({ address: accountId.toString() }),
        documentStorage.operations.global.length
      );
      accountId++;
      operation.id = generateUUID();
      operation.resultingState = document.state[operation.scope];
      return Promise.resolve({
        header: document,
        operations: [operation],
        newState: document.state,
      });
    }

    const callbackSpy = vi.fn(callback);

    let prismaError: Prisma.LogEvent | undefined;
    client.$on("error", (error) => {
      prismaError = error;
    });

    const results = await Promise.all([
      storage.addDocumentOperationsWithTransaction(
        DRIVE_ID,
        "doc3",
        callbackSpy
      ),
      storage.addDocumentOperationsWithTransaction(
        DRIVE_ID,
        "doc3",
        callbackSpy
      ),
    ]);

    expect(prismaError).toBeDefined();
    expect(
      prismaError?.message.includes(
        "An operation failed because it depends on one or more records that were required but not found."
      )
    ).toBe(true);
    expect(callbackSpy).toBeCalledTimes(3);

    const resultAddresses = results.map((r) =>
      r.newState.global.accounts.map((a) => a.address)
    );
    const possibleMatches = [
      // depends which operation was saved first
      [["1"], ["1", "3"]],
      [["1", "3"], ["1"]],
    ];
    expect(possibleMatches).toContainEqual(resultAddresses);
  });
});
