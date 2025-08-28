import type { IProcessor, ServerListener } from "document-drive";
import {
  addFile,
  driveDocumentModelModule,
  expectUTCTimestamp,
  expectUUID,
  InternalTransmitter,
  ReactorBuilder,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import {
  createPresignedHeader,
  documentModelDocumentModelModule,
  generateId,
  setModelName,
} from "document-model";
import { beforeEach, describe, expect, test, vi, vitest } from "vitest";

describe("Internal Listener", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[];
  const driveId = generateId();

  async function buildServer(processor: IProcessor) {
    const builder = new ReactorBuilder(documentModels);
    const server = builder.build();
    await server.initialize();

    await server.addDrive({
      id: driveId,
      global: {
        name: "Global Drive",
        icon: "",
      },
      local: {
        availableOffline: false,
        listeners: [],
        sharingType: "private",
        triggers: [],
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
      label: `Internal #${uuid}`,
      callInfo: {
        data: "",
        name: "Internal",
        transmitterType: "Internal",
      },
    };

    // TODO: circular reference
    listener.transmitter = new InternalTransmitter(server, processor);

    await listenerManager?.setListener(driveId, listener);

    return server;
  }

  beforeEach(() => {
    vi.setSystemTime(new Date("2024-01-01"));
  });

  test("should call transmit function of listener and acknowledge", async () => {
    const transmitFn = vitest.fn((args) => {
      return Promise.resolve();
    });

    const server = await buildServer({
      onStrands: transmitFn,
      onDisconnect: () => Promise.resolve(),
    });
    const drive = await server.getDrive(driveId);

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(1));
    expect(transmitFn).toHaveBeenCalledWith([
      {
        branch: "main",
        documentId: drive.header.id,
        documentType: "powerhouse/document-drive",
        driveId: drive.header.id,
        operations: [],
        scope: "global",
        state: {},
      },
    ]);

    const documentId = generateId();
    const document = documentModelDocumentModelModule.utils.createDocument();
    const header = createPresignedHeader(
      documentId,
      document.header.documentType,
    );
    document.header = header;
    await server.addDocument(document);

    const action = addFile({
      id: documentId,
      name: "test",
      documentType: "powerhouse/document-model",
    });

    const result = await server.addAction(driveId, action);
    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(2));
    expect(transmitFn).toHaveBeenCalledWith([
      expect.objectContaining({
        branch: "main",
        documentId: drive.header.id,
        documentType: "powerhouse/document-drive",
        driveId: drive.header.id,
        operations: [
          expect.objectContaining({
            action: expect.objectContaining({
              scope: "global",
              type: "ADD_FILE",
              input: {
                id: documentId,
                name: "test",
                documentType: "powerhouse/document-model",
              },
              timestampUtcMs: expectUTCTimestamp(expect),
              id: expectUUID(expect),
            }),
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            id: expectUUID(expect) as string,
            index: 0,
            input: {
              id: documentId,
              name: "test",
              documentType: "powerhouse/document-model",
            },
            skip: 0,
            timestampUtcMs: expectUTCTimestamp(expect),
            type: "ADD_FILE",
            previousState: expect.any(Object),
            state: expect.any(Object),
          }),
        ],
        scope: "global",
        state: result.document!.state.global,
      }),
      expect.objectContaining({
        branch: "main",
        documentId: document.header.id,
        documentType: "powerhouse/document-model",
        driveId: drive.header.id,
        operations: [],
        scope: "global",
        state: {},
      }),
    ]);

    const setModelNameAction = setModelName({ name: "test" });
    await server.addAction(documentId, setModelNameAction);

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(3));

    const state = {
      author: {
        name: "",
        website: "",
      },
      description: "",
      extension: "",
      id: "",
      name: "test",
      specifications: [
        {
          changeLog: [],
          modules: [],
          state: {
            global: {
              examples: [],
              initialValue: "",
              schema: "",
            },
            local: {
              examples: [],
              initialValue: "",
              schema: "",
            },
          },
          version: 1,
        },
      ],
    };

    expect(transmitFn).toHaveBeenLastCalledWith([
      expect.objectContaining({
        branch: "main",
        documentType: "powerhouse/document-model",
        documentId,
        driveId,
        operations: [
          expect.objectContaining({
            action: expect.objectContaining({
              scope: "global",
              type: "SET_MODEL_NAME",
              input: { name: "test" },
              timestampUtcMs: expectUTCTimestamp(expect),
              id: expectUUID(expect),
            }),
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            id: expectUUID(expect) as string,
            index: 0,
            input: { name: "test" },
            skip: 0,
            timestampUtcMs: expectUTCTimestamp(expect),
            type: "SET_MODEL_NAME",
            previousState: expect.any(Object),
            state,
          }),
        ],
        state,
        scope: "global",
      }),
    ]);

    const setModelNameAction2 = setModelName({ name: "test 2" });
    await server.addAction(documentId, setModelNameAction2);

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(4));
    expect(transmitFn).toHaveBeenLastCalledWith([
      expect.objectContaining({
        branch: "main",
        documentType: "powerhouse/document-model",
        documentId,
        driveId,
        operations: [
          expect.objectContaining({
            action: expect.objectContaining({
              scope: "global",
              type: "SET_MODEL_NAME",
              input: { name: "test 2" },
              timestampUtcMs: expectUTCTimestamp(expect),
              id: expectUUID(expect),
            }),
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            id: expectUUID(expect) as string,
            index: 1,
            input: { name: "test 2" },
            skip: 0,
            timestampUtcMs: expectUTCTimestamp(expect),
            type: "SET_MODEL_NAME",
            previousState: expect.any(Object),
            state: expect.objectContaining({ name: "test 2" }),
          }),
        ],
        state: expect.objectContaining({ name: "test 2" }),
        scope: "global",
      }),
    ]);
  });

  test("should call disconnect function of processor", async () => {
    const disconnectFn = vitest.fn(() => Promise.resolve());

    const server = await buildServer({
      onStrands: () => Promise.resolve(),
      onDisconnect: disconnectFn,
    });
    await server.deleteDrive(driveId);
    expect(disconnectFn).toHaveBeenCalled();
  });
});
