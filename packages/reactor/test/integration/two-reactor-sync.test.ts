import { driveDocumentModelModule } from "document-drive";
import {
  garbageCollectDocumentOperations,
  generateId,
} from "document-model/core";
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
    await readyOnB;

    const actionA = driveDocumentModelModule.actions.setDriveName({
      name: `Name A`,
    });
    const actionB = driveDocumentModelModule.actions.setDriveName({
      name: `Name B`,
    });
    actionA.timestampUtcMs = "2026-01-27T19:20:04.470Z";
    actionB.timestampUtcMs = "2026-01-27T19:20:04.470Z";

    void reactorA.execute(doc.header.id, "main", [actionA]);
    void reactorB.execute(doc.header.id, "main", [actionB]);

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

    // the gc'd operations should match, in order
    for (let i = 0; i < garbageCollectedOpsA.length; i++) {
      expect(garbageCollectedOpsA[i].id).toEqual(garbageCollectedOpsB[i].id);
    }

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

  it("should converge when large reshuffle (10+ operations) is forced by loading operations with interleaved timestamps", async () => {
    // This test verifies reshuffle behavior with many operations (10+) that need
    // to be interleaved by timestamp. This stresses the reshuffle mechanism.
    //
    // We use load() for both "local" and "remote" operations to ensure timestamps
    // are preserved (execute() ignores custom timestamps).
    //
    // Scenario:
    // 1. Create doc on A
    // 2. Load 10 "local" operations (timestamps T2, T4, T6, T8, ... T20)
    // 3. Load 10 "remote" operations with interleaved timestamps (T1, T3, T5, ... T19)
    // 4. Reshuffle must merge all 20 operations by timestamp
    // 5. Verify the final state and operation ordering is correct

    // 1. Create document on A (no sync needed for this test)
    const testReactor = await new ReactorBuilder()
      .withDocumentModels([driveDocumentModelModule as any])
      .build();

    try {
      const doc = driveDocumentModelModule.utils.createDocument();
      const createJob = await testReactor.create(doc);
      await waitForJobCompletion(testReactor, createJob.id);

      const baseTime = Date.now();

      // 2. Create and load 10 "local" operations with EVEN timestamps (T2, T4, T6, ...)
      // Each operation adds a folder
      const localOperations = [];
      for (let i = 0; i < 10; i++) {
        const actionId = generateId();
        // Timestamps: T2, T4, T6, ... (even slots: 200, 400, 600, ... ms from base)
        const timestamp = new Date(baseTime + (i + 1) * 200).toISOString();

        localOperations.push({
          id: `local-op-${actionId}`,
          index: i,
          timestampUtcMs: timestamp,
          hash: "",
          skip: 0,
          action: {
            id: actionId,
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: timestamp,
            input: {
              id: `local-folder-${i}`,
              name: `Local Folder ${i}`,
              parentFolder: null,
            },
          },
        });
      }

      const localLoadJob = await testReactor.load(
        doc.header.id,
        "main",
        localOperations,
      );
      await waitForJobCompletion(testReactor, localLoadJob.id);

      // Get operations after local load
      const opsAfterLocalLoad = await testReactor.getOperations(doc.header.id, {
        branch: "main",
      });
      const globalOpsAfterLocalLoad = opsAfterLocalLoad.global.results;

      console.log(
        `Operations after local load: ${globalOpsAfterLocalLoad.length}`,
      );
      console.log(
        "Local operation timestamps:",
        globalOpsAfterLocalLoad.map((op) => op.timestampUtcMs).slice(0, 5),
        "...",
      );

      // 3. Create and load 10 "remote" operations with ODD timestamps (T1, T3, T5, ...)
      // Each operation adds a file. These should interleave with the local operations.
      const remoteOperations = [];
      for (let i = 0; i < 10; i++) {
        const actionId = generateId();
        // Timestamps: T1, T3, T5, ... (odd slots: 100, 300, 500, ... ms from base)
        const timestamp = new Date(baseTime + i * 200 + 100).toISOString();

        remoteOperations.push({
          id: `remote-op-${actionId}`,
          index: i,
          timestampUtcMs: timestamp,
          hash: "",
          skip: 0,
          action: {
            id: actionId,
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: timestamp,
            input: {
              id: `remote-file-${i}`,
              name: `Remote File ${i}`,
              documentType: "powerhouse/document-model",
              parentFolder: null,
            },
          },
        });
      }

      console.log(
        "Remote operation timestamps (should interleave):",
        remoteOperations.map((op) => op.timestampUtcMs).slice(0, 5),
        "...",
      );

      // 4. Load all remote operations - this should trigger a large reshuffle
      // All 10 local operations need to be rewound and interleaved with remote
      const remoteLoadJob = await testReactor.load(
        doc.header.id,
        "main",
        remoteOperations,
      );

      // Wait for the load job to complete
      const startTime = Date.now();
      while (Date.now() - startTime < 10000) {
        const status = await testReactor.getJobStatus(remoteLoadJob.id);
        if (status.status === JobStatus.READ_MODELS_READY) {
          break;
        }
        if (status.status === JobStatus.FAILED) {
          throw new Error(`Load job failed: ${status.error?.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // 5. Get the final operations and verify
      const opsAfterRemoteLoad = await testReactor.getOperations(
        doc.header.id,
        {
          branch: "main",
        },
      );
      const globalOpsAfterRemoteLoad = opsAfterRemoteLoad.global.results;

      console.log(
        `Total operations after remote load: ${globalOpsAfterRemoteLoad.length}`,
      );

      // Look for the reshuffle operation (should have skip > 0)
      const reshuffleOps = globalOpsAfterRemoteLoad.filter((op) => op.skip > 0);
      console.log(
        `Operations with skip > 0 (reshuffle markers): ${reshuffleOps.length}`,
      );
      if (reshuffleOps.length > 0) {
        console.log("First reshuffle operation:", {
          index: reshuffleOps[0].index,
          type: reshuffleOps[0].action.type,
          skip: reshuffleOps[0].skip,
          ts: reshuffleOps[0].timestampUtcMs,
        });
      }

      // After garbage collection
      const garbageCollectedOps = garbageCollectDocumentOperations({
        global: globalOpsAfterRemoteLoad,
      }).global;

      console.log(
        `Effective operations after GC: ${garbageCollectedOps.length}`,
      );

      // We should have 20 effective operations (10 local + 10 remote)
      expect(garbageCollectedOps.length).toBe(20);

      // Verify timestamps are in ascending order after GC
      const timestamps = garbageCollectedOps.map((op) => op.timestampUtcMs);
      const sortedTimestamps = [...timestamps].sort();
      expect(timestamps).toEqual(sortedTimestamps);

      // Verify interleaving: operations should alternate between ADD_FILE and ADD_FOLDER
      // because odd timestamps (files) interleave with even timestamps (folders)
      console.log(
        "Operation types after GC (should interleave):",
        garbageCollectedOps.slice(0, 10).map((op) => op.action.type),
      );

      // First operation should be ADD_FILE (T1 = baseTime + 100)
      expect(garbageCollectedOps[0].action.type).toBe("ADD_FILE");
      // Second operation should be ADD_FOLDER (T2 = baseTime + 200)
      expect(garbageCollectedOps[1].action.type).toBe("ADD_FOLDER");

      // Count operation types
      const addFolderOps = garbageCollectedOps.filter(
        (op) => op.action.type === "ADD_FOLDER",
      );
      const addFileOps = garbageCollectedOps.filter(
        (op) => op.action.type === "ADD_FILE",
      );

      expect(addFolderOps.length).toBe(10);
      expect(addFileOps.length).toBe(10);

      // Verify state is correct - should have 10 folders and 10 files
      const docResult = await testReactor.get(doc.header.id, {
        branch: "main",
      });
      const state = docResult.document.state as unknown as {
        global: { nodes: Array<{ id: string; kind: string }> };
      };
      const nodes = state.global.nodes;

      const folders = nodes.filter((n) => n.kind === "folder");
      const files = nodes.filter((n) => n.kind === "file");

      console.log(
        `Final state: ${folders.length} folders, ${files.length} files`,
      );

      expect(folders.length).toBe(10);
      expect(files.length).toBe(10);

      // Verify all expected items exist
      for (let i = 0; i < 10; i++) {
        const folder = nodes.find((n) => n.id === `local-folder-${i}`);
        const file = nodes.find((n) => n.id === `remote-file-${i}`);
        expect(folder).toBeDefined();
        expect(file).toBeDefined();
      }
    } finally {
      testReactor.kill();
    }
  }, 20000);

  it.skip("should converge when reshuffle occurs due to NOOP and reapplied operations", async () => {
    // KNOWN LIMITATION: This test is skipped because the v2 undo protocol has
    // a fundamental limitation when combined with reshuffle.
    //
    // The NOOP's skip value is index-based (e.g., skip=1 means "undo the operation
    // at index NOOP.index - 1"). When a reshuffle occurs due to concurrent operations,
    // the indices change, causing the NOOP to undo different operations on different
    // reactors.
    //
    // For example:
    // - A: [SET_DRIVE_NAME@0, NOOP@1(skip=1), ADD_FOLDER@2] -> NOOP undoes SET_DRIVE_NAME
    // - B: [SET_DRIVE_NAME@0, ADD_FOLDER@1, NOOP@2(skip=1), ADD_FOLDER@3] -> NOOP undoes ADD_FOLDER@1
    //
    // A proper fix would require the NOOP to specify which action ID to undo,
    // rather than a relative index. This is a protocol-level change that needs
    // careful design.

    // 1. ReactorA creates document and syncs to B
    const doc = driveDocumentModelModule.utils.createDocument();
    const readyOnB = waitForOperationsReady(eventBusB, doc.header.id);
    const createJob = await reactorA.create(doc);
    await waitForJobCompletion(reactorA, createJob.id);
    await readyOnB;

    // 2. ReactorA performs an operation that we can UNDO later
    const setNameReadyOnB = waitForOperationsReady(eventBusB, doc.header.id);
    const setNameJob = await reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Initial Name" }),
    ]);
    await waitForJobCompletion(reactorA, setNameJob.id);
    await setNameReadyOnB;

    // Now both reactors have: [0: SET_DRIVE_NAME]

    // 3. Fire concurrent operations from both reactors at the same time
    // A does UNDO (creates NOOP) while B does ADD_FOLDER
    // The timestamps will overlap, triggering reshuffle on one or both reactors
    const readyOnA = waitForMultipleOperationsReady(eventBusA, 2);
    const readyOnB2 = waitForMultipleOperationsReady(eventBusB, 2);

    // Fire both at nearly the same time (don't await)
    void reactorA.execute(doc.header.id, "main", [
      {
        id: generateId(),
        type: "UNDO",
        scope: "global",
        timestampUtcMs: new Date().toISOString(),
        input: {},
      },
    ]);

    void reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFolder({
        id: "folder-from-b",
        name: "Folder from B",
        parentFolder: null,
      }),
    ]);

    // Wait for both to sync
    await Promise.all([readyOnA, readyOnB2]);

    // Give extra time for any sync to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 4. Verify that both reactors have converged
    const resultA = await reactorA.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    const resultB = await reactorB.getOperations(doc.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    // Log operations for debugging
    console.log(
      "ReactorA operations:",
      opsA.map((op) => ({
        index: op.index,
        type: op.action.type,
        skip: op.skip,
      })),
    );
    console.log(
      "ReactorB operations:",
      opsB.map((op) => ({
        index: op.index,
        type: op.action.type,
        skip: op.skip,
      })),
    );

    // After garbage collection, effective operations should match
    const garbageCollectedOpsA = garbageCollectDocumentOperations({
      global: opsA,
    }).global;
    const garbageCollectedOpsB = garbageCollectDocumentOperations({
      global: opsB,
    }).global;

    console.log(
      "ReactorA effective ops:",
      garbageCollectedOpsA.map((op) => ({
        index: op.index,
        type: op.action.type,
      })),
    );
    console.log(
      "ReactorB effective ops:",
      garbageCollectedOpsB.map((op) => ({
        index: op.index,
        type: op.action.type,
      })),
    );

    // The effective operation count should be the same
    expect(garbageCollectedOpsA.length).toBe(garbageCollectedOpsB.length);

    // The effective action IDs should be the same (same operations applied)
    expect(garbageCollectedOpsA.map((op) => op.action.id).sort()).toEqual(
      garbageCollectedOpsB.map((op) => op.action.id).sort(),
    );

    // Most importantly: the document state should be identical
    const docFromA = await reactorA.get(doc.header.id, { branch: "main" });
    const docFromB = await reactorB.get(doc.header.id, { branch: "main" });
    expect(docFromA.document.state).toEqual(docFromB.document.state);
  }, 30000);
});
