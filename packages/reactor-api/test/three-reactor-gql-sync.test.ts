import {
  CompositeChannelFactory,
  JobStatus,
  OperationEventTypes,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type IEventBus,
  type IReactor,
  type IReactorClient,
  type ISyncManager,
  type OperationsReadyEvent,
  type OperationWithContext,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

type ThreeReactorSetup = {
  switchboard: IReactorClient;
  client1: IReactorClient;
  client2: IReactorClient;
  reactorSwitchboard: IReactor;
  reactorClient1: IReactor;
  reactorClient2: IReactor;
  eventBusSwitchboard: IEventBus;
  eventBusClient1: IEventBus;
  eventBusClient2: IEventBus;
  syncManagerSwitchboard: ISyncManager;
  syncManagerClient1: ISyncManager;
  syncManagerClient2: ISyncManager;
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

async function waitForDocumentExists(
  reactor: IReactor,
  documentId: string,
  timeoutMs = 10000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      await reactor.get(documentId);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    `Document ${documentId} did not appear within ${timeoutMs}ms`,
  );
}

async function pollUntilSynced(
  reactorA: IReactor,
  reactorB: IReactor,
  reactorC: IReactor,
  documentId: string,
  timeoutMs = 15000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const resultA = await reactorA.getOperations(documentId, {
        branch: "main",
      });
      const opsA = Object.values(resultA).flatMap((scope) => scope.results);

      const resultB = await reactorB.getOperations(documentId, {
        branch: "main",
      });
      const opsB = Object.values(resultB).flatMap((scope) => scope.results);

      const resultC = await reactorC.getOperations(documentId, {
        branch: "main",
      });
      const opsC = Object.values(resultC).flatMap((scope) => scope.results);

      if (
        opsA.length > 0 &&
        opsA.length === opsB.length &&
        opsB.length === opsC.length
      ) {
        return;
      }
    } catch {
      // Document may not exist yet on some reactors
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Reactors did not sync document ${documentId} within ${timeoutMs}ms`,
  );
}

async function setupThreeReactorsWithGqlChannel(): Promise<ThreeReactorSetup> {
  const syncManagerRegistry = new Map<string, ISyncManager>();
  const resolverBridge = createResolverBridge(syncManagerRegistry);

  const channelFactorySwitchboard = new CompositeChannelFactory();
  const channelFactoryClient1 = new CompositeChannelFactory();
  const channelFactoryClient2 = new CompositeChannelFactory();

  const models = [
    driveDocumentModelModule,
    documentModelDocumentModelModule,
  ] as DocumentModelModule<any>[];

  const switchboardModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(models)
        .withSync(
          new SyncBuilder().withChannelFactory(channelFactorySwitchboard),
        ),
    )
    .buildModule();

  const client1Module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(models)
        .withSync(new SyncBuilder().withChannelFactory(channelFactoryClient1)),
    )
    .buildModule();

  const client2Module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(models)
        .withSync(new SyncBuilder().withChannelFactory(channelFactoryClient2)),
    )
    .buildModule();

  const reactorSwitchboard = switchboardModule.reactor;
  const reactorClient1 = client1Module.reactor;
  const reactorClient2 = client2Module.reactor;

  const eventBusSwitchboard = switchboardModule.eventBus;
  const eventBusClient1 = client1Module.eventBus;
  const eventBusClient2 = client2Module.eventBus;

  const syncManagerSwitchboard =
    switchboardModule.reactorModule!.syncModule!.syncManager;
  const syncManagerClient1 =
    client1Module.reactorModule!.syncModule!.syncManager;
  const syncManagerClient2 =
    client2Module.reactorModule!.syncModule!.syncManager;

  syncManagerRegistry.set("switchboard", syncManagerSwitchboard);
  syncManagerRegistry.set("client1", syncManagerClient1);
  syncManagerRegistry.set("client2", syncManagerClient2);

  const filter = {
    documentId: [],
    scope: [],
    branch: "main",
  };

  const gqlParamsToSwitchboard = {
    url: "http://switchboard/graphql",
    pollIntervalMs: 100,
    maxFailures: 10,
    retryBaseDelayMs: 50,
    fetchFn: resolverBridge,
  };

  await syncManagerClient1.add(
    "remoteSwitchboard",
    "collection1",
    { type: "gql", parameters: gqlParamsToSwitchboard },
    filter,
  );

  await syncManagerClient2.add(
    "remoteSwitchboard",
    "collection1",
    { type: "gql", parameters: gqlParamsToSwitchboard },
    filter,
  );

  return {
    switchboard: switchboardModule.client,
    client1: client1Module.client,
    client2: client2Module.client,
    reactorSwitchboard,
    reactorClient1,
    reactorClient2,
    eventBusSwitchboard,
    eventBusClient1,
    eventBusClient2,
    syncManagerSwitchboard,
    syncManagerClient1,
    syncManagerClient2,
  };
}

describe("Three-Reactor Sync (Switchboard Pattern)", () => {
  let setup: ThreeReactorSetup;

  beforeEach(async () => {
    setup = await setupThreeReactorsWithGqlChannel();
  });

  afterEach(() => {
    setup.reactorSwitchboard.kill();
    setup.reactorClient1.kill();
    setup.reactorClient2.kill();
  });

  describe("Operation Ordering", () => {
    it("should deliver CREATE_DOCUMENT before ADD_RELATIONSHIP for new documents", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      const newDoc = driveDocumentModelModule.utils.createDocument();

      const doc = await setup.client1.createDocumentInDrive(
        drive.header.id,
        newDoc,
      );

      await waitForDocumentExists(setup.reactorClient2, doc.header.id, 10000);

      const docOnClient2 = await setup.client2.get(doc.header.id);
      expect(docOnClient2.document).toBeDefined();
      expect(docOnClient2.document.header.id).toBe(doc.header.id);
    });

    it("should handle sequential document creation with immediate relationships", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      // Create documents sequentially (parallel creation in same drive causes revision conflicts)
      const docs = [];
      for (let i = 0; i < 3; i++) {
        const doc = await setup.client1.createDocumentInDrive(
          drive.header.id,
          driveDocumentModelModule.utils.createDocument(),
        );
        docs.push(doc);
      }

      for (const doc of docs) {
        await waitForDocumentExists(setup.reactorClient2, doc.header.id, 15000);
        const docOnClient2 = await setup.client2.get(doc.header.id);
        expect(docOnClient2.document).toBeDefined();
      }
    }, 30000);
  });

  describe("Sequential Operations (Back-and-Forth)", () => {
    it("should sync sequential edits: C1 -> SW -> C2 -> SW -> C1", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      await setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Edit from C1" }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await setup.client2.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Edit from C2" }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({
          name: "Final edit from C1",
        }),
      ]);

      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        20000,
      );

      const resultS = await setup.reactorSwitchboard.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsS = Object.values(resultS).flatMap((scope) => scope.results);

      const resultC1 = await setup.reactorClient1.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsC1 = Object.values(resultC1).flatMap((scope) => scope.results);

      const resultC2 = await setup.reactorClient2.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsC2 = Object.values(resultC2).flatMap((scope) => scope.results);

      expect(opsS.length).toBe(opsC1.length);
      expect(opsC1.length).toBe(opsC2.length);
      expect(opsS.length).toBeGreaterThanOrEqual(4);
    }, 30000);

    it("should not create duplicate operations", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      await setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-1",
          name: "Folder 1",
          parentFolder: null,
        }),
      ]);

      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        10000,
      );

      const resultC2 = await setup.reactorClient2.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsC2 = Object.values(resultC2).flatMap((scope) => scope.results);

      const addFolderOps = opsC2.filter(
        (op) => op.action?.type === "ADD_FOLDER",
      );
      expect(addFolderOps.length).toBe(1);
    }, 15000);
  });

  describe("Near-Concurrent Operations", () => {
    it("should handle edits made before full propagation", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      void setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-c1",
          name: "Folder from C1",
          parentFolder: null,
        }),
      ]);

      void setup.client2.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-c2",
          name: "Folder from C2",
          parentFolder: null,
        }),
      ]);

      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        20000,
      );

      const docS = await setup.switchboard.get(drive.header.id);
      const docC1 = await setup.client1.get(drive.header.id);
      const docC2 = await setup.client2.get(drive.header.id);

      // Compare state (semantic equality) rather than full document
      expect(docC1.document.state).toEqual(docS.document.state);
      expect(docC2.document.state).toEqual(docS.document.state);
    }, 25000);

    it("should converge to same state on all reactors", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      void setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from C1" }),
      ]);
      void setup.client2.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from C2" }),
      ]);

      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        20000,
      );

      const docS = await setup.switchboard.get(drive.header.id);
      const docC1 = await setup.client1.get(drive.header.id);
      const docC2 = await setup.client2.get(drive.header.id);

      // Compare state (semantic equality) rather than full document
      expect(docC1.document.state).toEqual(docS.document.state);
      expect(docC2.document.state).toEqual(docS.document.state);
    }, 25000);

    it("should handle concurrent edits at same index without opId conflicts", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      // CONFLICT: Both clients edit at same index concurrently (before sync)
      // This triggers the scenario where duplicate load jobs may be created
      // for the same incoming operation, causing "opId already exists" errors
      void setup.client1.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Edit from C1" }),
      ]);

      void setup.client2.execute(drive.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Edit from C2" }),
      ]);

      // Wait for sync to complete - should NOT throw opId errors
      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        20000,
      );

      // Verify all reactors converged to same state
      const docS = await setup.switchboard.get(drive.header.id);
      const docC1 = await setup.client1.get(drive.header.id);
      const docC2 = await setup.client2.get(drive.header.id);

      expect(docC1.document.state).toEqual(docS.document.state);
      expect(docC2.document.state).toEqual(docS.document.state);
    }, 25000);
  });

  describe("Stress Tests", () => {
    it("should handle rapid back-and-forth editing", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();

      const readyOnClient1 = waitForOperationsReady(
        setup.eventBusClient1,
        drive.header.id,
      );
      const readyOnClient2 = waitForOperationsReady(
        setup.eventBusClient2,
        drive.header.id,
      );

      const driveJob = await setup.reactorSwitchboard.create(drive);
      await waitForJobCompletion(setup.reactorSwitchboard, driveJob.id);
      await Promise.all([readyOnClient1, readyOnClient2]);

      // Use longer delays to allow sync to complete between operations
      for (let i = 0; i < 5; i++) {
        await setup.client1.execute(drive.header.id, "main", [
          driveDocumentModelModule.actions.addFolder({
            id: `folder-c1-${i}`,
            name: `Folder C1 ${i}`,
            parentFolder: null,
          }),
        ]);
        // Wait for sync to complete before next operation
        await new Promise((resolve) => setTimeout(resolve, 300));

        await setup.client2.execute(drive.header.id, "main", [
          driveDocumentModelModule.actions.addFolder({
            id: `folder-c2-${i}`,
            name: `Folder C2 ${i}`,
            parentFolder: null,
          }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      await pollUntilSynced(
        setup.reactorSwitchboard,
        setup.reactorClient1,
        setup.reactorClient2,
        drive.header.id,
        30000,
      );

      const resultS = await setup.reactorSwitchboard.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsS = Object.values(resultS).flatMap((scope) => scope.results);

      const resultC1 = await setup.reactorClient1.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsC1 = Object.values(resultC1).flatMap((scope) => scope.results);

      const resultC2 = await setup.reactorClient2.getOperations(
        drive.header.id,
        { branch: "main" },
      );
      const opsC2 = Object.values(resultC2).flatMap((scope) => scope.results);

      expect(opsS.length).toBe(opsC1.length);
      expect(opsC1.length).toBe(opsC2.length);
      expect(opsS.length).toBeGreaterThanOrEqual(11);

      const docS = await setup.switchboard.get(drive.header.id);
      const docC1 = await setup.client1.get(drive.header.id);
      const docC2 = await setup.client2.get(drive.header.id);

      // Compare state (semantic equality) rather than full document
      // Operation history may have format differences (e.g., signature serialization)
      expect(docC1.document.state).toEqual(docS.document.state);
      expect(docC2.document.state).toEqual(docS.document.state);
    }, 60000);
  });
});
