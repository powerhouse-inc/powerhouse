import { addFolder } from "#drive-document-model/gen/creators";
import { driveDocumentModelModule } from "#drive-document-model/module";
import { EventQueueManager } from "#queue/event";
import { IQueueManager } from "#queue/types";
import { ReactorBuilder } from "#server/builder";
import { MemoryStorage } from "#storage/memory";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
} from "document-model";
import { bench, BenchOptions, describe } from "vitest";
import { buildOperations } from "../utils.js";

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
  const driveId = generateId();
  const drive = driveDocumentModelModule.utils.createDocument({ id: driveId });
  const operations = buildOperations(
    driveDocumentModelModule.reducer,
    drive,
    new Array(500)
      .fill(0)
      .map((_, index) =>
        addFolder({ id: generateId(), name: `folder ${index}` }),
      ),
  );

  async function processStrands(
    queueManager: IQueueManager,
    callback: () => void,
    onError: (error: Error) => void,
  ) {
    const server = new ReactorBuilder(documentModels)
      .withStorage(new MemoryStorage())
      .withQueueManager(queueManager)
      .build();

    await server.addDrive({
      id: driveId,
      global: {
        name: drive.state.global.name,
        icon: drive.state.global.icon,
      },
      slug: drive.slug,
      local: drive.state.local,
    });

    await Promise.all(
      operations.map((op) => server.queueDriveOperation(driveId, op)),
    );

    callback();
  }

  bench(
    "EventQueueManager",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(new EventQueueManager(1), resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );

  bench(
    "EventQueueManager with 10 workers",
    () => {
      return new Promise<void>((resolve, reject) => {
        processStrands(new EventQueueManager(10), resolve, reject);
      });
    },
    BENCH_OPTIONS,
  );
});
