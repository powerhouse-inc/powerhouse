import {
  DocumentModelDocument,
  DocumentModelModule,
  Operation,
} from "document-model";
import { graphql } from "graphql";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { stringify } from "querystring";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  vi,
} from "vitest";
import {
  ListenerRevision,
  ReactorBuilder,
  SyncStatus,
  UpdateStatus,
} from "../../../../src/server/types.js";
import { MemoryStorage } from "../../../src/storage/memory.js";
import { PrismaStorage } from "../../../src/storage/prisma.js";
import InMemoryCache from "../../src/cache/memory.js";
import { DocumentDriveAction } from "../../src/drive-document-model/gen/actions.js";
import { reducer } from "../../src/drive-document-model/gen/reducer.js";
import { Trigger } from "../../src/drive-document-model/gen/types.js";
import { ConflictOperationError } from "../../src/server/error.js";
import { StrandUpdateGraphQL } from "../../src/server/listener/transmitter/pull-responder.js";
import { PrismaClient } from "../../src/storage/prisma/client";

describe("Document Drive Server with %s", () => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule[];

  const prismaClient = new PrismaClient();
  const storageLayer = new MemoryStorage();

  const strands: StrandUpdateGraphQL[] = [
    {
      driveId: "1",
      documentId: "",
      scope: "global",
      branch: "main",
      operations: [
        {
          timestampUtcMs: "2024-01-24T18:57:33.899Z",
          index: 0,
          skip: 0,
          type: "ADD_FILE",
          input: stringify({
            id: "1.1",
            name: "document 1",
            documentType: "powerhouse/document-model",
            synchronizationUnits: [
              {
                syncId: "1",
                scope: "global",
                branch: "main",
              },
              {
                syncId: "2",
                scope: "local",
                branch: "main",
              },
            ],
          }),
          hash: "1912p2O/5+/f+JbNQJIBUXQZ5n0=",
        },
      ],
    },
    {
      driveId: "1",
      documentId: "1.1",
      scope: "global",
      branch: "main",
      operations: [
        {
          timestampUtcMs: "2024-01-24T18:57:33.899Z",
          index: 0,
          skip: 0,
          type: "SET_NAME",
          input: stringify("test"),
          hash: "Fd20qtObIUDJwJHse6VqFK8ObWY=",
        },
      ],
    },
  ];

  const revisions: ListenerRevision[] = [
    {
      branch: "main",
      documentId: "1.1",
      driveId: "1",
      revision: 0,
      scope: "global",
      status: "SUCCESS" as UpdateStatus,
    },
    // ...
  ];

  const restHandlers = [
    http.get("https://rest-endpoint.example/path/to/posts", () => {
      return HttpResponse.json(revisions);
    }),
  ];

  const graphqlHandlers = [
    graphql.query("getDrive", () => {
      return HttpResponse.json({
        data: {
          drive: { id: "1", name: "name", icon: "icon", slug: "slug" },
        },
      });
    }),
    graphql.mutation("pushUpdates", () => {
      return HttpResponse.json({
        data: { pushUpdates: revisions },
      });
    }),
    graphql.mutation("registerPullResponderListener", () => {
      return HttpResponse.json({
        data: {
          registerPullResponderListener: { listenerId: "listener-1" },
        },
      });
    }),
    graphql.query("strands", () => {
      return HttpResponse.json({
        data: { system: { sync: { strands } } },
      });
    }),
    graphql.mutation("acknowledge", () => {
      return HttpResponse.json({
        data: { acknowledge: true },
      });
    }),
  ];

  const mswServer = setupServer(...restHandlers, ...graphqlHandlers);

  beforeEach(async () => {
    await prismaClient.$executeRawUnsafe('DELETE FROM "Attachment";');
    await prismaClient.$executeRawUnsafe('DELETE FROM "Operation";');
    await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
    mswServer.resetHandlers();
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  beforeAll(() => {
    mswServer.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => mswServer.close());

  it("should add pull trigger from remote drive", async ({ expect }) => {
    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    await server.initialize();
    await server.addRemoteDrive("http://switchboard.powerhouse.xyz/1", {
      availableOffline: true,
      sharingType: "PUBLIC",
      listeners: [],
      triggers: [],
      pullFilter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global", "local"],
      },
      pullInterval: 5000,
    });
    const drive = await server.getDrive("1");

    expect(drive.state.global).toStrictEqual({
      id: "1",
      name: "name",
      icon: "icon",
      slug: "slug",
      nodes: [],
    });

    expect(drive.state.local).toStrictEqual({
      availableOffline: true,
      sharingType: "PUBLIC",
      listeners: [],
      triggers: [
        {
          id: expect.any(String) as string,
          type: "PullResponder",
          data: {
            interval: "5000",
            listenerId: "listener-1",
            url: "http://switchboard.powerhouse.xyz/1",
          },
        },
      ],
    });
  });

  it("should push to switchboard if remoteDriveUrl is set", async ({
    expect,
  }) => {
    mswServer.use(
      graphql.mutation("pushUpdates", () => {
        return HttpResponse.json({
          data: {
            pushUpdates: [
              {
                branch: "main",
                documentId: "",
                driveId: "1",
                revision: 0,
                scope: "global",
                status: "SUCCESS" as UpdateStatus,
              },
            ],
          },
        });
      }),
    );

    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    await server.initialize();
    await server.addDrive({
      global: { id: "1", name: "name", icon: "icon", slug: "slug" },
      local: {
        listeners: [
          {
            block: true,
            callInfo: {
              data: "http://switchboard.powerhouse.xyz/1",
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
        triggers: [{} as unknown as Trigger],
        availableOffline: true,
        sharingType: "PUBLIC",
      },
    });

    let drive = await server.getDrive("1");

    // adds file
    const addFileRequest = new Promise<Request>((resolve) => {
      function listener(result: { request: Request }) {
        resolve(result.request);
        mswServer.events.removeListener("request:start", listener);
      }
      mswServer.events.on("request:start", listener);
    });

    drive = reducer(
      drive,
      actions.addFile({
        id: "1.1",
        name: "document 1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      }),
    );
    await server.addDriveOperation("1", drive.operations.global[0]);
    expect(server.getSyncStatus("1")).toBe("SYNCING");

    vi.advanceTimersToNextTimer();

    const waitSync = new Promise((resolve) =>
      server.on(
        "syncStatus",
        (drive, status) => status === "SUCCESS" && resolve(status),
      ),
    );
    const status = await waitSync;
    expect(status).toBe("SUCCESS");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const addFileBody = await (await addFileRequest).json();
    expect(addFileBody).toEqual(
      expect.objectContaining({
        operationName: "pushUpdates",
        query: expect.stringContaining("mutation pushUpdates") as string,
        variables: {
          strands: [
            {
              branch: "main",
              documentId: "",
              driveId: "1",
              operations: [
                {
                  hash: "1912p2O/5+/f+JbNQJIBUXQZ5n0=",
                  index: 0,
                  input:
                    '{"documentType":"powerhouse/document-model","id":"1.1","name":"document 1","synchronizationUnits":[{"branch":"main","scope":"global","syncId":"1"},{"branch":"main","scope":"local","syncId":"2"}]}',
                  skip: 0,
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
                  type: "ADD_FILE",
                },
              ],
              scope: "global",
            },
          ],
        },
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    expect(addFileBody.query.replace(/\s+/g, " ").trim()).toStrictEqual(
      `mutation pushUpdates($strands: [InputStrandUpdate!]) {
                pushUpdates(strands: $strands) {
                    driveId
                    documentId
                    scope
                    branch
                    status
                    revision
                    error
                }
            }
        `
        .replace(/\s+/g, " ")
        .trim(),
    );

    let document = (await server.getDocument(
      "1",
      "1.1",
    )) as DocumentModelDocument;
    document = DocumentModelLib.reducer(
      document,
      DocumentModelActions.setName("Test"),
    );

    const setNameRequest = new Promise<Request>((resolve) => {
      function listener(result: { request: Request }) {
        resolve(result.request);
        mswServer.events.removeListener("request:start", listener);
      }
      mswServer.events.on("request:start", listener);
    });

    const operation = document.operations.global[0]!;
    const result = await server.addOperation("1", "1.1", operation);
    expect(result.status).toBe("SUCCESS");
    expect(server.getSyncStatus("1")).toBe("SYNCING");
    vi.advanceTimersToNextTimer();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setNameBody = await (await setNameRequest).json();
    expect(setNameBody).toEqual(
      expect.objectContaining({
        operationName: "pushUpdates",
        query: expect.stringContaining("mutation pushUpdates") as string,
        variables: {
          strands: [
            {
              branch: "main",
              documentId: "1.1",
              driveId: "1",
              operations: [
                {
                  timestampUtcMs: "2024-01-01T00:00:00.000Z",
                  hash: "Fd20qtObIUDJwJHse6VqFK8ObWY=",
                  input: '"Test"',
                  type: "SET_NAME",
                  index: 0,
                  skip: 0,
                },
              ],
              scope: "global",
            },
          ],
        },
      }),
    );
  });

  it("should pull from switchboard if remoteDriveUrl is set", async ({
    expect,
  }) => {
    const ackRequestPromise = new Promise<JSON>((resolve) => {
      mswServer.events.on("request:end", async ({ request }) => {
        void request
          .clone()
          .json()
          .then((body) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (body.operationName === "acknowledge") {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
              resolve(body);
            }
          });
      });
    });

    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    await server.initialize();

    const statusEvents: SyncStatus[] = [];
    server.on("syncStatus", (driveId, status) => {
      statusEvents.push(status);
    });

    await server.addRemoteDrive("http://switchboard.powerhouse.xyz/1", {
      availableOffline: true,
      sharingType: "PUBLIC",
      triggers: [],
      listeners: [],
      pullFilter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global", "local"],
      },
    });

    vi.advanceTimersToNextTimer();

    await new Promise((resolve) => server.on("strandUpdate", resolve));

    const drive = await server.getDrive("1");
    expect(drive.operations.global[0]).toMatchObject({
      index: 0,
      skip: 0,
      type: "ADD_FILE",
      scope: "global",
      hash: "1912p2O/5+/f+JbNQJIBUXQZ5n0=",
      timestampUtcMs: expect.stringMatching(
        /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/,
      ) as string,
      input: {
        id: "1.1",
        name: "document 1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      },
    });

    const ackRequest = await ackRequestPromise;
    expect(ackRequest).toEqual(
      expect.objectContaining({
        operationName: "acknowledge",
        query: expect.stringContaining("mutation acknowledge") as string,
        variables: {
          listenerId: "listener-1",
          revisions: [
            {
              branch: "main",
              documentId: "",
              driveId: "1",
              revision: 0,
              scope: "global",
              status: "SUCCESS",
            },
            {
              branch: "main",
              documentId: "1.1",
              driveId: "1",
              revision: 0,
              scope: "global",
              status: "SUCCESS",
            },
          ],
        },
      }),
    );

    expect(statusEvents).toStrictEqual(["SYNCING", "SUCCESS"]);
  });

  it("should detect conflict when adding operation with existing index", async ({
    expect,
  }) => {
    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();

    await server.initialize();
    await server.addRemoteDrive("http://switchboard.powerhouse.xyz/1", {
      availableOffline: true,
      sharingType: "PUBLIC",
      triggers: [],
      listeners: [],
      pullFilter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global", "local"],
      },
    });

    vi.advanceTimersToNextTimer();

    await new Promise((resolve) => server.on("strandUpdate", resolve));

    const operation: Operation<DocumentDriveAction> = {
      index: 0,
      skip: 0,
      type: "ADD_FILE",
      scope: "global",
      hash: "9ic1WgNomITicM0piSYLTqgDx7w=",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        id: "1.1",
        name: "local document 1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      },
    };

    const result = await server.addDriveOperation("1", operation);
    expect(result.status).toBe("CONFLICT");
    expect(result.error?.message).toBe("Conflicting operation on index 0");
    expect(result.error?.cause).toStrictEqual({
      existingOperation: {
        branch: "main",
        index: 0,
        skip: 0,
        type: "ADD_FILE",
        scope: "global",
        hash: "1912p2O/5+/f+JbNQJIBUXQZ5n0=",
        timestampUtcMs: expect.stringMatching(
          /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/,
        ) as string,
        input: {
          id: "1.1",
          name: "document 1",
          documentType: "powerhouse/document-model",
          synchronizationUnits: [
            {
              syncId: "1",
              scope: "global",
              branch: "main",
            },
            {
              syncId: "2",
              scope: "local",
              branch: "main",
            },
          ],
        },
      },
      newOperation: operation,
    });
  });

  it("should detect conflict when pulling operation with existing index", async ({
    expect,
  }) => {
    mswServer.use(
      graphql.query("strands", () => {
        return HttpResponse.json({
          data: { system: { sync: { strands: [] } } },
        });
      }),
    );

    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    const statusEvents: SyncStatus[] = [];
    server.on("syncStatus", (driveId, status) => {
      statusEvents.push(status);
    });
    await server.initialize();
    await server.addRemoteDrive("http://switchboard.powerhouse.xyz/1", {
      availableOffline: true,
      sharingType: "PUBLIC",
      triggers: [],
      listeners: [],
      pullFilter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global", "local"],
      },
    });

    const operation: Operation<DocumentDriveAction> = {
      index: 0,
      skip: 0,
      type: "ADD_FILE",
      scope: "global",
      hash: "9ic1WgNomITicM0piSYLTqgDx7w=",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        id: "1.1",
        name: "local document 1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      },
    };

    const result = await server.addDriveOperation("1", operation);
    expect(result.status).toBe("SUCCESS");
    expect(server.getSyncStatus("1")).toBe("SYNCING");

    await vi.waitFor(() => expect(server.getSyncStatus("1")).toBe("SUCCESS"));

    mswServer.use(
      graphql.query("strands", () => {
        return HttpResponse.json({
          data: { system: { sync: { strands } } },
        });
      }),
    );

    await vi.waitFor(() => {
      vi.advanceTimersToNextTimer();
      expect(statusEvents.length).greaterThan(2);
    });

    expect(server.getSyncStatus("1")).toBe("CONFLICT");
    expect(statusEvents).toStrictEqual(["SYNCING", "SUCCESS", "CONFLICT"]);
  });

  it("should detect conflict when pushing operation with existing index", async ({
    expect,
  }) => {
    mswServer.use(
      graphql.query("strands", () => {
        return HttpResponse.json({
          data: { system: { sync: { strands: [] } } },
        });
      }),
      graphql.mutation("pushUpdates", () => {
        return HttpResponse.json({
          data: {
            pushUpdates: [
              {
                branch: "main",
                documentId: "",
                driveId: "1",
                revision: 0,
                scope: "global",
                status: "CONFLICT",
              },
            ],
          },
        });
      }),
    );

    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    await server.initialize();
    await server.addRemoteDrive("http://switchboard.powerhouse.xyz/1", {
      availableOffline: true,
      sharingType: "PUBLIC",
      triggers: [],
      listeners: [
        {
          block: true,
          callInfo: {
            data: "http://switchboard.powerhouse.xyz/1",
            name: "switchboard-push",
            transmitterType: "SwitchboardPush",
          },
          filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global", "local"],
          },
          label: "Switchboard Sync",
          listenerId: "1",
          system: true,
        },
      ],

      pullFilter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global", "local"],
      },
    });

    await vi.waitFor(() => expect(server.getSyncStatus("1")).toBe("SUCCESS"));

    const operation: Operation<DocumentDriveAction> = {
      index: 0,
      skip: 0,
      type: "ADD_FILE",
      scope: "global",
      hash: "9ic1WgNomITicM0piSYLTqgDx7w=",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        id: "1.1",
        name: "local document 1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
      },
    };

    await server.addDriveOperation("1", operation);

    await vi.waitFor(() => expect(server.getSyncStatus("1")).toBe("CONFLICT"));

    const drive = await server.getDrive("1");
    expect(drive.operations.global.length).toBe(1);
    // expect(server.getSyncStatus('1')).toBe('');
  });

  it("should not store operation with repeated index", async ({ expect }) => {
    vi.useRealTimers();
    const prismaClient = new PrismaClient();
    const cache = new InMemoryCache();
    const server = new ReactorBuilder(documentModels)
      .withStorage(new PrismaStorage(prismaClient, cache))
      .withCache(cache)
      .build();

    await server.initialize();
    await server.addDrive({
      global: {
        id: "1",
        name: "!",
        icon: null,
        slug: null,
      },
      local: {
        availableOffline: false,
        sharingType: "PUBLIC",
        triggers: [],
        listeners: [],
      },
    });

    await server.addDriveAction(
      "1",
      actions.addFile({
        id: "1.1",
        documentType: "powerhouse/document-model",
        synchronizationUnits: [
          {
            syncId: "1",
            scope: "global",
            branch: "main",
          },
          {
            syncId: "2",
            scope: "local",
            branch: "main",
          },
        ],
        name: "test",
      }),
    );

    let document = (await server.getDocument(
      "1",
      "1.1",
    )) as DocumentModelDocument;
    expect(document.operations.global.length).toBe(0);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const operationA = DocumentModelLib.reducer(
      document,
      DocumentModelActions.addModule({ id: "a", name: "a" }),
    ).operations.global[0]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const operationB = DocumentModelLib.reducer(
      document,
      DocumentModelActions.addModule({ id: "b", name: "b" }),
    ).operations.global[0]!;

    const resultDelayP = server.addOperations("1", "1.1", [operationA]);
    const result = await server.addOperations("1", "1.1", [operationB]);

    const resultDelay = await resultDelayP;
    expect(resultDelay.status).toBe("SUCCESS");
    expect(result.status).toBe("CONFLICT");
    expect(result.error).toBeInstanceOf(ConflictOperationError);
    document = (await server.getDocument("1", "1.1")) as DocumentModelDocument;
    expect(document.operations.global.length).toBe(1);
    expect(document.operations.global[0]?.index).toBe(0);
    expect(document.state.global.specifications[0]?.modules[0]?.id).toBe("a");
  });
});
