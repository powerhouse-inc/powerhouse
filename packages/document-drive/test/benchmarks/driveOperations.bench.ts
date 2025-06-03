import { driveDocumentModelModule } from "#drive-document-model/module";
import { BaseQueueManager } from "#queue/base";
import { ReactorBuilder } from "#server/builder";
import { DocumentDriveServerOptions } from "#server/types";
import { createWorkerPool } from "#utils/worker";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
} from "document-model";
import { bench, BenchOptions, describe } from "vitest";
import { addFolder } from "../../src/drive-document-model/gen/creators.js";
import { BrowserStorage } from "../../src/storage/browser.js";

const documentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule[];

const BENCH_OPTIONS: BenchOptions = {
  iterations: 10,
  warmupIterations: 5,
  throws: true,
};

describe("Process Operations", () => {
  const drive = driveDocumentModelModule.utils.createDocument();
  const drive2 = driveDocumentModelModule.utils.createDocument();
  const actions = new Array(100)
    .fill(0)
    .map((_, i) => addFolder({ id: generateId(), name: `Folder ${i}` }));

  async function processOperations(
    runOnMacroTask: DocumentDriveServerOptions["taskQueueMethod"],
  ) {
    const server = new ReactorBuilder(documentModels)
      .withStorage(new BrowserStorage(generateId()))
      .withQueueManager(new BaseQueueManager(3))
      .withOptions({
        taskQueueMethod: runOnMacroTask,
      })
      .build();

    const method = runOnMacroTask ? "blocking" : "worker pool";

    await server.addDrive({ id: drive.id, global: drive.state.global });
    await server.addDrive({ id: drive2.id, global: drive2.state.global });
    await Promise.all([
      server.queueDriveActions(drive.id, actions),
      server.queueDriveActions(drive2.id, actions),
    ]);
  }

  bench(
    "blocking",
    async () => {
      await processOperations(null);
    },
    BENCH_OPTIONS,
  );

  const pool = createWorkerPool();
  bench(
    "Worker Pool",
    async () => {
      await processOperations(pool as any);
    },
    BENCH_OPTIONS,
  );

  // const setImmediate = RunAsap.useSetImmediate;
  // bench.skipIf(setImmediate instanceof Error)(
  //   "setImmediate",
  //   async () => {
  //     await processOperations(setImmediate as RunAsap.RunAsap<unknown>);
  //   },
  //   BENCH_OPTIONS,
  // );

  // const messageChannel = RunAsap.useMessageChannel;
  // bench.skipIf(messageChannel instanceof Error)(
  //   "MessageChannel",
  //   async () => {
  //     await processOperations(messageChannel as RunAsap.RunAsap<unknown>);
  //   },
  //   BENCH_OPTIONS,
  // );

  // const postMessage = RunAsap.usePostMessage;
  // bench.skipIf(postMessage instanceof Error)(
  //   "window.postMessage",
  //   async () => {
  //     await processOperations(postMessage as RunAsap.RunAsap<unknown>);
  //   },
  //   BENCH_OPTIONS,
  // );

  // const setTimeout = RunAsap.useSetTimeout;
  // bench.skipIf(setTimeout instanceof Error)(
  //   "setTimeout",
  //   async () => {
  //     await processOperations(setTimeout as RunAsap.RunAsap<unknown>);
  //   },
  //   BENCH_OPTIONS,
  // );
});
