import { driveDocumentModelModule } from "#drive-document-model/module";
import { ReactorBuilder } from "#server/builder";
import {
  DefaultRemoteDriveInput,
  DocumentDriveServerOptions,
} from "#server/types";
import { generateUUID } from "#utils/misc";
import { RunAsap } from "#utils/run-asap";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
} from "document-model";
import { bench, BenchOptions, describe, vi } from "vitest";
import { BrowserStorage } from "../../src/storage/browser";
import GetDrive from "./getDrive.json";
import Strands from "./strands.small.json";

const DRIVE_ID = GetDrive.data.drive.id;
const documentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule[];

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
                listenerId: generateUUID(),
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

const ITERATIONS = 10;
const WARMUP = 5;
const THROWS = true;

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
        pullInterval: 3000,
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
      .withStorage(new BrowserStorage(generateUUID()))
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

  const setImmediate = RunAsap.useSetImmediate;
  bench.skipIf(setImmediate instanceof Error)(
    "setImmediate",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(
          setImmediate as RunAsap.RunAsap<unknown>,
          resolve,
          reject,
        );
      });
    },
    BENCH_OPTIONS,
  );

  const messageChannel = RunAsap.useMessageChannel;
  bench.skipIf(messageChannel instanceof Error)(
    "MessageChannel",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(
          messageChannel as RunAsap.RunAsap<unknown>,
          resolve,
          reject,
        );
      });
    },
    BENCH_OPTIONS,
  );

  const postMessage = RunAsap.usePostMessage;
  bench.skipIf(postMessage instanceof Error)(
    "window.postMessage",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(
          postMessage as RunAsap.RunAsap<unknown>,
          resolve,
          reject,
        );
      });
    },
    BENCH_OPTIONS,
  );

  const setTimeout = RunAsap.useSetTimeout;
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
