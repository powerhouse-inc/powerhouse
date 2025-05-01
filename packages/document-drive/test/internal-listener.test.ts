import { DocumentModelModule, generateId, setModelName } from "document-model";
import { beforeEach, describe, expect, test, vi, vitest } from "vitest";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types.js";
import { generateAddNodeAction } from "../src/drive-document-model/src/utils.js";
import { ReactorBuilder } from "../src/server/builder.js";
import {
  InternalTransmitter,
  InternalTransmitterUpdate,
  IProcessor,
} from "../src/server/listener/transmitter/internal.js";
import { expectUTCTimestamp, expectUUID } from "./utils";

import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { Listener } from "../src/server/types.js";

describe("Internal Listener", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[];

  async function buildServer(processor: IProcessor) {
    const builder = new ReactorBuilder(documentModels);
    const server = builder.build();
    await server.initialize();

    const driveId = "drive";
    await server.addDrive({
      global: {
        id: driveId,
        name: "Global Drive",
        icon: "",
        slug: "global",
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
    const transmitFn = vitest.fn(() => {
      return Promise.resolve();
    });

    const server = await buildServer({
      onStrands: transmitFn,
      onDisconnect: () => Promise.resolve(),
    });
    const drive = await server.getDrive("drive");

    const action = generateAddNodeAction(
      drive.state.global,
      {
        id: "1",
        name: "test",
        documentType: "powerhouse/document-model",
      },
      ["global", "local"],
    );
    await server.addDriveAction("drive", action);
    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(1));

    const update: InternalTransmitterUpdate<DocumentDriveDocument> = {
      branch: "main",
      documentId: "drive",
      driveId: "drive",
      operations: [
        {
          hash: expect.any(String) as string,
          context: undefined,
          id: expectUUID(expect) as string,
          index: 0,
          input: action.input,
          skip: 0,
          timestamp: "2024-01-01T00:00:00.000Z",
          type: "ADD_FILE",
          state: {
            icon: "",
            id: "drive",
            name: "Global Drive",
            nodes: [
              {
                documentType: "powerhouse/document-model",
                id: "1",
                kind: "file",
                name: "test",
                parentFolder: null,
                synchronizationUnits: [
                  {
                    branch: "main",
                    scope: "global",
                    syncId: expectUUID(expect) as string,
                  },
                  {
                    branch: "main",
                    scope: "local",
                    syncId: expectUUID(expect) as string,
                  },
                ],
              },
            ],
            slug: "global",
          },
          previousState: {
            icon: "",
            id: "drive",
            name: "Global Drive",
            nodes: [],
            slug: "global",
          },
        },
      ],
      state: {
        icon: "",
        id: "drive",
        name: "Global Drive",
        nodes: [
          {
            documentType: "powerhouse/document-model",
            id: "1",
            kind: "file",
            name: "test",
            parentFolder: null,
            synchronizationUnits: [
              {
                branch: "main",
                scope: "global",
                syncId: action.input.synchronizationUnits[0]?.syncId,
              },
              {
                branch: "main",
                scope: "local",
                syncId: action.input.synchronizationUnits[1]?.syncId,
              },
            ],
          },
        ],
        slug: "global",
      },
      scope: "global",
    };
    expect(transmitFn).toHaveBeenCalledWith([update]);

    await server.addAction("drive", "1", setModelName({ name: "test" }));

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(2));

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
        documentId: "1",
        driveId: "drive",
        operations: [
          {
            hash: "nWKpqR6ns0l8C/Khwrl+SyKy0sA=",
            context: undefined,
            id: expectUUID(expect),
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

    await server.addAction("drive", "1", setModelName({ name: "test 2" }));

    await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(3));
    expect(transmitFn).toHaveBeenLastCalledWith([
      {
        branch: "main",
        documentId: "1",
        driveId: "drive",
        operations: [
          {
            hash: "s7RBcer0JqjSGvNb12gqpeeJGRY=",
            context: undefined,
            id: expectUUID(expect),
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
    await server.deleteDrive("drive");
    expect(disconnectFn).toHaveBeenCalled();
  });
});
