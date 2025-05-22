import { DocumentModelModule, generateId, setModelName } from "document-model";
import { beforeEach, describe, expect, test, vi, vitest } from "vitest";
import * as DriveActions from "../src/drive-document-model/gen/creators.js";
import { ReactorBuilder } from "../src/server/builder.js";
import { InternalTransmitter } from "../src/server/listener/transmitter/internal.js";
import { expectUTCTimestamp, expectUUID } from "./utils.js";

import { IProcessor } from "#processors/types";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { Listener } from "../src/server/types.js";

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
    const listener: Listener = {
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
        documentId: drive.id,
        documentType: "powerhouse/document-drive",
        driveId: drive.id,
        operations: [],
        scope: "global",
        state: {},
      },
    ]);

    const documentId = generateId();
    const document = documentModelDocumentModelModule.utils.createDocument({
      id: documentId,
    });
    await server.addDocument(document);

    const action = DriveActions.addFile({
      id: documentId,
      name: "test",
      documentType: "powerhouse/document-model",
    });

    const result = await server.addDriveAction(driveId, action);
    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(2));
    expect(transmitFn).toHaveBeenCalledWith([
      {
        branch: "main",
        documentId: drive.id,
        documentType: "powerhouse/document-drive",
        driveId: driveId,
        operations: [
          {
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            context: undefined,
            id: expectUUID(expect) as string,
            index: 0,
            input: {
              id: documentId,
              name: "test",
              documentType: "powerhouse/document-model",
            },
            skip: 0,
            timestamp: expectUTCTimestamp(expect),
            type: "ADD_FILE",
            previousState: {
              icon: "",
              name: "Global Drive",
              nodes: [],
            },
            state: {
              icon: "",
              name: "Global Drive",
              nodes: [
                {
                  documentType: "powerhouse/document-model",
                  id: documentId,
                  kind: "file",
                  name: "test",
                  parentFolder: null,
                },
              ],
            },
          },
        ],
        scope: "global",
        state: result.document!.state.global,
      },
      {
        branch: "main",
        documentId: document.id,
        documentType: "powerhouse/document-model",
        driveId: driveId,
        operations: [],
        scope: "global",
        state: {},
      },
    ]);

    await server.addAction(documentId, setModelName({ name: "test" }));

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
      {
        branch: "main",
        documentType: "powerhouse/document-model",
        documentId,
        driveId,
        operations: [
          {
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            context: undefined,
            id: expectUUID(expect) as string,
            index: 0,
            input: {
              name: "test",
            },
            skip: 0,
            timestamp: expectUTCTimestamp(expect),
            type: "SET_MODEL_NAME",
            previousState: { ...state, name: "" },
            state,
          },
        ],
        state,
        scope: "global",
      },
    ]);

    await server.addAction(documentId, setModelName({ name: "test 2" }));

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(4));
    expect(transmitFn).toHaveBeenLastCalledWith([
      {
        branch: "main",
        documentType: "powerhouse/document-model",
        documentId,
        driveId,
        operations: [
          {
            hash: expect.stringMatching(/^[a-zA-Z0-9+/=]+$/),
            context: undefined,
            id: expectUUID(expect) as string,
            index: 1,
            input: {
              name: "test 2",
            },
            skip: 0,
            timestamp: expectUTCTimestamp(expect),
            type: "SET_MODEL_NAME",
            previousState: state,
            state: { ...state, name: "test 2" },
          },
        ],
        state: {
          author: {
            name: "",
            website: "",
          },
          description: "",
          extension: "",
          id: "",
          name: "test 2",
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
        },
        scope: "global",
      },
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
