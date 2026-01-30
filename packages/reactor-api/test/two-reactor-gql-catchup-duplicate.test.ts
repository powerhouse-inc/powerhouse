import {
  CompositeChannelFactory,
  ConsoleLogger,
  driveCollectionId,
  JobStatus,
  ReactorEventTypes,
  ReactorBuilder,
  SyncBuilder,
  type IEventBus,
  type IReactor,
  type ISyncManager,
  type JobReadReadyEvent,
  type OperationWithContext,
} from "@powerhousedao/reactor";

type JobFailedEventFromEventBus = {
  jobId: string;
  error: Error;
};
import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
  syncManagerA: ISyncManager;
  syncManagerB: ISyncManager;
  resolverBridge: typeof fetch;
};

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 5000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await reactor.getJobStatus(jobId);

    if (status.status === JobStatus.READ_READY) {
      return;
    }

    if (status.status === JobStatus.FAILED) {
      throw new Error(`Job failed: ${status.error?.message || "Unknown"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Job did not complete within ${timeoutMs}ms`);
}

async function waitForOperationsReady(
  eventBus: IEventBus,
  documentId: string,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `OPERATIONS_READY event for document ${documentId} not received within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const unsubscribe = eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (type: number, event: JobReadReadyEvent) => {
        const hasDocument = event.operations.some(
          (op: OperationWithContext) => op.context.documentId === documentId,
        );

        if (hasDocument) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      },
    );
  });
}

/**
 * Creates a unique key for an operation using id + index + skip.
 * Per deriveOperationId, the same operation ID can appear with different index values.
 * A true duplicate is identified by the combination of id + index + skip.
 */
function createOperationKey(op: OperationWithContext): string {
  return `${op.operation.id}:${op.operation.index}:${op.operation.skip}`;
}

type OperationCollector = {
  operationKeys: Set<string>;
  allOperations: OperationWithContext[];
  duplicates: OperationWithContext[];
  waitForCount: (count: number) => Promise<void>;
  stop: () => void;
};

/**
 * Creates a collector that subscribes to OPERATIONS_READY events and tracks
 * operations for a specific document, detecting duplicates.
 */
function collectOperationsReady(
  eventBus: IEventBus,
  documentId: string,
  timeoutMs = 10000,
): OperationCollector {
  const operationKeys = new Set<string>();
  const allOperations: OperationWithContext[] = [];
  const duplicates: OperationWithContext[] = [];
  let waitResolve: (() => void) | null = null;
  let waitCount = 0;

  const unsubscribe = eventBus.subscribe(
    ReactorEventTypes.JOB_READ_READY,
    (type: number, event: JobReadReadyEvent) => {
      for (const op of event.operations) {
        if (op.context.documentId !== documentId) {
          continue;
        }

        const key = createOperationKey(op);
        allOperations.push(op);

        if (operationKeys.has(key)) {
          duplicates.push(op);
        } else {
          operationKeys.add(key);
        }
      }

      if (waitResolve && allOperations.length >= waitCount) {
        waitResolve();
        waitResolve = null;
      }
    },
  );

  return {
    operationKeys,
    allOperations,
    duplicates,
    waitForCount: (count: number) => {
      if (allOperations.length >= count) {
        return Promise.resolve();
      }

      waitCount = count;
      return new Promise<void>((resolve, reject) => {
        waitResolve = resolve;
        setTimeout(() => {
          if (waitResolve) {
            waitResolve = null;
            reject(
              new Error(
                `Expected ${count} operations but received ${allOperations.length} within ${timeoutMs}ms`,
              ),
            );
          }
        }, timeoutMs);
      });
    },
    stop: () => {
      unsubscribe();
    },
  };
}

type DuplicateFailureCollector = {
  failures: JobFailedEventFromEventBus[];
  stop: () => void;
};

/**
 * Creates a collector that subscribes to JOB_FAILED events and tracks failures
 * that indicate duplicate operations (document already exists errors).
 */
function collectDuplicateFailures(
  eventBus: IEventBus,
): DuplicateFailureCollector {
  const failures: JobFailedEventFromEventBus[] = [];

  const unsubscribe = eventBus.subscribe(
    ReactorEventTypes.JOB_FAILED,
    (type: number, event: JobFailedEventFromEventBus) => {
      if (event.error.message.includes("already exists")) {
        failures.push(event);
      }
    },
  );

  return {
    failures,
    stop: () => {
      unsubscribe();
    },
  };
}

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  const syncManagerRegistry = new Map<string, ISyncManager>();

  const resolverBridge = createResolverBridge(syncManagerRegistry);

  const logger = new ConsoleLogger(["test"]);
  const channelFactoryA = new CompositeChannelFactory(logger);
  const channelFactoryB = new CompositeChannelFactory(logger);

  const models = [
    driveDocumentModelModule,
    documentModelDocumentModelModule,
  ] as DocumentModelModule<any>[];
  const reactorAModule = await new ReactorBuilder()
    .withDocumentModels(models)
    .withSync(new SyncBuilder().withChannelFactory(channelFactoryA))
    .buildModule();
  const reactorA = reactorAModule.reactor;
  const eventBusA = reactorAModule.eventBus;
  const syncManagerA = reactorAModule.syncModule!.syncManager;

  const reactorBModule = await new ReactorBuilder()
    .withDocumentModels(models)
    .withSync(new SyncBuilder().withChannelFactory(channelFactoryB))
    .buildModule();
  const reactorB = reactorBModule.reactor;
  const eventBusB = reactorBModule.eventBus;
  const syncManagerB = reactorBModule.syncModule!.syncManager;

  syncManagerRegistry.set("reactora", syncManagerA);
  syncManagerRegistry.set("reactorb", syncManagerB);

  return {
    reactorA,
    reactorB,
    eventBusA,
    eventBusB,
    syncManagerA,
    syncManagerB,
    resolverBridge,
  };
}

describe("Two-Reactor GQL Catchup Duplicate Operations Bug", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;
  let eventBusA: IEventBus;
  let eventBusB: IEventBus;
  let syncManagerA: ISyncManager;
  let resolverBridge: typeof fetch;

  beforeEach(async () => {
    const setup = await setupTwoReactors();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
    eventBusA = setup.eventBusA;
    eventBusB = setup.eventBusB;
    syncManagerA = setup.syncManagerA;
    resolverBridge = setup.resolverBridge;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("should not produce duplicate operations when remote is removed and re-added", async () => {
    const driveDocument = driveDocumentModelModule.utils.createDocument();
    const collectionId = driveCollectionId("main", driveDocument.header.id);

    const jobInfo = await reactorA.create(driveDocument);
    await waitForJobCompletion(reactorA, jobInfo.id);

    const gqlParamsToB = {
      url: "http://reactorB/graphql",
      pollIntervalMs: 100,
      maxFailures: 10,
      retryBaseDelayMs: 50,
      fetchFn: resolverBridge,
    };

    const filter = {
      documentId: [],
      scope: [],
      branch: "main",
    };

    const readyPromiseB = waitForOperationsReady(
      eventBusB,
      driveDocument.header.id,
    );
    await syncManagerA.add(
      "remoteB",
      collectionId,
      { type: "gql", parameters: gqlParamsToB },
      filter,
    );
    await readyPromiseB;

    const resultA = await reactorA.getOperations(driveDocument.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);
    expect(opsA.length).toBeGreaterThan(0);

    const resultB = await reactorB.getOperations(driveDocument.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);
    expect(opsB.length).toBe(opsA.length);

    const operationCollector = collectOperationsReady(
      eventBusA,
      driveDocument.header.id,
      15000,
    );
    const failureCollector = collectDuplicateFailures(eventBusA);

    try {
      await syncManagerA.remove("remoteB");

      await new Promise((resolve) => setTimeout(resolve, 200));

      await syncManagerA.add(
        "remoteB",
        collectionId,
        { type: "gql", parameters: gqlParamsToB },
        filter,
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(
        operationCollector.duplicates.length,
        "Duplicate operations were received via OPERATIONS_READY events",
      ).toBe(0);
      expect(
        failureCollector.failures.length,
        "Duplicate operations caused 'document already exists' failures - this indicates the catchup backfill bug",
      ).toBe(0);
    } finally {
      operationCollector.stop();
      failureCollector.stop();
    }
  }, 20000);

  it("should not produce duplicate operations after multiple remove/re-add cycles", async () => {
    const driveDocument = driveDocumentModelModule.utils.createDocument();
    const collectionId = driveCollectionId("main", driveDocument.header.id);

    const jobInfo = await reactorA.create(driveDocument);
    await waitForJobCompletion(reactorA, jobInfo.id);

    await reactorA.execute(driveDocument.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Test Drive" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-1",
        name: "Folder 1",
        parentFolder: null,
      }),
    ]);

    const gqlParamsToB = {
      url: "http://reactorB/graphql",
      pollIntervalMs: 100,
      maxFailures: 10,
      retryBaseDelayMs: 50,
      fetchFn: resolverBridge,
    };

    const filter = {
      documentId: [],
      scope: [],
      branch: "main",
    };

    const readyPromiseB = waitForOperationsReady(
      eventBusB,
      driveDocument.header.id,
    );
    await syncManagerA.add(
      "remoteB",
      collectionId,
      { type: "gql", parameters: gqlParamsToB },
      filter,
    );
    await readyPromiseB;

    await new Promise((resolve) => setTimeout(resolve, 500));

    const operationCollector = collectOperationsReady(
      eventBusA,
      driveDocument.header.id,
      30000,
    );
    const failureCollector = collectDuplicateFailures(eventBusA);

    try {
      for (let cycle = 0; cycle < 3; cycle++) {
        await syncManagerA.remove("remoteB");

        await new Promise((resolve) => setTimeout(resolve, 200));

        await syncManagerA.add(
          "remoteB",
          collectionId,
          { type: "gql", parameters: gqlParamsToB },
          filter,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(
        operationCollector.duplicates.length,
        "Duplicate operations were received via OPERATIONS_READY events",
      ).toBe(0);
      expect(
        failureCollector.failures.length,
        "Duplicate operations caused 'document already exists' failures after 3 remove/re-add cycles - this indicates the catchup backfill bug",
      ).toBe(0);
    } finally {
      operationCollector.stop();
      failureCollector.stop();
    }
  }, 45000);
});
