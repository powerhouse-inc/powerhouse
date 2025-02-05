import {
  DocumentDriveDocument,
  utils,
} from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModelModule } from "document-model/document";
import * as DocumentModelLib from "document-model/document-model";
import { beforeEach, describe, expect, test, vi, vitest } from "vitest";
import {
  DocumentDriveServer,
  InternalTransmitterUpdate,
  IReceiver,
} from "../src";
import { expectUTCTimestamp, expectUUID } from "./utils";

describe("Internal Listener", () => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule[];

  async function buildServer(receiver: IReceiver) {
    const server = new DocumentDriveServer(documentModels);
    await server.initialize();

    await server.addDrive({
      global: {
        id: "drive",
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
    await server.addInternalListener("drive", receiver, {
      block: true,
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global"],
      },
      label: "Internal",
      listenerId: "internal",
    });
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

    const action = utils.generateAddNodeAction(
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

    const update: InternalTransmitterUpdate<DocumentDriveDocument, "global"> = {
      branch: "main",
      documentId: "",
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

    await server.addAction(
      "drive",
      "1",
      DocumentModelLib.actions.setModelName({ name: "test" }),
    );

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

    await server.addAction(
      "drive",
      "1",
      DocumentModelLib.actions.setModelName({ name: "test 2" }),
    );

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

  test("should call disconnect function of receiver", async () => {
    const disconnectFn = vitest.fn(() => Promise.resolve());

    const server = await buildServer({
      onStrands: () => Promise.resolve(),
      onDisconnect: disconnectFn,
    });
    await server.deleteDrive("drive");
    expect(disconnectFn).toHaveBeenCalled();
  });
});
