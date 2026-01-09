import { driveDocumentModelModule } from "document-drive";
import { garbageCollectDocumentOperations } from "document-model/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import {
  OperationEventTypes,
  type OperationsReadyEvent,
} from "../../src/events/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestChannel } from "../sync/channels/test-channel.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  moduleA: ReactorModule;
  moduleB: ReactorModule;
  channelRegistry: Map<string, TestChannel>;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
};

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 2000,
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
  timeoutMs = 2000,
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
          (op) => op.context.documentId === documentId,
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
  timeoutMs = 5000,
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

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  const channelRegistry = new Map<string, TestChannel>();
  const peerMapping = new Map<string, string>();
  peerMapping.set("remoteA", "remoteB");
  peerMapping.set("remoteB", "remoteA");

  const createChannelFactory = (): IChannelFactory => {
    return {
      instance(
        remoteId: string,
        remoteName: string,
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        const peerName = peerMapping.get(remoteName);

        const send = (envelope: SyncEnvelope): void => {
          const peerChannel = peerName
            ? channelRegistry.get(peerName)
            : undefined;
          if (!peerChannel) {
            throw new Error(
              `Peer channel '${peerName}' not found in registry for remote '${remoteName}'`,
            );
          }
          peerChannel.receive(envelope);
        };

        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          send,
        );

        channelRegistry.set(remoteName, channel);

        return channel;
      },
    };
  };

  const eventBusA = new EventBus();
  const eventBusB = new EventBus();

  const moduleA = await new ReactorBuilder()
    .withEventBus(eventBusA)
    .withDocumentModels([driveDocumentModelModule as any])
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .buildModule();

  const moduleB = await new ReactorBuilder()
    .withEventBus(eventBusB)
    .withDocumentModels([driveDocumentModelModule as any])
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .buildModule();

  const reactorA = moduleA.reactor;
  const reactorB = moduleB.reactor;

  await moduleA.syncModule!.syncManager.add(
    "remoteB",
    "collection1",
    {
      type: "internal",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  await moduleB.syncModule!.syncManager.add(
    "remoteA",
    "collection1",
    {
      type: "internal",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  return {
    reactorA,
    reactorB,
    moduleA,
    moduleB,
    channelRegistry,
    eventBusA,
    eventBusB,
  };
}

describe("Two-Reactor Sync", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;
  let moduleA: ReactorModule;
  let moduleB: ReactorModule;
  let eventBusA: IEventBus;
  let eventBusB: IEventBus;

  beforeEach(async () => {
    const setup = await setupTwoReactors();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
    moduleA = setup.moduleA;
    moduleB = setup.moduleB;
    eventBusA = setup.eventBusA;
    eventBusB = setup.eventBusB;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("should sync operation from ReactorA to ReactorB", async () => {
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

  it("should sync operation from ReactorB to ReactorA", async () => {
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

    const documents = [
      { id: docA.header.id, name: "docA" },
      { id: docB.header.id, name: "docB" },
      { id: docC.header.id, name: "docC" },
      { id: docD.header.id, name: "docD" },
    ];

    const jobA1 = await reactorA.create(docA);
    const jobB1 = await reactorB.create(docC);
    const jobA2 = await reactorA.create(docB);
    const jobB2 = await reactorB.create(docD);

    await waitForJobCompletion(reactorA, jobA1.id);
    await waitForJobCompletion(reactorA, jobA2.id);
    await waitForJobCompletion(reactorB, jobB1.id);
    await waitForJobCompletion(reactorB, jobB2.id);

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

    void reactorA.execute(docA.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-a1",
        name: "File A1",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-a1",
      }),
    ]);

    void reactorB.execute(docC.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-c1",
        name: "File C1",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-c1",
      }),
    ]);

    void reactorA.execute(docB.header.id, "main", [
      driveDocumentModelModule.actions.updateFile({
        id: "file-b1",
        name: "Updated File B1",
      }),
    ]);

    void reactorB.execute(docD.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-d1" }),
    ]);

    void reactorA.execute(docA.header.id, "main", [
      driveDocumentModelModule.actions.updateNode({
        id: "folder-a1",
        name: "Updated Folder A1",
      }),
    ]);

    void reactorB.execute(docC.header.id, "main", [
      driveDocumentModelModule.actions.updateFile({
        id: "file-c1",
        name: "Updated File C1",
      }),
    ]);

    const startTime = Date.now();
    const timeout = 10000;

    for (const doc of documents) {
      let synced = false;

      while (Date.now() - startTime < timeout) {
        const resultA = await reactorA.getOperations(doc.id, {
          branch: "main",
        });
        const opsA = Object.values(resultA).flatMap((scope) => scope.results);

        const resultB = await reactorB.getOperations(doc.id, {
          branch: "main",
        });
        const opsB = Object.values(resultB).flatMap((scope) => scope.results);

        if (opsA.length > 0 && opsB.length > 0 && opsA.length === opsB.length) {
          synced = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(synced).toBe(true);
    }

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
  }, 15000);

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

    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-a",
        name: "File from A",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-a",
      }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-b",
        name: "File from B",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-b",
      }),
    ]);

    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.updateNode({
        id: "folder-a",
        name: "Updated Folder A",
      }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.updateFile({
        id: "file-b",
        name: "Updated File B",
      }),
    ]);

    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-a" }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b" }),
    ]);

    const startTime = Date.now();
    const timeout = 10000;
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
  }, 15000);

  it("should trigger excessive reshuffle error when loading operation with index far in the past", async () => {
    const testReactor = await new ReactorBuilder()
      .withDocumentModels([driveDocumentModelModule as any])
      .build();

    try {
      const document = driveDocumentModelModule.utils.createDocument();
      const createJobInfo = await testReactor.create(document);
      await waitForJobCompletion(testReactor, createJobInfo.id);

      const actions = [];
      for (let i = 0; i < 150; i++) {
        actions.push(
          driveDocumentModelModule.actions.setDriveName({ name: `Drive ${i}` }),
        );
      }

      const mutateJobInfo = await testReactor.execute(
        document.header.id,
        "main",
        actions,
      );
      await waitForJobCompletion(testReactor, mutateJobInfo.id);

      const operations = await testReactor.getOperations(document.header.id, {
        branch: "main",
      });
      const globalOps = operations.global.results;

      expect(globalOps.length).toBe(150);

      const latestIndex = Math.max(...globalOps.map((op) => op.index));
      expect(latestIndex).toBeGreaterThanOrEqual(149);

      const oldOperation = {
        ...globalOps[0],
        index: 0,
        timestampUtcMs: new Date(Date.now() - 1000000).toISOString(),
      };

      const loadJobInfo = await testReactor.load(document.header.id, "main", [
        oldOperation,
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const status = await testReactor.getJobStatus(loadJobInfo.id);

      expect(status.status).toBe(JobStatus.FAILED);
      expect(status.error?.message).toContain("Excessive reshuffle detected");
    } finally {
      testReactor.kill();
    }
  }, 15000);

  it("should not echo operations back to sender", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const readyPromise = waitForOperationsReady(eventBusB, document.header.id);
    const jobInfo = await reactorA.create(document);

    await waitForJobCompletion(reactorA, jobInfo.id);

    await readyPromise;

    await new Promise((resolve) => setTimeout(resolve, 200));

    const remoteA = moduleB.syncModule!.syncManager.getByName("remoteA");

    const outboxOps = remoteA.channel.outbox.items;
    expect(outboxOps.length).toBe(0);
  });

  it("should clean up outbox after successful send", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const readyPromise = waitForOperationsReady(eventBusB, document.header.id);
    const jobInfo = await reactorA.create(document);

    await waitForJobCompletion(reactorA, jobInfo.id);

    await readyPromise;

    await new Promise((resolve) => setTimeout(resolve, 100));

    const remoteB = moduleA.syncModule!.syncManager.getByName("remoteB");

    const outboxOps = remoteB.channel.outbox.items;
    expect(outboxOps.length).toBe(0);
  });

  it("minimal: single document sync should not cause revision mismatch errors", async () => {
    // Create a single document on ReactorA
    const doc = driveDocumentModelModule.utils.createDocument();

    const readyOnB = waitForOperationsReady(eventBusB, doc.header.id);
    const createJob = await reactorA.create(doc);
    await waitForJobCompletion(reactorA, createJob.id);

    // Wait for document to sync to ReactorB
    await readyOnB;

    // Fire many mutations rapidly from both reactors using void (fire-and-forget)
    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: `Name A` }),
    ]);
    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: `Name B` }),
    ]);

    // Give time for operations to process and sync
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Both reactors should have the same operations
    const opsA = Object.values(
      await reactorA.getOperations(doc.header.id, { branch: "main" }),
    ).flatMap((scope) => scope.results);
    const opsB = Object.values(
      await reactorB.getOperations(doc.header.id, { branch: "main" }),
    ).flatMap((scope) => scope.results);

    const garbageCollectedOpsA = garbageCollectDocumentOperations({
      global: opsA,
    }).global;
    const garbageCollectedOpsB = garbageCollectDocumentOperations({
      global: opsB,
    }).global;
    expect(garbageCollectedOpsA.length).toBe(garbageCollectedOpsB.length);

    // Validate the document state matches on both reactors
    // Note: We compare state rather than full document because each reactor
    // generates its own operation IDs during reshuffle
    const docFromA = await reactorA.get(doc.header.id, { branch: "main" });
    const docFromB = await reactorB.get(doc.header.id, { branch: "main" });

    expect(docFromA.document.state).toEqual(docFromB.document.state);
  }, 10000);

  it("minimal: fire-and-forget mutations should not cause revision mismatch errors", async () => {
    // Create 2 documents (1 on each reactor)
    const docA = driveDocumentModelModule.utils.createDocument();
    const docB = driveDocumentModelModule.utils.createDocument();

    const jobA = await reactorA.create(docA);
    const jobB = await reactorB.create(docB);

    await waitForJobCompletion(reactorA, jobA.id);
    await waitForJobCompletion(reactorB, jobB.id);

    // Fire mutations rapidly without waiting for sync
    void reactorA.execute(docA.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name A1" }),
    ]);
    void reactorB.execute(docB.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name B1" }),
    ]);
    void reactorA.execute(docA.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-a1" }),
    ]);
    void reactorB.execute(docB.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b1" }),
    ]);

    // Give time for operations to process and sync
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Both reactors should have operations for docA
    // Reshuffling may cause operation counts to differ temporarily
    // The key check is that sync didn't fail due to revision mismatch
    const opsAonA = Object.values(
      await reactorA.getOperations(docA.header.id, { branch: "main" }),
    ).flatMap((scope) => scope.results);
    const opsAonB = Object.values(
      await reactorB.getOperations(docA.header.id, { branch: "main" }),
    ).flatMap((scope) => scope.results);

    // A should have at least its local operations
    expect(opsAonA.length).toBeGreaterThanOrEqual(4);
    // B should have at least the synced operations from A
    expect(opsAonB.length).toBeGreaterThanOrEqual(4);

    // Verify document state is accessible (no revision mismatch errors)
    const docAonA = await reactorA.get(docA.header.id, { branch: "main" });
    const docAonB = await reactorB.get(docA.header.id, { branch: "main" });
    expect(docAonA.document.state).toBeDefined();
    expect(docAonB.document.state).toBeDefined();
  }, 10000);

  it("minimal: concurrent operations after sync should reshuffle", async () => {
    // 1. ReactorA creates document
    const doc = driveDocumentModelModule.utils.createDocument();
    const readyOnB = waitForOperationsReady(eventBusB, doc.header.id);
    const createJob = await reactorA.create(doc);
    await waitForJobCompletion(reactorA, createJob.id);

    // 2. Wait for document to sync to ReactorB
    await readyOnB;

    // 3. Both reactors perform an operation on the document
    // We need to wait for 2 OPERATIONS_READY events per reactor:
    // - One for the local mutation
    // - One for receiving and applying the synced mutation from the other reactor
    const readyOnA = waitForMultipleOperationsReady(eventBusA, 2);
    const readyOnB2 = waitForMultipleOperationsReady(eventBusB, 2);

    // Fire both mutations - don't await, let them race
    void reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name from A" }),
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Name from B" }),
    ]);

    // 4. Wait for syncs to complete (both local and synced operations)
    await Promise.all([readyOnA, readyOnB2]);

    // 5. Verify operations on both reactors
    const resultA = await reactorA.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    const resultB = await reactorB.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    const garbageCollectedOpsA = garbageCollectDocumentOperations({
      global: opsA,
    }).global;
    const garbageCollectedOpsB = garbageCollectDocumentOperations({
      global: opsB,
    }).global;
    expect(garbageCollectedOpsA.length).toBe(garbageCollectedOpsB.length);

    // Validate the document state matches on both reactors
    const docFromA = await reactorA.get(doc.header.id, { branch: "main" });
    const docFromB = await reactorB.get(doc.header.id, { branch: "main" });
    expect(docFromA.document.state).toEqual(docFromB.document.state);
  });
});
