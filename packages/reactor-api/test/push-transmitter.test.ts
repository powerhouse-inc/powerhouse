import {
  addFile,
  addFolder,
  driveDocumentModelModule,
  ListenerFilter,
  ListenerRevision,
  ReactorBuilder,
  requestPublicDrive,
  StrandUpdate,
} from "document-drive";
import { SwitchboardPushTransmitter } from "document-drive/server/listener/transmitter/switchboard-push";
import { IListenerManager, Listener } from "document-drive/server/types";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
} from "document-model";
import { graphql, GraphQLQuery, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { describe, expect, it, vi } from "vitest";
import { DriveSubgraph } from "../src/graphql/drive/index.js";
import { expectUTCTimestamp } from "./utils.js";

const remoteUrl = "http://test.com/d/test";

describe("Push Transmitter", () => {
  const remoteDrive = {
    id: "generateId",
    global: {
      name: "Test Drive",
    },
  };

  async function setupReactor() {
    const builder = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[]);
    const reactor = await builder.build();
    await reactor.initialize();
    return { reactor, listenerManager: builder.listenerManager! };
  }

  async function setupRemote() {
    const { reactor } = await setupReactor();
    const drive = await reactor.addDrive(remoteDrive);

    const driveSubgraph = new DriveSubgraph({ reactor: reactor } as any);
    const { Query, Mutation, Sync } = driveSubgraph.resolvers as any;
    const context = {
      driveId: drive.id,
    };
    const handlers = [
      graphql.query("getDrive", async ({ variables }) => {
        return HttpResponse.json({
          data: {
            drive: await Query.drive(undefined, variables, context),
          },
        });
      }),
      graphql.mutation<GraphQLQuery, { strands: StrandUpdate[] }>(
        "pushUpdates",
        async ({ variables }) => {
          return HttpResponse.json({
            data: {
              pushUpdates: await Mutation.pushUpdates(
                undefined,
                variables,
                context,
              ),
            },
          });
        },
      ),
      graphql.mutation<GraphQLQuery, { filter: ListenerFilter }>(
        "registerPullResponderListener",
        async ({ variables }) => {
          return HttpResponse.json({
            data: {
              registerPullResponderListener:
                await Mutation.registerPullResponderListener(
                  undefined,
                  variables,
                  context,
                ),
            },
          });
        },
      ),
      graphql.query<GraphQLQuery, { listenerId: string }>(
        "strands",
        async ({ variables }) => {
          return HttpResponse.json({
            data: {
              system: {
                sync: {
                  strands: await Sync.strands(undefined, variables, context),
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
        return HttpResponse.json({
          data: {
            acknowledge: await Mutation.acknowledge(
              undefined,
              variables,
              context,
            ),
          },
        });
      }),
    ];

    const mswServer = setupServer(...handlers);
    mswServer.listen({ onUnhandledRequest: "error" });
    return { mswServer, remoteReactor: reactor };
  }

  async function setupListener(listenerManager: IListenerManager) {
    const uuid = generateId();
    const listener: Listener = {
      driveId: remoteDrive.id,
      listenerId: uuid,
      block: false,
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global"],
      },
      system: false,
      label: `SwitchboardPush #${uuid}`,
      callInfo: {
        data: remoteUrl,
        name: "SwitchboardPush",
        transmitterType: "SwitchboardPush",
      },
    };

    // TODO: circular reference
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);
    await listenerManager?.setListener(remoteDrive.id, listener);

    return listener;
  }

  it("should return drive data", async () => {
    await setupRemote();
    const driveInfo = await requestPublicDrive(remoteUrl);
    expect(driveInfo).toStrictEqual({
      id: remoteDrive.id,
      slug: remoteDrive.id,
      name: remoteDrive.global.name,
      meta: {},
    });
  });

  it("should push drive operation to remote reactor", async () => {
    const { reactor, listenerManager } = await setupReactor();
    const { remoteReactor } = await setupRemote();
    const { id: driveId, name } = await requestPublicDrive(remoteUrl);
    await reactor.addDrive({ id: driveId, global: { name } });

    const listener = await setupListener(listenerManager);

    const result = await reactor.queueAction(
      driveId,
      addFolder({ id: generateId(), name: "test" }),
    );

    await vi.waitFor(async () => {
      const remoteDrive = await remoteReactor.getDrive(driveId);
      expect(remoteDrive.revision).toStrictEqual({ global: 1, local: 0 });
      expect(remoteDrive.state.global).toStrictEqual(
        result.document?.state.global,
      );
    });

    const syncUnits = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    ).syncUnits!;
    expect(
      syncUnits.get({
        documentId: driveId,
        scope: "global",
        branch: "main",
      }),
    ).toStrictEqual({
      listenerRev: 1,
      lastUpdated: expectUTCTimestamp(expect),
    });

    expect(
      syncUnits.get({
        documentId: driveId,
        scope: "local",
        branch: "main",
      }),
    ).toBeUndefined();
  });

  it("should push new document to remote reactor", async () => {
    const { reactor, listenerManager } = await setupReactor();
    const { remoteReactor } = await setupRemote();
    const { id: driveId, name } = await requestPublicDrive(remoteUrl);
    await reactor.addDrive({ id: driveId, global: { name } });

    const listener = await setupListener(listenerManager);
    const documentId = generateId();
    const document = await reactor.addDocument(
      documentModelDocumentModelModule.utils.createDocument({ id: documentId }),
    );

    const result = await reactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const remoteDrive = await remoteReactor.getDrive(driveId);
      expect(remoteDrive.revision).toStrictEqual({ global: 1, local: 0 });
      expect(remoteDrive.state.global).toStrictEqual(
        result.document?.state.global,
      );
    });

    const syncUnits = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    ).syncUnits!;
    expect(
      syncUnits.get({
        documentId,
        scope: "global",
        branch: "main",
      }),
    ).toStrictEqual({
      listenerRev: 0,
      lastUpdated: expectUTCTimestamp(expect),
    });

    expect(
      syncUnits.get({
        documentId,
        scope: "local",
        branch: "main",
      }),
    ).toBeUndefined();
  });
});
