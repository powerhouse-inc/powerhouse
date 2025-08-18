/**
 *
 *
 * TODO: Fix MSW issue when running on CI
 * 'Cookie has domain set to the public suffix "test" which is a special use domain.
 * To allow this, configure your CookieJar with {allowSpecialUseDomain:true, rejectPublicSuffixes: false}.'
 *
 *
 */

import {
  DocumentDriveAction,
  Listener,
  ListenerFilter,
  actions,
  reducer,
} from "document-drive";
import * as DocumentModelLib from "document-model";
import { DocumentModelModule, Operation, generateId } from "document-model";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import stringify from "json-stringify-deterministic";
import { GraphQLQuery, HttpResponse, graphql } from "msw";
import { setupServer } from "msw/node";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { PullResponderTransmitter } from "../../src/server/listener/transmitter/pull-responder.js";
import {
  ListenerRevision,
  ReactorBuilder,
  StrandUpdate,
  SyncStatus,
} from "../../src/server/types.js";
import { buildOperation, buildOperations } from "../utils.js";

describe("Document Drive Server interaction", () => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule[];

  function setupHandlers(server: DocumentDriveServer) {
    const handlers = [
      graphql.query("getDrive", async () => {
        const drive = await server.getDrive("1");
        return HttpResponse.json({
          data: { drive: drive.state.global },
        });
      }),
      graphql.mutation<GraphQLQuery, { strands: StrandUpdate[] }>(
        "pushUpdates",
        async ({ variables }) => {
          const strands = variables.strands;
          const listenerRevisions: ListenerRevision[] = [];
          if (strands.length) {
            const sortedStrands = strands.reduce<typeof strands>(
              (acc, curr) =>
                curr.documentId ? [...acc, curr] : [curr, ...acc],
              [],
            );

            for (const s of sortedStrands) {
              const operations =
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                s.operations?.map((o) => ({
                  ...o,
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  input: JSON.parse(o.input.toString()),
                  skip: o.skip ?? 0,
                  scope: s.scope,
                  branch: "main",
                })) ?? [];

              const result = await (!s.documentId
                ? server.addDriveOperations(
                    s.driveId,
                    operations as Operation<DocumentDriveAction>[],
                  )
                : server.addOperations(s.driveId, s.documentId, operations));

              if (result.status !== "SUCCESS") console.error(result.error);

              const revision =
                result.document?.operations[s.scope].slice().pop()?.index ?? -1;
              listenerRevisions.push({
                revision,
                branch: s.branch,
                documentId: s.documentId,
                driveId: s.driveId,
                scope: s.scope,
                status: result.status,
                error: result.error?.message,
              });
            }
          }
          return HttpResponse.json({
            data: { pushUpdates: listenerRevisions },
          });
        },
      ),
      graphql.mutation<GraphQLQuery, { filter: ListenerFilter }>(
        "registerPullResponderListener",
        async ({ variables }) => {
          const driveId = "1";
          const { filter } = variables;
          const uuid = generateId();
          const listener: Listener = {
            block: false,
            callInfo: {
              data: "",
              name: "PullResponder",
              transmitterType: "PullResponder",
            },
            filter: {
              branch: filter.branch ?? [],
              documentId: filter.documentId ?? [],
              documentType: filter.documentType ?? [],
              scope: filter.scope ?? [],
            },
            label: `Pullresponder #${uuid}`,
            listenerId: uuid,
            system: false,
          };
          let drive = await server.getDrive(driveId);
          drive = reducer(drive, actions.addListener({ listener }));
          const operation = drive.operations.local.slice(-1);

          await server.addDriveOperations(driveId, operation);
          return HttpResponse.json({
            data: {
              registerPullResponderListener: {
                listenerId: listener.listenerId,
              },
            },
          });
        },
      ),
      graphql.query<GraphQLQuery, { listenerId: string }>(
        "strands",
        async ({ variables }) => {
          const transmitter = await server.getTransmitter(
            "1",
            variables.listenerId,
          );
          if (!(transmitter instanceof PullResponderTransmitter)) {
            throw new Error("Not a PullResponderTransmitter");
          }
          const strands = await transmitter.getStrands();
          return HttpResponse.json({
            data: {
              system: {
                sync: {
                  strands: strands.map((e: StrandUpdate) => ({
                    driveId: e.driveId,
                    documentId: e.documentId,
                    scope: e.scope,
                    branch: e.branch,
                    operations: e.operations.map((o) => ({
                      index: o.index,
                      skip: o.skip,
                      name: o.type,
                      input: stringify(o.input),
                      hash: o.hash,
                      timestampUtcMs: o.timestampUtcMs,
                      type: o.type,
                    })),
                  })),
                },
              },
            },
          });
        },
      ),
      graphql.mutation<
        GraphQLQuery,
        {
          listenerId: string;
          revisions: ListenerRevision[];
        }
      >("acknowledge", async ({ variables }) => {
        let success = false;
        try {
          const { listenerId, revisions } = variables;
          const transmitter = await server.getTransmitter("1", listenerId);
          if (
            !transmitter ||
            !(transmitter instanceof PullResponderTransmitter)
          ) {
            throw new Error(`Transmitter with id ${listenerId} not found`);
          }
          success = await transmitter.processAcknowledge(
            "1",
            listenerId,
            revisions,
          );
        } catch (e) {
          console.error(e);
          success = false;
        }
        return HttpResponse.json({
          data: { acknowledge: success },
        });
      }),
    ];

    const mswServer = setupServer(...handlers);
    mswServer.listen({ onUnhandledRequest: "error" });
    return mswServer;
  }

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createRemoteDrive() {
    const remoteServer = new ReactorBuilder(documentModels).build();
    await remoteServer.initialize();

    const mswServer = setupHandlers(remoteServer);

    await remoteServer.addDrive({
      global: { id: "1", name: "name", icon: "icon", slug: "slug" },
      local: {
        availableOffline: false,
        sharingType: "PUBLIC",
        listeners: [],
        triggers: [],
      },
    });
    return { remoteServer, mswServer } as const;
  }

  it("should create remote drive", async ({ expect }) => {
    const { mswServer } = await createRemoteDrive();

    const connectServer = new ReactorBuilder(documentModels).build();
    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });
    const drive = await connectServer.getDrive("1");

    expect(drive.state.global).toStrictEqual({
      id: "1",
      name: "name",
      icon: "icon",
      slug: "slug",
      nodes: [],
    });

    expect(drive.state.local).toStrictEqual({
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [
        {
          id: expect.any(String) as string,
          type: "PullResponder",
          data: {
            interval: "",
            listenerId: expect.any(String) as string,
            url: "http://test",
          },
        },
      ],
    });
    await connectServer.clearStorage();
    mswServer.close();
  });

  it("should synchronize drive operations", async ({ expect }) => {
    const { remoteServer, mswServer } = await createRemoteDrive();

    const connectServer = new ReactorBuilder(documentModels).build();

    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });

    let connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.operations.global.length).toBe(0);

    const remoteDrive = await remoteServer.getDrive("1");

    await new Promise<SyncStatus>((resolve) =>
      connectServer.on(
        "syncStatus",
        (_, status) => status === "SUCCESS" && resolve(status),
      ),
    );

    await remoteServer.addDriveOperation(
      "1",
      buildOperation(
        reducer,
        remoteDrive,
        actions.addFolder({ id: "1", name: "test" }),
      ),
    );

    // wait for pull strands polling
    await vi.advanceTimersByTimeAsync(5000);

    // wait for queue processNextJob
    await vi.advanceTimersToNextTimerAsync();
    await new Promise<void>((resolve) =>
      connectServer.on("strandUpdate", () => resolve()),
    );

    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.operations.global.length).toBe(1);
    expect(connectDrive.state.global.nodes).toStrictEqual([
      {
        id: "1",
        kind: "folder",
        name: "test",
        parentFolder: null,
      },
    ]);

    await connectServer.clearStorage();
    mswServer.close();
  });

  it("should synchronize document operations", async ({ expect }) => {
    const { remoteServer, mswServer } = await createRemoteDrive();

    const connectServer = new ReactorBuilder(documentModels).build();

    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });

    let connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.operations.global.length).toBe(0);

    const remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperation(
      "1",
      buildOperation(
        reducer,
        remoteDrive,
        actions.addFile({
          id: "1",
          name: "test",
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
      ),
    );
    const remoteDocument = await remoteServer.getDocument("1", "1");
    await remoteServer.addOperation(
      "1",
      "1",
      buildOperation(
        DocumentModelLib.reducer,
        remoteDocument,
        DocumentModelLib.actions.setModelName({ name: "test" }),
      ),
    );

    await vi.waitFor(async () => {
      const connectDocument = (await connectServer.getDocument(
        "1",
        "1",
      )) as DocumentModelLib.DocumentModelDocument;
      expect(connectDocument.operations.global.length).toBe(1);
    });

    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.operations.global.length).toBe(1);
    expect(connectDrive.state.global.nodes).toStrictEqual([
      {
        id: "1",
        kind: "file",
        name: "test",
        documentType: "powerhouse/document-model",
        parentFolder: null,
        synchronizationUnits: [
          {
            branch: "main",
            scope: "global",
            syncId: "1",
          },
          {
            branch: "main",
            scope: "local",
            syncId: "2",
          },
        ],
      },
    ]);

    const connectDocument = (await connectServer.getDocument(
      "1",
      "1",
    )) as DocumentModelLib.DocumentModelDocument;
    expect(connectDocument.state.global.name).toBe("test");

    await connectServer.clearStorage();
    mswServer.close();
  });

  it("should handle strand with deleted file", async ({ expect }) => {
    const { remoteServer, mswServer } = await createRemoteDrive();

    let remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperations(
      "1",
      buildOperations(reducer, remoteDrive, [
        actions.addFolder({ id: "folder", name: "new folder" }),
        actions.addFile({
          id: "1",
          name: "test",
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
      ]),
    );
    const remoteDocument = await remoteServer.getDocument("1", "1");
    await remoteServer.addOperation(
      "1",
      "1",
      buildOperation(
        DocumentModelLib.reducer,
        remoteDocument,
        DocumentModelLib.actions.setModelName({ name: "test" }),
      ),
    );

    remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperation(
      "1",
      buildOperation(reducer, remoteDrive, actions.deleteNode({ id: "1" })),
    );

    const connectServer = new ReactorBuilder(documentModels).build();

    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });

    let connectDrive = await connectServer.getDrive("1");

    await vi.waitFor(async () => {
      const connectDocument = await connectServer.getDrive("1");
      expect(connectDocument.operations.global.length).toBe(3);
    });

    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.state.global.nodes).toStrictEqual([
      {
        id: "folder",
        kind: "folder",
        name: "new folder",
        parentFolder: null,
      },
    ]);

    await connectServer.clearStorage();
    mswServer.close();
  });

  it("should handle deleted file after sync", async ({ expect }) => {
    const { remoteServer, mswServer } = await createRemoteDrive();

    let remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperations(
      "1",
      buildOperations(reducer, remoteDrive, [
        actions.addFolder({ id: "folder", name: "new folder" }),
        actions.addFile({
          id: "1",
          name: "test",
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
      ]),
    );
    let remoteDocument = await remoteServer.getDocument("1", "1");
    await remoteServer.addOperation(
      "1",
      "1",
      buildOperation(
        DocumentModelLib.reducer,
        remoteDocument,
        DocumentModelLib.actions.setModelName({ name: "test" }),
      ),
    );

    const connectServer = new ReactorBuilder(documentModels).build();

    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });

    let connectDrive = await connectServer.getDrive("1");

    await vi.waitFor(async () => {
      const connectDocument = await connectServer.getDrive("1");
      expect(connectDocument.operations.global.length).toBe(2);
    });

    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.state.global.nodes).toStrictEqual([
      {
        id: "folder",
        kind: "folder",
        name: "new folder",
        parentFolder: null,
      },
      {
        id: "1",
        name: "test",
        documentType: "powerhouse/document-model",
        kind: "file",
        parentFolder: null,
        synchronizationUnits: [
          {
            branch: "main",
            scope: "global",
            syncId: "1",
          },
          {
            branch: "main",
            scope: "local",
            syncId: "2",
          },
        ],
      },
    ]);

    remoteDocument = await remoteServer.getDocument("1", "1");
    await remoteServer.addOperation(
      "1",
      "1",
      buildOperation(
        DocumentModelLib.reducer,
        remoteDocument,
        DocumentModelLib.actions.setModelName({ name: "test 2" }),
      ),
    );

    remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperation(
      "1",
      buildOperation(reducer, remoteDrive, actions.deleteNode({ id: "1" })),
    );

    // wait for pull strands polling
    await vi.advanceTimersByTimeAsync(5000);

    // wait for queue processNextJob
    await vi.advanceTimersToNextTimerAsync();

    await vi.waitFor(async () => {
      const connectDocument = await connectServer.getDrive("1");
      expect(connectDocument.operations.global.length).toBe(3);
    });

    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.state.global.nodes).toStrictEqual([
      {
        id: "folder",
        kind: "folder",
        name: "new folder",
        parentFolder: null,
      },
    ]);

    await connectServer.clearStorage();
    mswServer.close();
  });

  it("should filter strands", async ({ expect }) => {
    const { remoteServer } = await createRemoteDrive();
    let remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperations(
      "1",
      buildOperations(reducer, remoteDrive, [
        actions.addFolder({ id: "folder", name: "new folder" }),
        actions.addFile({
          id: "1",
          name: "test",
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
      ]),
    );
    const remoteDocument = await remoteServer.getDocument("1", "1");
    await remoteServer.addOperation(
      "1",
      "1",
      buildOperation(
        DocumentModelLib.reducer,
        remoteDocument,
        DocumentModelLib.actions.setModelName({ name: "test" }),
      ),
    );

    remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperation(
      "1",
      buildOperation(
        reducer,
        remoteDrive,
        actions.addListener({
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
              scope: ["*"],
            },
            label: `Pullresponder #3`,
            listenerId: "all",
            system: false,
          },
        }),
      ),
    );
    remoteDrive = await remoteServer.getDrive("1");
    await remoteServer.addDriveOperation(
      "1",
      buildOperation(
        reducer,
        remoteDrive,
        actions.addListener({
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
              documentType: ["powerhouse/document-model"],
              scope: ["*"],
            },
            label: `Pullresponder #3`,
            listenerId: "documentModel",
            system: false,
          },
        }),
      ),
    );

    const transmitterAll = (await remoteServer.getTransmitter(
      "1",
      "all",
    )) as PullResponderTransmitter;
    const strandsAll = await transmitterAll.getStrands();
    expect(strandsAll.length).toBe(2);

    const transmitterDocumentModel = (await remoteServer.getTransmitter(
      "1",
      "documentModel",
    )) as PullResponderTransmitter;
    const strandsDocumentModel = await transmitterDocumentModel.getStrands();
    expect(strandsDocumentModel.length).toBe(1);
  });

  it("should stop pulling if trigger is removed", async ({ expect }) => {
    await createRemoteDrive();

    const connectServer = new ReactorBuilder(documentModels).build();

    await connectServer.addRemoteDrive("http://test", {
      availableOffline: true,
      sharingType: "public",
      listeners: [],
      triggers: [],
    });

    let connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.state.local.triggers.length).toBe(1);
    const trigger = connectDrive.state.local.triggers[0];
    expect(trigger).toStrictEqual(
      expect.objectContaining({ type: "PullResponder" }),
    );
    expect(connectServer.getSyncStatus("1")).toBe("SYNCING");

    const result = await connectServer.addDriveOperation(
      "1",
      buildOperation(
        reducer,
        connectDrive,
        actions.removeTrigger({ triggerId: trigger!.id }),
      ),
    );
    expect(result.status).toBe("SUCCESS");
    connectDrive = await connectServer.getDrive("1");
    expect(connectDrive.state.local.triggers.length).toBe(0);
    expect(() => connectServer.getSyncStatus("1")).toThrowError(
      "Sync status not found for drive 1",
    );
  });
});
