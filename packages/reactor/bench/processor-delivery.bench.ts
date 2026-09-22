import { setModelName } from "@powerhousedao/shared/document-model";
import type {
  DocumentModelModule,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  IProcessor,
  ProcessorFactory,
} from "@powerhousedao/shared/processors";
import { documentModelDocumentModelModule } from "document-model";
import { describe } from "vitest";
import { bench } from "./loud-bench.js";
import { ReactorBuilder } from "../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../src/core/types.js";
import type { ReadModelIndexedEvent } from "../src/events/types.js";
import { ReactorEventTypes } from "../src/events/types.js";

/**
 * Prices processor delivery when many documents' batches reach the processor
 * manager at once. Each document projects on its own coordinator key, so its
 * creation and its edit are separate post-ready passes; with N documents in
 * flight the manager sees up to 2N passes competing for one processor whose
 * onOperations does real work.
 */

const DOCS_PER_ITERATION = 16;
/** Roughly what a small relational-db processor spends per operation. */
const WORK_PER_OPERATION_MS = 0.2;

function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy
  }
}

class BusyProcessor implements IProcessor {
  delivered = 0;

  onOperations(operations: OperationWithContext[]): Promise<void> {
    for (let i = 0; i < operations.length; i++) spin(WORK_PER_OPERATION_MS);
    this.delivered += operations.length;
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}

type Fixture = {
  module: InProcessReactorModule;
  processor: BusyProcessor;
  /** Resolves once the processor manager has indexed the job. */
  managerIndexed: (jobId: string) => Promise<void>;
  readReady: (jobId: string) => Promise<void>;
  destroy: () => Promise<void>;
};

function awaiter(): {
  wait: (jobId: string) => Promise<void>;
  arrive: (jobId: string) => void;
} {
  const seen = new Set<string>();
  const waiting = new Map<string, () => void>();
  return {
    wait: (jobId) =>
      seen.has(jobId)
        ? Promise.resolve()
        : new Promise((resolve) => waiting.set(jobId, resolve)),
    arrive: (jobId) => {
      seen.add(jobId);
      waiting.get(jobId)?.();
      waiting.delete(jobId);
    },
  };
}

async function createFixture(): Promise<Fixture> {
  const module = await new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .buildModule();

  const indexed = awaiter();
  module.eventBus.subscribe<ReadModelIndexedEvent>(
    ReactorEventTypes.READMODEL_INDEXED,
    (_type, event) => {
      if (event.readModelName === "processor-manager")
        indexed.arrive(event.jobId);
    },
  );
  const ready = awaiter();
  module.eventBus.subscribe<{ jobId: string }>(
    ReactorEventTypes.JOB_READ_READY,
    (_type, event) => ready.arrive(event.jobId),
  );

  const processor = new BusyProcessor();
  const factory: ProcessorFactory = () => [
    {
      processor,
      filter: {
        documentType: ["powerhouse/document-model"],
        documentId: ["*"],
      },
    },
  ];
  await module.processorManager.registerFactory("busy", factory);

  // One drive so the factory produces exactly one processor.
  const drive = driveDocumentModelModule.utils.createDocument();
  const driveJob = await module.reactor.create(drive);
  await indexed.wait(driveJob.id);

  return {
    module,
    processor,
    managerIndexed: indexed.wait,
    readReady: ready.wait,
    destroy: async () => {
      module.reactor.kill();
      await module.database.destroy();
    },
  };
}

/**
 * tinybench does not await teardown, so the destroy it starts is chained here
 * and awaited by the next fixture instead.
 */
let pendingTeardown: Promise<void> = Promise.resolve();

/** Creates N documents at once, then edits each one; returns when the manager has indexed every job. */
async function deliverRound(fixture: Fixture): Promise<void> {
  const { module, managerIndexed, readReady } = fixture;

  const creates = await Promise.all(
    Array.from({ length: DOCS_PER_ITERATION }, () =>
      module.reactor.create(
        documentModelDocumentModelModule.utils.createDocument(),
      ),
    ),
  );
  // An edit needs its document committed; the manager passes still overlap
  // across documents.
  await Promise.all(creates.map((job) => readReady(job.id)));

  const edits = await Promise.all(
    creates.map((job, i) =>
      module.reactor.execute(job.documentId, "main", [
        setModelName({ name: `doc-${i}` }),
      ]),
    ),
  );

  await Promise.all(
    [...creates, ...edits].map((job) => managerIndexed(job.id)),
  );
}

describe("processor delivery under concurrent batches", () => {
  let fixture: Fixture;

  bench(
    `${DOCS_PER_ITERATION} documents created and edited, one busy processor`,
    async () => {
      await deliverRound(fixture);
    },
    {
      iterations: 10,
      warmupIterations: 1,
      time: 0,
      warmupTime: 0,
      async setup() {
        await pendingTeardown;
        fixture = await createFixture();
      },
      teardown() {
        pendingTeardown = fixture.destroy();
      },
    },
  );
});
