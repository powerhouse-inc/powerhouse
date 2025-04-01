import { DocumentModelModule } from "document-model";
import { beforeAll, describe, it } from "vitest";
import { ReactorBuilder } from "../../src";
import InMemoryCache from "../../src/cache/memory.js";
import type { IDocumentDriveServer } from "../../src/server/base.js";
import { PrismaStorage } from "../../src/storage/prisma.js";
import { PrismaClient } from "../src/storage/prisma/client";

const prismaClient = new PrismaClient();
const cache = new InMemoryCache();

describe("Document operations", () => {
  const documentModels = [
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule[];

  const storage = new PrismaStorage(prismaClient, cache);
  let server: IDocumentDriveServer;

  beforeAll(async () => {
    server = new ReactorBuilder(documentModels)
      .withStorage(storage)
      .withCache(cache)
      .build();
    await server.initialize();
    if ((await server.getDrives()).includes("test")) {
      await server.deleteDrive("test");
    }
    await server.addDrive({ global: { id: "test" } });
    return () => server.deleteDrive("test");
  });

  it("should store resultingState", async ({ expect }) => {
    const result = await server.addDriveAction(
      "test",
      actions.addFolder({
        id: "folder1",
        name: "folder1",
      }),
    );
    expect(result.error).toBeUndefined();
    const driveStorage = await storage.getDrive("test");
    expect(
      JSON.parse(
        driveStorage.operations.global.at(-1)?.resultingState as string,
      ),
    ).toStrictEqual({
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

  it("should retrieve only the last resultingState", async ({ expect }) => {
    await server.addDriveAction(
      "test",
      actions.addFolder({
        id: "folder2",
        name: "folder2",
      }),
    );

    const driveStorage = await storage.getDrive("test");
    expect(
      JSON.parse(
        driveStorage.operations.global.at(-1)?.resultingState as string,
      ),
    ).toStrictEqual({
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
        {
          id: "folder2",
          kind: "folder",
          name: "folder2",
          parentFolder: null,
        },
      ],
      slug: null,
    });

    expect(
      driveStorage.operations.global.at(0)?.resultingState,
    ).toBeUndefined();
  });

  it("should retrieve only the last resultingState", async ({ expect }) => {
    const drive = await server.getDrive("test");
    expect(drive.state.global).toStrictEqual({
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
        {
          id: "folder2",
          kind: "folder",
          name: "folder2",
          parentFolder: null,
        },
      ],
      slug: null,
    });
  });

  it("should retrieve operation attachment", async ({ expect }) => {
    const result = await server.addDriveAction("test", {
      ...actions.addFolder({
        id: "folder3",
        name: "folder3",
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
        extension: null,
        filename: null,
      },
    ]);
  });

  it("should retrieve resultingState for last unskipped operation", async ({
    expect,
  }) => {
    const driveStorage = await storage.getDrive("test");
    expect(driveStorage.operations.global.length).toBe(3);
    expect(
      JSON.parse(
        driveStorage.operations.global.at(2)?.resultingState as string,
      ),
    ).toStrictEqual({
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
        {
          id: "folder2",
          kind: "folder",
          name: "folder2",
          parentFolder: null,
        },
        {
          id: "folder3",
          kind: "folder",
          name: "folder3",
          parentFolder: null,
        },
      ],
      slug: null,
    });
    expect(
      driveStorage.operations.global.at(1)?.resultingState,
    ).toBeUndefined();
    const result = await server.addDriveOperation(
      "test",

      {
        ...actions.noop(),
        skip: 1,
        index: 3,
        hash: driveStorage.operations.global.at(1)?.hash,
      },
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
    expect(driveStorage.operations.global.length).toBe(3);
    expect(
      result.document?.operations.global.at(2)?.resultingState,
    ).toStrictEqual(resultingState);
    expect(
      JSON.parse(
        result.document?.operations.global.at(1)?.resultingState as string,
      ),
    ).toStrictEqual(resultingState);
  });
});
