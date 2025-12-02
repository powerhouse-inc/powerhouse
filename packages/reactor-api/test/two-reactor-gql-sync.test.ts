import {
  GqlChannelFactory,
  JobStatus,
  OperationEventTypes,
  ReactorBuilder,
  SyncBuilder,
  type IEventBus,
  type IReactor,
  type ISyncManager,
  type OperationsReadyEvent,
  type OperationWithContext,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
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

    if (status.status === JobStatus.READ_MODELS_READY) {
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
      OperationEventTypes.OPERATIONS_READY,
      (type: number, event: OperationsReadyEvent) => {
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

async function waitForMultipleOperationsReady(
  eventBus: IEventBus,
  expectedCount: number,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let count = 0;

    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Expected ${expectedCount} OPERATIONS_READY events but received ${count} within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const unsubscribe = eventBus.subscribe(
      OperationEventTypes.OPERATIONS_READY,
      () => {
        count++;

        if (count >= expectedCount) {
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

  const gqlChannelFactoryA = new GqlChannelFactory();
  const gqlChannelFactoryB = new GqlChannelFactory();

  const reactorAModule = await new ReactorBuilder()
    .withSync(new SyncBuilder().withChannelFactory(gqlChannelFactoryA))
    .buildModule();
  const reactorA = reactorAModule.reactor;
  const eventBusA = reactorAModule.eventBus;
  const syncManagerA = reactorAModule.syncModule!.syncManager;

  const reactorBModule = await new ReactorBuilder()
    .withSync(new SyncBuilder().withChannelFactory(gqlChannelFactoryB))
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

  const gqlParamsToA = {
    url: "http://reactorA/graphql",
    pollIntervalMs: 100,
    maxFailures: 10,
    retryBaseDelayMs: 50,
    fetchFn: resolverBridge,
  };

  const remoteAtoB = await syncManagerA.add(
    "remoteB",
    "collection1",
    { type: "gql", parameters: gqlParamsToB },
    filter,
  );

  await syncManagerB.add(
    "incoming-from-A",
    "collection1",
    { type: "gql", parameters: gqlParamsToA },
    filter,
    {},
    remoteAtoB.id,
  );

  const remoteBtoA = await syncManagerB.add(
    "remoteA",
    "collection1",
    { type: "gql", parameters: gqlParamsToA },
    filter,
  );

  await syncManagerA.add(
    "incoming-from-B",
    "collection1",
    { type: "gql", parameters: gqlParamsToB },
    filter,
    {},
    remoteBtoA.id,
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

    expect(docA.document).toEqual(docB.document);
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

    expect(docA.document).toEqual(docB.document);
  });

  it("should sync multiple documents with concurrent operations from both reactors", async () => {
    const docA = driveDocumentModelModule.utils.createDocument();
    const docB = driveDocumentModelModule.utils.createDocument();
    const docC = driveDocumentModelModule.utils.createDocument();
    const docD = driveDocumentModelModule.utils.createDocument();

    const waitForCreatesA = waitForMultipleOperationsReady(eventBusA, 2, 15000);
    const waitForCreatesB = waitForMultipleOperationsReady(eventBusB, 2, 15000);

    void reactorA.create(docA);
    void reactorB.create(docC);
    void reactorA.create(docB);
    void reactorB.create(docD);

    await waitForCreatesA;
    await waitForCreatesB;

    const waitForMutatesA = waitForMultipleOperationsReady(eventBusA, 2, 15000);
    const waitForMutatesB = waitForMultipleOperationsReady(eventBusB, 2, 15000);

    void reactorA.execute(docA.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive A1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-a1",
        name: "Folder A1",
        parentFolder: null,
      }),
    ]);

    void reactorB.execute(docC.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive C1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-c1",
        name: "Folder C1",
        parentFolder: null,
      }),
    ]);

    void reactorA.execute(docB.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-b1",
        name: "Folder B1",
        parentFolder: null,
      }),
    ]);

    void reactorB.execute(docD.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive D1" }),
      driveDocumentModelModule.actions.updateNode({
        id: docD.header.id,
        name: "Updated D1",
      }),
    ]);

    await waitForMutatesA;
    await waitForMutatesB;

    const documents = [
      { id: docA.header.id, name: "docA" },
      { id: docB.header.id, name: "docB" },
      { id: docC.header.id, name: "docC" },
      { id: docD.header.id, name: "docD" },
    ];

    for (const doc of documents) {
      const resultA = await reactorA.getOperations(doc.id, {
        branch: "main",
      });
      const opsA = Object.values(resultA).flatMap((scope) => scope.results);

      const resultB = await reactorB.getOperations(doc.id, {
        branch: "main",
      });
      const opsB = Object.values(resultB).flatMap((scope) => scope.results);

      expect(opsA.length).toBeGreaterThan(0);
      expect(opsB.length).toBe(opsA.length);

      for (let i = 0; i < opsA.length; i++) {
        expect(opsB[i]).toEqual(opsA[i]);
      }

      const docFromA = await reactorA.get(doc.id, { branch: "main" });
      const docFromB = await reactorB.get(doc.id, { branch: "main" });

      expect(docFromA.document).toEqual(docFromB.document);
    }
  }, 30000);

  it("should handle concurrent modifications to the same document from both reactors", async () => {
    const doc = driveDocumentModelModule.utils.createDocument();

    const readyPromise = waitForOperationsReady(eventBusB, doc.header.id);
    const createJob = await reactorA.create(doc);
    await waitForJobCompletion(reactorA, createJob.id);

    await readyPromise;

    const docOnB = await reactorB.get(doc.header.id, { branch: "main" });
    expect(docOnB.document).toBeDefined();

    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name from A" }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name from B" }),
    ]);

    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFolder({
        id: "folder-a",
        name: "Folder from A",
        parentFolder: null,
      }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFolder({
        id: "folder-b",
        name: "Folder from B",
        parentFolder: null,
      }),
    ]);

    const startTime = Date.now();
    const timeout = 15000;
    let synced = false;

    while (Date.now() - startTime < timeout) {
      const resultA = await reactorA.getOperations(doc.header.id, {
        branch: "main",
      });
      const opsA = Object.values(resultA).flatMap((scope) => scope.results);

      const resultB = await reactorB.getOperations(doc.header.id, {
        branch: "main",
      });
      const opsB = Object.values(resultB).flatMap((scope) => scope.results);

      if (opsA.length > 1 && opsB.length > 1 && opsA.length === opsB.length) {
        synced = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(synced).toBe(true);

    const resultA = await reactorA.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    const resultB = await reactorB.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    expect(opsA.length).toBeGreaterThan(0);
    expect(opsB.length).toBe(opsA.length);

    for (let i = 0; i < opsA.length; i++) {
      expect(opsB[i]).toEqual(opsA[i]);
    }

    const docFromA = await reactorA.get(doc.header.id, { branch: "main" });
    const docFromB = await reactorB.get(doc.header.id, { branch: "main" });

    expect(docFromA.document).toEqual(docFromB.document);
  }, 20000);
});
