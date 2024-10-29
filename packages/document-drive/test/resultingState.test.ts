import { PrismaClient } from "@prisma/client";
import { actions } from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { beforeAll, describe, it } from "vitest";
import { BaseDocumentDriveServer, DocumentDriveServer } from "../src";
import { PrismaStorage } from "../src/storage/prisma";

const prismaClient = new PrismaClient();

describe("Document operations", () => {
  const documentModels = [
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModel[];

  const storage = new PrismaStorage(prismaClient);
  let server: BaseDocumentDriveServer;

  beforeAll(async () => {
    server = new DocumentDriveServer(documentModels, storage);
    await server.initialize();
    if ((await server.getDrives()).includes("test")) {
      await server.deleteDrive("test");
    }
    await server.addDrive({
      global: { id: "test", icon: "", name: "", slug: "test" },
      local: {
        availableOffline: false,
        listeners: [],
        sharingType: "none",
        triggers: [],
      },
    });
    return () => server.deleteDrive("test");
  });

  it("should store resultingState", async ({ expect }) => {
    const result = await server.addDriveAction(
      "test",
      actions.addFolder({
        id: "folder1",
        name: "folder1",
      })
    );
    expect(result.error).toBeUndefined();
    const resultingState = await storage.getDriveOperationResultingState(
      "test",
      0,
      "global",
      "main"
    );
    expect(JSON.parse(resultingState as string)).toStrictEqual({
      icon: null,
      id: "test",
      name: "",
      nodes: [
        {
          id: "folder1",
          kind: "folder",
          name: "folder1",
          parentFolder: null,
        },
      ],
      slug: null,
    });
  });

  it("should retrieve operation attachment", async ({ expect }) => {
    const result = await server.addDriveAction("test", {
      ...actions.addFolder({
        id: "folder2",
        name: "folder2",
      }),
      attachments: [{ data: "test", mimeType: "text", hash: "123" }],
    });
    expect(result.error?.message).toBeUndefined();
    const driveStorage = await storage.getDrive("test");
    expect(driveStorage.operations.global.at(-1)?.attachments).toMatchObject([
      {
        data: "test",
        mimeType: "text",
        hash: "123",
      },
    ]);
  });

  it("should retrieve resultingState for last unskipped operation", async ({
    expect,
  }) => {
    const driveStorage = await storage.getDrive("test");
    expect(driveStorage.operations.global.length).toBe(2);

    const result = await server.addDriveOperation(
      "test",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      {
        ...actions.noop(),
        skip: 1,
        index: 3,
        hash: driveStorage.operations.global.at(1)?.hash,
      }
    );

    expect(result.error).toBeUndefined();
    const resultingState = {
      id: "test",
      name: "",
      nodes: [
        {
          id: "folder1",
          name: "folder1",
          kind: "folder",
          parentFolder: null,
        },
        {
          id: "folder2",
          name: "folder2",
          kind: "folder",
          parentFolder: null,
        },
      ],
      icon: null,
      slug: null,
    };
    expect(result.document?.state.global).toStrictEqual(resultingState);
    expect(driveStorage.operations.global.length).toBe(2);

    const resultingState1 = await storage.getDriveOperationResultingState(
      "test",
      1,
      "global",
      "main"
    );
    const resultingState2 = await storage.getDriveOperationResultingState(
      "test",
      3,
      "global",
      "main"
    );
    expect(resultingState1).toStrictEqual(resultingState2);
    expect(resultingState1).toStrictEqual(JSON.stringify(resultingState));
  });
});
