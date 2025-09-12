import {
  BrowserStorage,
  type DefaultRemoteDriveInput,
  type DocumentDriveServerOptions,
  driveDocumentModelModule,
  ReactorBuilder,
  type RunAsap,
} from "document-drive";

import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  generateId,
} from "document-model";
import { bench, type BenchOptions, describe, vi } from "vitest";
import {
  useMessageChannel,
  usePostMessage,
  useSetImmediate,
  useSetTimeout,
} from "../../src/utils/run-asap.js";
import GetDrive from "./getDrive.json" with { type: "json" };
import Strands from "./strands.small.json" with { type: "json" };
const DRIVE_ID = GetDrive.data.drive.id;
const documentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule<any>[];

vi.mock(import("graphql-request"), async () => {
  const originalModule = await vi.importActual("graphql-request");

  return {
    ...originalModule,
    GraphQLClient: vi.fn().mockImplementation(() => {
      return {
        request: vi.fn().mockImplementation((query: string) => {
          if (query.includes("query getDrive")) {
            return Promise.resolve(GetDrive.data);
          }

          let done = false;
          if (query.includes("query strands")) {
            if (done) {
              return Promise.resolve({
                system: {
                  sync: {
                    strands: [],
                  },
                },
              });
            }
            done = true;
            return Promise.resolve((Strands as { data: object }).data);
          }

          if (query.includes("mutation registerPullResponderListener")) {
            return Promise.resolve({
              registerPullResponderListener: {
                listenerId: generateId(),
              },
            });
          }

          if (query.includes("mutation pushUpdates")) {
            return Promise.resolve({
              pushUpdates: {
                acknowledge: true,
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

const BENCH_OPTIONS: BenchOptions = {
  iterations: 10,
  warmupIterations: 5,
  throws: true,
};

describe("Process Operations", () => {
  const defaultRemoteDrives: DefaultRemoteDriveInput[] = [
    {
      url: DRIVE_ID,
      options: {
        sharingType: "PUBLIC",
        availableOffline: true,
        listeners: [
          {
            block: true,
            callInfo: {
              data: DRIVE_ID,
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
        accessLevel: "WRITE",
      },
    },
  ];

  function processStrands(
    runOnMacroTask: DocumentDriveServerOptions["taskQueueMethod"],
    callback: () => void,
    onError: (error: Error) => void,
  ) {
    const server = new ReactorBuilder(documentModels)
      .withStorage(new BrowserStorage(generateId()))
      .withOptions({
        defaultDrives: { remoteDrives: defaultRemoteDrives },
        taskQueueMethod: runOnMacroTask,
      })
      .build();
    let strands = 0;
    server.on("syncStatus", (driveId, status, error, object) => {
      if (status === "SUCCESS") {
        // number of strands in the test file
        if (++strands === Strands.data.system.sync.strands.length) {
          callback();
        }
      } else if (!["INITIAL_SYNC", "SYNCING"].includes(status)) {
        onError(
          error ??
            new Error("Sync Status Error", {
              cause: object,
            }),
        );
      }
    });
  }

  bench(
    "blocking",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(null, resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );

  const setImmediate = useSetImmediate;
  bench.skipIf(setImmediate instanceof Error)(
    "setImmediate",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(setImmediate as RunAsap<unknown>, resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );

  const messageChannel = useMessageChannel;
  bench.skipIf(messageChannel instanceof Error)(
    "MessageChannel",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(messageChannel as RunAsap<unknown>, resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );

  const postMessage = usePostMessage;
  bench.skipIf(postMessage instanceof Error)(
    "window.postMessage",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(postMessage as RunAsap<unknown>, resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );

  const setTimeout = useSetTimeout;
  bench.skipIf(setTimeout instanceof Error)(
    "setTimeout",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(setTimeout, resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );
});
