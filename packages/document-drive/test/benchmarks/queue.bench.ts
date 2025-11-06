import type { IQueueManager } from "document-drive";
import {
  addFolder,
  driveCreateDocument,
  driveDocumentModelModule,
} from "document-drive/drive-document-model";
import { EventQueueManager } from "document-drive/queue/event";
import { ReactorBuilder } from "document-drive/server/builder";
import { MemoryStorage } from "document-drive/storage/memory";
import { buildOperations } from "document-drive/utils/test";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { createPresignedHeader, generateId } from "document-model/core";
import type { BenchOptions } from "vitest";
import { bench, describe } from "vitest";

const documentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule<any>[];

const BENCH_OPTIONS: BenchOptions = {
  iterations: 10,
  warmupIterations: 5,
  throws: true,
};

describe("Process Operations", () => {
  const driveId = generateId();
  const driveDocument = driveCreateDocument();
  const header = createPresignedHeader(
    driveId,
    driveDocument.header.documentType,
  );
  const drive = driveCreateDocument();
  drive.header = header;
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
      slug: drive.header.slug,
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
