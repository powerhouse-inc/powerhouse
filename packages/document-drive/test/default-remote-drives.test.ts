import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  generateId,
} from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DocumentDriveDocument } from "../src/drive-document-model/gen/types.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { ReactorBuilder } from "../src/server/builder.js";
import {
  type DefaultRemoteDriveInput,
  type DocumentDriveServerOptions,
} from "../src/server/types.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { type DriveInfo } from "../src/utils/graphql.js";

type DriveInput = {
  url: string;
  id: string;
};
const drive1: DriveInput = {
  url: "https://test.com/d/drive1",
  id: "drive1",
};

const drive2: DriveInput = {
  url: "https://test.com/d/drive2",
  id: "drive2",
};

const drive3: DriveInput = {
  url: "https://test.com/d/drive3",
  id: "drive3",
};

const drive4: DriveInput = {
  url: "https://test.com/d/drive4",
  id: "drive4",
};

const generateDrive = (id: string) => ({
  url: `https://test.com/d/${id}`,
  id: id,
  name: `Drive ${id}`,
  icon: undefined,
  slug: id,
});

const driveMetadataByUrl: Record<string, DriveInfo> = {
  [drive1.url]: {
    id: drive1.id,
    name: "Drive1",
    icon: undefined,
    slug: "drive1",
  },
  [drive2.url]: {
    id: drive2.id,
    name: "Drive2",
    icon: undefined,
    slug: "drive2",
  },
  [drive3.url]: {
    id: drive3.id,
    name: "Drive3",
    icon: undefined,
    slug: "drive3",
  },
  [drive4.url]: {
    id: drive4.id,
    name: "Drive4",
    icon: undefined,
    slug: "drive4",
  },
};
const getDefaultRemoteDriveInput = (
  drive: DriveInput,
): DefaultRemoteDriveInput => ({
  url: drive.url,
  options: {
    accessLevel: "WRITE",
    sharingType: "PUBLIC",
    availableOffline: true,
    listeners: [
      {
        block: true,
        callInfo: {
          data: drive.url,
          name: "switchboard-push",
          transmitterType: "SwitchboardPush",
        },
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: ["*"],
          scope: ["global"],
        },
        label: "Switchboard Sync",
        listenerId: "1",
        system: true,
      },
    ],
    triggers: [],
  },
});

vi.mock(import("graphql-request"), async () => {
  const originalModule = await vi.importActual("graphql-request");

  return {
    ...originalModule,
    GraphQLClient: vi
      .fn()
      .mockImplementation((driveUrl: keyof typeof driveMetadataByUrl) => {
        return {
          request: vi.fn().mockImplementation((query: string) => {
            if (query.includes("query getDrive")) {
              return Promise.resolve({
                drive: driveMetadataByUrl[driveUrl],
              });
            }

            if (query.includes("query strands")) {
              return Promise.resolve({
                system: {
                  sync: {
                    strands: [],
                  },
                },
              });
            }

            if (query.includes("mutation registerPullResponderListener")) {
              return Promise.resolve({
                registerPullResponderListener: {
                  listenerId: generateId(),
                },
              });
            }

            return Promise.resolve({});
          }),
        };
      }),
    gql: vi.fn().mockImplementation((...args) => args.join("")),
  };
});

const documentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule[];

describe("default remote drives", () => {
  const documentDriveServerOptions: DocumentDriveServerOptions = {
    defaultDrives: { remoteDrives: [getDefaultRemoteDriveInput(drive1)] },
  };

  afterEach(() => {
    delete process.env.DOCUMENT_DRIVE_OLD_REMOTE_DRIVES_STRATEGY;
    delete process.env.DOCUMENT_DRIVE_OLD_REMOTE_DRIVES_URLS;
    delete process.env.DOCUMENT_DRIVE_OLD_REMOTE_DRIVES_IDS;
  });

  it("should add a remote default remote drives added in the config object", async () => {
    const server = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .build();

    await server.initialize();

    const drives = await server.getDrives();

    expect(drives).toHaveLength(1);
    expect(drives).toMatchObject([drive1.id]);
  });

  it("should start defaultRemoteDrives with pending state", () => {
    const server = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .build();
    const defaultRemoteDriveConfig = server
      .getDefaultRemoteDrives()
      .get(drive1.url);

    expect(defaultRemoteDriveConfig).toMatchObject({
      url: drive1.url,
      status: "PENDING",
    });
  });

  it("should emit messages when a remote drive is added", async () => {
    const server = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .build();

    const mockCallback = vi.fn();

    server.on("defaultRemoteDrive", mockCallback);

    await server.initialize();

    expect(mockCallback).toHaveBeenCalledTimes(2);
    expect(mockCallback.mock.calls[0][0]).toBe("ADDING");
    expect(mockCallback.mock.calls[0][3]).toBe(undefined);
    expect(mockCallback.mock.calls[1][0]).toBe("SUCCESS");
    expect(mockCallback.mock.calls[1][3]).toBe(drive1.id);
  });

  it("should not add an existing remote drive", async () => {
    const storage = new MemoryStorage();
    const server1 = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .withStorage(storage)
      .build();

    await server1.initialize();

    const server2 = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .withStorage(storage)
      .build();

    const mockCallback = vi.fn();

    server2.on("defaultRemoteDrive", mockCallback);
    await server2.initialize();

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback.mock.calls[0][0]).toBe("ALREADY_ADDED");
    expect(mockCallback.mock.calls[0][3]).toBe(drive1.id);
  });
});

describe("remove old drives", () => {
  const expectPublicDrive = (drive: DocumentDriveDocument) => {
    expect(drive.state.local.listeners).toHaveLength(1);
    expect(drive.state.local.triggers).toHaveLength(1);
    expect(drive.operations.local).toHaveLength(0);
  };

  const expectDetachedDrive = (drive: DocumentDriveDocument) => {
    expect(drive.state.local.listeners).toHaveLength(0);
    expect(drive.state.local.triggers).toHaveLength(0);
    expect(drive.operations.local).toMatchObject([
      {
        type: "REMOVE_LISTENER",
        index: 0,
      },
      {
        type: "REMOVE_TRIGGER",
        index: 1,
      },
      {
        type: "SET_SHARING_TYPE",
        input: { type: "LOCAL" },
        index: 2,
      },
    ]);
    expect(drive.state.local.sharingType).toBe("LOCAL");
  };

  const documentDriveServerOptions: DocumentDriveServerOptions = {
    defaultDrives: {
      remoteDrives: [
        getDefaultRemoteDriveInput(drive1),
        getDefaultRemoteDriveInput(drive2),
        getDefaultRemoteDriveInput(drive3),
        getDefaultRemoteDriveInput(drive4),
      ],
    },
  };

  const generatePopulatedStorage = async () => {
    const storage = new MemoryStorage();

    const server1 = new ReactorBuilder(documentModels)
      .withOptions(documentDriveServerOptions)
      .withStorage(storage)
      .build();

    await server1.initialize();
    return storage;
  };

  it("should preserve all old drives when 'preserve-all' strategy is used", async () => {
    const storage = await generatePopulatedStorage();

    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "preserve-all",
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    expect(drives).toHaveLength(4);
    expect(drives).toMatchObject([drive1.id, drive2.id, drive3.id, drive4.id]);
  });

  it("should preserve only remote drives specified when 'preserve-by-id' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "preserve-by-id",
            ids: [drive1.id, drive2.id],
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    expect(drives).toHaveLength(2);
    expect(drives).toMatchObject([drive1.id, drive2.id]);
  });

  it("should preserve only remote drives specified when 'preserve-by-url' strategy is used", async () => {
    const storage = await generatePopulatedStorage();

    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "preserve-by-url",
            urls: [drive1.url, drive2.url],
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    expect(drives).toHaveLength(2);
    expect(drives).toMatchObject([drive1.id, drive2.id]);
  });

  it("should remove all remote drives when 'remove-all' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "remove-all",
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    expect(drives).toHaveLength(0);
  });

  it("should remove only remote drives specified when 'remove-by-id' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "remove-by-id",
            ids: [drive1.id, drive2.id],
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    console.log("drives", drives);
    expect(drives).toHaveLength(2);
    expect(drives).toMatchObject([drive3.id, drive4.id]);
  });

  it("should remove only remote drives specified when 'remove-by-url' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "remove-by-url",
            urls: [drive1.url, drive2.url],
          },
        },
      })
      .withStorage(storage)
      .build();

    await server.initialize();

    const drives = await server.getDrives();
    expect(drives).toHaveLength(2);
    expect(drives).toMatchObject([drive3.id, drive4.id]);
  });

  it("should detach remote drives by id", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "detach-by-id",
            ids: [drive1.id, drive2.id],
          },
        },
      })
      .withStorage(storage)
      .build();

    let docDrive1 = await server.getDrive(drive1.id);
    let docDrive2 = await server.getDrive(drive2.id);

    expectPublicDrive(docDrive1);
    expectPublicDrive(docDrive2);

    await server.initialize();

    docDrive1 = await server.getDrive(drive1.id);
    docDrive2 = await server.getDrive(drive2.id);
    const docDrive3 = await server.getDrive(drive3.id);
    const docDrive4 = await server.getDrive(drive4.id);

    expectDetachedDrive(docDrive1);
    expectDetachedDrive(docDrive2);
    expectPublicDrive(docDrive3);
    expectPublicDrive(docDrive4);
  });

  it("should detach remote drives by url", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "detach-by-url",
            urls: [drive1.url, drive2.url],
          },
        },
      })
      .withStorage(storage)
      .build();

    let docDrive1 = await server.getDrive(drive1.id);
    let docDrive2 = await server.getDrive(drive2.id);

    expectPublicDrive(docDrive1);
    expectPublicDrive(docDrive2);

    await server.initialize();

    docDrive1 = await server.getDrive(drive1.id);
    docDrive2 = await server.getDrive(drive2.id);
    const docDrive3 = await server.getDrive(drive3.id);
    const docDrive4 = await server.getDrive(drive4.id);

    expectDetachedDrive(docDrive1);
    expectDetachedDrive(docDrive2);
    expectPublicDrive(docDrive3);
    expectPublicDrive(docDrive4);
  });

  it("should preserve only remote drives specified when 'preserve-by-id-and-detach' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "preserve-by-id-and-detach",
            ids: [drive1.id, drive2.id],
          },
        },
      })
      .withStorage(storage)
      .build();

    let docDrive3 = await server.getDrive(drive3.id);
    let docDrive4 = await server.getDrive(drive4.id);

    expectPublicDrive(docDrive3);
    expectPublicDrive(docDrive4);

    await server.initialize();

    docDrive3 = await server.getDrive(drive3.id);
    docDrive4 = await server.getDrive(drive4.id);
    const docDrive1 = await server.getDrive(drive1.id);
    const docDrive2 = await server.getDrive(drive2.id);

    expectPublicDrive(docDrive1);
    expectPublicDrive(docDrive2);
    expectDetachedDrive(docDrive3);
    expectDetachedDrive(docDrive4);
  });

  it("should preserve only remote drives specified when 'preserve-by-url-and-detach' strategy is used", async () => {
    const storage = await generatePopulatedStorage();
    const server = new ReactorBuilder(documentModels)
      .withOptions({
        defaultDrives: {
          removeOldRemoteDrives: {
            strategy: "preserve-by-url-and-detach",
            urls: [drive1.url, drive2.url],
          },
        },
      })
      .withStorage(storage)
      .build();

    let docDrive3 = await server.getDrive(drive3.id);
    let docDrive4 = await server.getDrive(drive4.id);

    expectPublicDrive(docDrive3);
    expectPublicDrive(docDrive4);

    await server.initialize();

    docDrive3 = await server.getDrive(drive3.id);
    docDrive4 = await server.getDrive(drive4.id);
    const docDrive1 = await server.getDrive(drive1.id);
    const docDrive2 = await server.getDrive(drive2.id);

    expectPublicDrive(docDrive1);
    expectPublicDrive(docDrive2);
    expectDetachedDrive(docDrive3);
    expectDetachedDrive(docDrive4);
  });
});
