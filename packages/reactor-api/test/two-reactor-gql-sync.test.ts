import {
  CompositeChannelFactory,
  ConsoleLogger,
  JobStatus,
  ReactorBuilder,
  ReactorEventTypes,
  SyncBuilder,
  type IEventBus,
  type IReactor,
  type ISyncManager,
  type JobReadReadyEvent,
  type OperationWithContext,
} from "@powerhousedao/reactor";
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

async function setupTwoReactorsWithGqlChannel(): Promise<TwoReactorSetup> {
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

  const filter = {
    documentId: [],
    scope: [],
    branch: "main",
  };

  const gqlParamsToB = {
    url: "http://reactorB/graphql",
    pollIntervalMs: 100,
    maxFailures: 10,
    retryBaseDelayMs: 50,
    fetchFn: resolverBridge,
  };

  // ReactorA adds remote pointing to B
  // touchChannel automatically creates receiving channel on B
  await syncManagerA.add(
    "remoteB",
    "collection1",
    { type: "gql", parameters: gqlParamsToB },
    filter,
  );

  return { reactorA, reactorB, eventBusA, eventBusB };
}

describe("Two-Reactor Sync with GqlChannel", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;
  let eventBusA: IEventBus;
  let eventBusB: IEventBus;

  beforeEach(async () => {
    const setup = await setupTwoReactorsWithGqlChannel();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
    eventBusA = setup.eventBusA;
    eventBusB = setup.eventBusB;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("should sync operation from ReactorA to ReactorB via GqlChannel", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const readyPromise = waitForOperationsReady(eventBusB, document.header.id);
    const jobInfo = await reactorA.create(document);

    await waitForJobCompletion(reactorA, jobInfo.id);

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    await readyPromise;

    const resultB = await reactorB.getOperations(document.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    expect(opsA.length).toBeGreaterThan(0);
    expect(opsB.length).toBe(opsA.length);

    for (let i = 0; i < opsA.length; i++) {
      expect(opsB[i]).toEqual(opsA[i]);
    }

    const docA = await reactorA.get(document.header.id, { branch: "main" });
    const docB = await reactorB.get(document.header.id, { branch: "main" });

    expect(docA).toEqual(docB);
  });

  it("should sync operation from ReactorB to ReactorA via GqlChannel", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const readyPromise = waitForOperationsReady(eventBusA, document.header.id);
    const jobInfo = await reactorB.create(document);

    await waitForJobCompletion(reactorB, jobInfo.id);

    const resultB = await reactorB.getOperations(document.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    await readyPromise;

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    expect(opsB.length).toBeGreaterThan(0);
    expect(opsA.length).toBe(opsB.length);

    for (let i = 0; i < opsB.length; i++) {
      expect(opsA[i]).toEqual(opsB[i]);
    }

    const docA = await reactorA.get(document.header.id, { branch: "main" });
    const docB = await reactorB.get(document.header.id, { branch: "main" });

    expect(docA).toEqual(docB);
  });

  it("should sync multiple documents with concurrent operations from both reactors", async () => {
    // Create 4 documents (2 for each reactor)
    const docA1 = driveDocumentModelModule.utils.createDocument();
    const docA2 = driveDocumentModelModule.utils.createDocument();
    const docB1 = driveDocumentModelModule.utils.createDocument();
    const docB2 = driveDocumentModelModule.utils.createDocument();

    const allDocIds = [
      docA1.header.id,
      docA2.header.id,
      docB1.header.id,
      docB2.header.id,
    ];

    // Set up listeners for docs to sync to the other reactor
    const readyOnB_A1 = waitForOperationsReady(eventBusB, docA1.header.id);
    const readyOnB_A2 = waitForOperationsReady(eventBusB, docA2.header.id);
    const readyOnA_B1 = waitForOperationsReady(eventBusA, docB1.header.id);
    const readyOnA_B2 = waitForOperationsReady(eventBusA, docB2.header.id);

    // Create documents on their respective reactors
    const [jobA1, jobA2] = await Promise.all([
      reactorA.create(docA1),
      reactorA.create(docA2),
    ]);
    const [jobB1, jobB2] = await Promise.all([
      reactorB.create(docB1),
      reactorB.create(docB2),
    ]);

    // Wait for all creates to complete on source reactors
    await Promise.all([
      waitForJobCompletion(reactorA, jobA1.id),
      waitForJobCompletion(reactorA, jobA2.id),
      waitForJobCompletion(reactorB, jobB1.id),
      waitForJobCompletion(reactorB, jobB2.id),
    ]);

    // Wait for all docs to sync to the other reactor
    await Promise.all([readyOnB_A1, readyOnB_A2, readyOnA_B1, readyOnA_B2]);

    // Now fire concurrent modify operations on each doc
    void reactorA.execute(docA1.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive A1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-a1",
        name: "Folder A1",
        parentFolder: null,
      }),
    ]);
    void reactorA.execute(docA2.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive A2" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-a2",
        name: "Folder A2",
        parentFolder: null,
      }),
    ]);
    void reactorB.execute(docB1.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive B1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-b1",
        name: "Folder B1",
        parentFolder: null,
      }),
    ]);
    void reactorB.execute(docB2.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive B2" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-b2",
        name: "Folder B2",
        parentFolder: null,
      }),
    ]);

    // Poll until all 4 documents are synced on both reactors
    const startTime = Date.now();
    const timeout = 25000;
    let synced = false;

    while (Date.now() - startTime < timeout) {
      let allDocsSynced = true;

      for (const docId of allDocIds) {
        try {
          const resultA = await reactorA.getOperations(docId, {
            branch: "main",
          });
          const opsA = Object.values(resultA).flatMap((scope) => scope.results);

          const resultB = await reactorB.getOperations(docId, {
            branch: "main",
          });
          const opsB = Object.values(resultB).flatMap((scope) => scope.results);

          // Each doc should have at least 2 ops (create + execute with actions)
          // and both reactors should have same count
          if (
            opsA.length < 2 ||
            opsB.length < 2 ||
            opsA.length !== opsB.length
          ) {
            allDocsSynced = false;
            break;
          }
        } catch {
          // Document may not exist on one reactor yet
          allDocsSynced = false;
          break;
        }
      }

      if (allDocsSynced) {
        synced = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(synced).toBe(true);

    // Verify operation equality for all 4 documents
    for (const docId of allDocIds) {
      const resultA = await reactorA.getOperations(docId, { branch: "main" });
      const opsA = Object.values(resultA).flatMap((scope) => scope.results);

      const resultB = await reactorB.getOperations(docId, { branch: "main" });
      const opsB = Object.values(resultB).flatMap((scope) => scope.results);

      expect(opsA.length).toBeGreaterThan(0);
      expect(opsB.length).toBe(opsA.length);

      for (let i = 0; i < opsA.length; i++) {
        expect(opsB[i]).toEqual(opsA[i]);
      }
    }

    // Verify document state equality for all 4 documents
    for (const docId of allDocIds) {
      const docFromA = await reactorA.get(docId, { branch: "main" });
      const docFromB = await reactorB.get(docId, { branch: "main" });

      expect(docFromA).toEqual(docFromB);
    }
  }, 30000);
});
