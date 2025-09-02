import type {
  ListenerRevision,
  ServerListener,
  StrandUpdate,
} from "document-drive";
import {
  addFile,
  driveDocumentModelModule,
  expectUTCTimestamp,
  ReactorBuilder,
  SwitchboardPushTransmitter,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
  generateId,
  setModelName,
} from "document-model";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("graphql-request"), async (importOriginal) => {
  const originalModule = await importOriginal();

  return {
    ...originalModule,
    GraphQLClient: vi.fn().mockImplementation(() => {
      return {
        request: vi
          .fn()
          .mockImplementation(
            (query: string, { strands }: { strands: StrandUpdate[] }) => {
              if (query.includes("mutation pushUpdates")) {
                return Promise.resolve({
                  pushUpdates: strands.map<ListenerRevision>(
                    ({ operations, ...strand }) => ({
                      ...strand,
                      status: "SUCCESS",
                      revision: operations.length
                        ? operations.at(-1)!.index + 1
                        : 0,
                    }),
                  ),
                });
              }

              return Promise.resolve({});
            },
          ),
      };
    }),
    gql: vi.fn().mockImplementation((...args) => args.join("")),
  };
});

describe("SwitchboardPush Listener", () => {
  const driveId = "test-drive";
  const driveName = "Test Drive";
  const remoteUrl = "https://example.com/d/test";

  async function buildServer() {
    const documentModels = [
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[];
    const builder = new ReactorBuilder(documentModels);
    const server = builder.build();
    await server.initialize();

    await server.addDrive({
      id: driveId,
      global: {
        name: driveName,
      },
    });

    const listenerManager = builder.listenerManager;

    // Create the listener and transmitter
    const uuid = generateId();
    const listener: ServerListener = {
      driveId,
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
    await listenerManager?.setListener(driveId, listener);

    return {
      server,
      listenerManager,
      listener,
    };
  }

  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));
  });

  test("should call transmit function of listener and acknowledge", async () => {
    const { server, listenerManager, listener } = await buildServer();
    const drive = await server.getDrive(driveId);

    // should have transmitted drive initial revision
    expect(
      listenerManager
        ?.getListenerState(driveId, listener.listenerId)
        .syncUnits.getAllByDocumentId(drive.header.id),
    ).toStrictEqual([
      [
        { branch: "main", documentId: drive.header.id, scope: "global" },
        { listenerRev: 0, lastUpdated: expectUTCTimestamp(expect) },
      ],
    ]);

    const document = documentModelCreateDocument();
    const documentId = document.header.id;
    await server.addDocument(document);

    const action = addFile({
      id: documentId,
      name: "test",
      documentType: "powerhouse/document-model",
    });

    await server.addAction(driveId, action);

    // should have transmitted drive first operation and document initial revision
    await vi.waitFor(() =>
      expect(
        listenerManager
          ?.getListenerState(driveId, listener.listenerId)
          .syncUnits.getAllByDocumentId(drive.header.id),
      ).toStrictEqual([
        [
          { branch: "main", documentId: drive.header.id, scope: "global" },
          { listenerRev: 1, lastUpdated: expectUTCTimestamp(expect) },
        ],
      ]),
    );
    expect(
      listenerManager
        ?.getListenerState(driveId, listener.listenerId)
        .syncUnits.getAllByDocumentId(documentId),
    ).toStrictEqual([
      [
        { branch: "main", documentId: documentId, scope: "global" },
        { listenerRev: 0, lastUpdated: expectUTCTimestamp(expect) },
      ],
    ]);

    await server.addAction(documentId, setModelName({ name: "test" }));

    // should have transmitted document first operation
    await vi.waitFor(() =>
      expect(
        listenerManager
          ?.getListenerState(driveId, listener.listenerId)
          .syncUnits.getAllByDocumentId(documentId),
      ).toStrictEqual([
        [
          { branch: "main", documentId: documentId, scope: "global" },
          { listenerRev: 1, lastUpdated: expectUTCTimestamp(expect) },
        ],
      ]),
    );
  });
});
