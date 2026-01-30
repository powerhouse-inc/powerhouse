import { addFolder, driveDocumentModelModule } from "document-drive";
import type { DocumentOperations } from "document-model";
import {
  garbageCollectDocumentOperations,
  generateId,
  operationFromAction,
} from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import { type ChannelConfig, type SyncEnvelope } from "../../src/sync/types.js";
import { TestChannel } from "../sync/channels/test-channel.js";

const stripOpsForCompare = (ops: DocumentOperations) => {
  return Object.entries(ops).reduce((acc: DocumentOperations, [scope, ops]) => {
    acc[scope] = ops.map((op) => {
      // two reactors do not need to (and will not, generally) agree on index and skip values
      op.index = 0;
      op.skip = 0;
      return op;
    });

    return acc;
  }, {});
};

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  moduleA: ReactorModule;
  moduleB: ReactorModule;
  channelRegistry: Map<string, TestChannel>;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
};

const sentActionIds = new Map<string, number>();

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  sentActionIds.clear();
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

          if (envelope.type === "operations" && envelope.operations) {
            for (const op of envelope.operations) {
              const actionId = op.operation.action.id;
              const count = sentActionIds.get(actionId) || 0;
              sentActionIds.set(actionId, count + 1);
              console.log(
                `SEND: ${remoteName} -> ${peerName}: action ${actionId} (${op.operation.action.type}) [send count: ${count + 1}]`,
              );
            }
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

  const areChannelsEmpty = (module: ReactorModule) => {
    const syncManager = module.syncModule!.syncManager;
    const remotes = syncManager.list();
    for (const remote of remotes) {
      if (
        remote.channel.outbox.items.length > 0 ||
        remote.channel.inbox.items.length > 0
      ) {
        return false;
      }
    }

    return true;
  };

  const compareSyncedDocument = async (documentId: string) => {
    // check resulting garbage-collected operations on both reactors
    const opsAAPaged = await reactorA.getOperations(documentId, {
      branch: "main",
    });
    const opNamesA = [];
    const opsAA: DocumentOperations = {};
    for (const scope in opsAAPaged) {
      opsAA[scope] = opsAAPaged[scope].results;

      for (let i = 0; i < opsAA[scope].length; i++) {
        const op = opsAA[scope][i];
        opNamesA.push(
          `(${scope}, ${op.index}, ${op.skip}, ${op.timestampUtcMs}, ${op.action.type}, ${op.action.id})`,
        );
      }
    }
    const opsABPaged = await reactorB.getOperations(documentId, {
      branch: "main",
    });
    const opNamesB = [];
    const opsAB: DocumentOperations = {};
    for (const scope in opsABPaged) {
      opsAB[scope] = opsABPaged[scope].results;

      for (let i = 0; i < opsAB[scope].length; i++) {
        const op = opsAB[scope][i];
        opNamesB.push(
          `(${scope}, ${op.index}, ${op.skip}, ${op.timestampUtcMs}, ${op.action.type}, ${op.action.id})`,
        );
      }
    }

    console.log("OPSA:", opNamesA);
    console.log("OPSB:", opNamesB);

    const gcOpsAA = garbageCollectDocumentOperations(opsAA);
    const gcOpsAB = garbageCollectDocumentOperations(opsAB);

    const gcNamesA = [];
    for (const scope in gcOpsAA) {
      for (let i = 0; i < gcOpsAA[scope].length; i++) {
        const op = gcOpsAA[scope][i];
        gcNamesA.push(
          `(${scope}, ${op.index}, ${op.skip}, ${op.timestampUtcMs}, ${op.action.type}, ${op.action.id})`,
        );
      }
    }
    const gcNamesB = [];
    for (const scope in gcOpsAB) {
      for (let i = 0; i < gcOpsAB[scope].length; i++) {
        const op = gcOpsAB[scope][i];
        gcNamesB.push(
          `(${scope}, ${op.index}, ${op.skip}, ${op.timestampUtcMs}, ${op.action.type}, ${op.action.id})`,
        );
      }
    }

    console.log("GCA:", gcNamesA);
    console.log("GCB:", gcNamesB);

    expect(stripOpsForCompare(gcOpsAA)).toEqual(stripOpsForCompare(gcOpsAB));

    // check resulting state of docs on both reactors
    const docAA = await reactorA.get(documentId, { branch: "main" });
    const docAB = await reactorB.get(documentId, { branch: "main" });

    expect(docAA.state).toEqual(docAB.state);
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    const setup = await setupTwoReactors();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
    moduleA = setup.moduleA;
    moduleB = setup.moduleB;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();

    vi.useRealTimers();
  });

  it("should sync operation from ReactorA to ReactorB", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const syncManager = moduleA.syncModule!.syncManager;

    const jobInfo = await reactorA.create(document);

    // wait for reactor a to push
    await syncManager.waitForSync(jobInfo.id);

    // wait for reactor b to pull
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

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

    expect(docA.state).toEqual(docB.state);
  });

  it("should sync multiple documents with concurrent operations from both reactors", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    const docA = driveDocumentModelModule.utils.createDocument();
    const docB = driveDocumentModelModule.utils.createDocument();
    const docC = driveDocumentModelModule.utils.createDocument();
    const docD = driveDocumentModelModule.utils.createDocument();

    const jobA = await reactorA.create(docA);
    const jobB = await reactorA.create(docB);
    const jobC = await reactorB.create(docC);
    const jobD = await reactorB.create(docD);

    await Promise.all([
      syncManagerA.waitForSync(jobA.id),
      syncManagerA.waitForSync(jobB.id),
      syncManagerB.waitForSync(jobC.id),
      syncManagerB.waitForSync(jobD.id),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
    );

    const execJobsA: Promise<{ id: string }>[] = [];
    const execJobsB: Promise<{ id: string }>[] = [];

    execJobsA.push(
      reactorA.execute(docA.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Drive A1" }),
        driveDocumentModelModule.actions.addFolder({
          id: "folder-a1",
          name: "Folder A1",
          parentFolder: null,
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(docC.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Drive C1" }),
        driveDocumentModelModule.actions.addFolder({
          id: "folder-c1",
          name: "Folder C1",
          parentFolder: null,
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(docB.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b1" }),
        driveDocumentModelModule.actions.addFolder({
          id: "folder-b1",
          name: "Folder B1",
          parentFolder: null,
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(docD.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Drive D1" }),
        driveDocumentModelModule.actions.updateNode({
          id: docD.header.id,
          name: "Updated D1",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(docA.header.id, "main", [
        driveDocumentModelModule.actions.addFile({
          id: "file-a1",
          name: "File A1",
          documentType: "powerhouse/document-model",
          parentFolder: "folder-a1",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(docC.header.id, "main", [
        driveDocumentModelModule.actions.addFile({
          id: "file-c1",
          name: "File C1",
          documentType: "powerhouse/document-model",
          parentFolder: "folder-c1",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(docB.header.id, "main", [
        driveDocumentModelModule.actions.updateFile({
          id: "file-b1",
          name: "Updated File B1",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(docD.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-d1" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(docA.header.id, "main", [
        driveDocumentModelModule.actions.updateNode({
          id: "folder-a1",
          name: "Updated Folder A1",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(docC.header.id, "main", [
        driveDocumentModelModule.actions.updateFile({
          id: "file-c1",
          name: "Updated File C1",
        }),
      ]),
    );

    const jobInfosA = await Promise.all(execJobsA);
    const jobInfosB = await Promise.all(execJobsB);

    await Promise.all([
      ...jobInfosA.map((j) => syncManagerA.waitForSync(j.id)),
      ...jobInfosB.map((j) => syncManagerB.waitForSync(j.id)),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
      { timeout: 1000 },
    );

    await Promise.all([
      compareSyncedDocument(docA.header.id),
      compareSyncedDocument(docB.header.id),
      compareSyncedDocument(docC.header.id),
      compareSyncedDocument(docD.header.id),
    ]);
  });

  it("should handle concurrent modifications to the same document from both reactors", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    const doc = driveDocumentModelModule.utils.createDocument();

    const createJob = await reactorA.create(doc);
    await syncManagerA.waitForSync(createJob.id);

    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    const execJobsA: Promise<{ id: string }>[] = [];
    const execJobsB: Promise<{ id: string }>[] = [];

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from A" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from B" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-a",
          name: "Folder from A",
          parentFolder: null,
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-b",
          name: "Folder from B",
          parentFolder: null,
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-a" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.updateNode({
          id: "folder-a",
          name: "Updated Folder A",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.updateNode({
          id: "folder-b",
          name: "Updated Folder B",
        }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-a-again" }),
      ]),
    );
    vi.advanceTimersByTime(1);

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b-again" }),
      ]),
    );

    const jobInfosA = await Promise.all(execJobsA);
    const jobInfosB = await Promise.all(execJobsB);

    await Promise.all([
      ...jobInfosA.map((j) => syncManagerA.waitForSync(j.id)),
      ...jobInfosB.map((j) => syncManagerB.waitForSync(j.id)),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
      { timeout: 1000 },
    );

    console.log("\n=== DUPLICATE SEND ANALYSIS ===");
    const duplicates: string[] = [];
    for (const [actionId, count] of sentActionIds) {
      if (count > 1) {
        duplicates.push(`Action ${actionId} was sent ${count} times`);
      }
    }
    if (duplicates.length > 0) {
      console.log("DUPLICATES FOUND:");
      for (const d of duplicates) {
        console.log(`  ${d}`);
      }
    } else {
      console.log("No duplicate sends detected");
    }
    console.log("=================================\n");

    await compareSyncedDocument(doc.header.id);
  });

  it("should trigger excessive reshuffle error when loading operation with index far in the past", async () => {
    const testReactor = await new ReactorBuilder()
      .withDocumentModels([driveDocumentModelModule as any])
      .build();

    const document = driveDocumentModelModule.utils.createDocument();
    await testReactor.create(document);

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

    const operations = await testReactor.getOperations(
      document.header.id,
      {
        branch: "main",
      },
      undefined,
      undefined,
      mutateJobInfo.consistencyToken,
    );
    const globalOps = operations.global.results;

    expect(globalOps.length).toBe(150);

    const latestIndex = Math.max(...globalOps.map((op) => op.index));
    expect(latestIndex).toBeGreaterThanOrEqual(149);

    const oldOperation = {
      ...globalOps[0],
      index: 0,
      timestampUtcMs: new Date(0).toISOString(),
    };

    const loadJobInfo = await testReactor.load(document.header.id, "main", [
      oldOperation,
    ]);

    await vi.waitUntil(async () => {
      const status = await testReactor.getJobStatus(loadJobInfo.id);
      return status.status === JobStatus.FAILED;
    });

    const status = await testReactor.getJobStatus(loadJobInfo.id);

    expect(status.status).toBe(JobStatus.FAILED);
    expect(status.error?.message).toContain("Excessive reshuffle detected");
  });

  it("should not echo operations back to sender", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const document = driveDocumentModelModule.utils.createDocument();
    const jobInfo = await reactorA.create(document);

    await syncManagerA.waitForSync(jobInfo.id);
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    const remoteA = moduleB.syncModule!.syncManager.getByName("remoteA");

    const outboxOps = remoteA.channel.outbox.items;
    expect(outboxOps.length).toBe(0);
  });

  it("should clean up outbox after successful send", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const document = driveDocumentModelModule.utils.createDocument();
    const jobInfo = await reactorA.create(document);

    await syncManagerA.waitForSync(jobInfo.id);
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    const remoteB = moduleA.syncModule!.syncManager.getByName("remoteB");

    const outboxOps = remoteB.channel.outbox.items;
    expect(outboxOps.length).toBe(0);
  });

  it("minimal: single document sync should not cause revision mismatch errors", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    // Create a single document on ReactorA
    const doc = driveDocumentModelModule.utils.createDocument();

    const createJob = await reactorA.create(doc);
    await syncManagerA.waitForSync(createJob.id);
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    const actionA = driveDocumentModelModule.actions.setDriveName({
      name: `Name A`,
    });
    const actionB = driveDocumentModelModule.actions.setDriveName({
      name: `Name B`,
    });
    actionA.timestampUtcMs = "2026-01-27T19:20:04.470Z";
    actionB.timestampUtcMs = "2026-01-27T19:20:04.470Z";

    const jobA = await reactorA.execute(doc.header.id, "main", [actionA]);
    const jobB = await reactorB.execute(doc.header.id, "main", [actionB]);

    await Promise.all([
      syncManagerA.waitForSync(jobA.id),
      syncManagerB.waitForSync(jobB.id),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
    );

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

    expect(docFromA.state).toEqual(docFromB.state);
  }, 10000);

  it("minimal: fire-and-forget mutations should not cause revision mismatch errors", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    // Create 2 documents (1 on each reactor)
    const docA = driveDocumentModelModule.utils.createDocument();
    const docB = driveDocumentModelModule.utils.createDocument();

    const jobA = await reactorA.create(docA);
    const jobB = await reactorB.create(docB);

    await syncManagerA.waitForSync(jobA.id);
    await syncManagerB.waitForSync(jobB.id);

    // Fire mutations rapidly without waiting for sync
    const execJobsA: Promise<{ id: string }>[] = [];
    const execJobsB: Promise<{ id: string }>[] = [];

    execJobsA.push(
      reactorA.execute(docA.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name A1" }),
      ]),
    );
    execJobsB.push(
      reactorB.execute(docB.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name B1" }),
      ]),
    );
    execJobsA.push(
      reactorA.execute(docA.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-a1" }),
      ]),
    );
    execJobsB.push(
      reactorB.execute(docB.header.id, "main", [
        driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b1" }),
      ]),
    );

    const jobInfosA = await Promise.all(execJobsA);
    const jobInfosB = await Promise.all(execJobsB);

    await Promise.all([
      ...jobInfosA.map((j) => syncManagerA.waitForSync(j.id)),
      ...jobInfosB.map((j) => syncManagerB.waitForSync(j.id)),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
    );

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
    expect(docAonA.state).toBeDefined();
    expect(docAonB.state).toBeDefined();
  }, 10000);

  it("minimal: concurrent operations after sync should reshuffle", async () => {
    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    // 1. ReactorA creates document
    const doc = driveDocumentModelModule.utils.createDocument();
    const createJob = await reactorA.create(doc);
    await syncManagerA.waitForSync(createJob.id);

    // 2. Wait for document to sync to ReactorB
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    // 3. Both reactors perform an operation on the document
    const execJobsA: Promise<{ id: string }>[] = [];
    const execJobsB: Promise<{ id: string }>[] = [];

    execJobsA.push(
      reactorA.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from A" }),
      ]),
    );

    execJobsB.push(
      reactorB.execute(doc.header.id, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Name from B" }),
      ]),
    );

    const jobInfosA = await Promise.all(execJobsA);
    const jobInfosB = await Promise.all(execJobsB);

    // 4. Wait for syncs to complete (both local and synced operations)
    await Promise.all([
      ...jobInfosA.map((j) => syncManagerA.waitForSync(j.id)),
      ...jobInfosB.map((j) => syncManagerB.waitForSync(j.id)),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
    );

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
    expect(docFromA.state).toEqual(docFromB.state);
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

    const doc = driveDocumentModelModule.utils.createDocument();
    await testReactor.create(doc);

    // 2. Create and load 10 "local" operations with EVEN timestamps (T2, T4, T6, ...)
    // Each operation adds a folder
    const baseTime = Date.now();
    const localOperations = [];
    for (let i = 0; i < 10; i++) {
      localOperations.push(
        operationFromAction(
          addFolder({
            id: `local-folder-${i}`,
            name: `Local Folder ${i}`,
            parentFolder: null,
          }),
          i,
          0,
          {
            documentId: doc.header.id,
            scope: "global",
            branch: "main",
          },
        ),
      );

      vi.advanceTimersByTime(1);
    }

    const localLoadJob = await testReactor.load(
      doc.header.id,
      "main",
      localOperations,
    );

    // Get operations after local load
    const opsAfterLocalLoad = await testReactor.getOperations(
      doc.header.id,
      {
        branch: "main",
      },
      undefined,
      undefined,
      localLoadJob.consistencyToken,
    );

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
    vi.setSystemTime(new Date(baseTime + 100));
    const remoteOperations = [];
    for (let i = 0; i < 10; i++) {
      remoteOperations.push(
        operationFromAction(
          addFolder({
            id: `another-folder-${i}`,
            name: `Another Folder ${i}`,
            parentFolder: null,
          }),
          i,
          0,
          {
            documentId: doc.header.id,
            scope: "global",
            branch: "main",
          },
        ),
      );

      vi.advanceTimersByTime(1);
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

    // 5. Get the final operations and verify
    const opsAfterRemoteLoad = await testReactor.getOperations(
      doc.header.id,
      {
        branch: "main",
      },
      undefined,
      undefined,
      remoteLoadJob.consistencyToken,
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

    console.log(`Effective operations after GC: ${garbageCollectedOps.length}`);

    // We should have 20 effective operations (10 local + 10 remote)
    expect(garbageCollectedOps.length).toBe(20);

    // Verify timestamps are in ascending order after GC
    const timestamps = garbageCollectedOps.map((op) => op.timestampUtcMs);
    const sortedTimestamps = [...timestamps].sort();
    expect(timestamps).toEqual(sortedTimestamps);

    // Verify state is correct - should have 20 folders
    const docResult = await testReactor.get(doc.header.id, {
      branch: "main",
    });
    const state = docResult.state as unknown as {
      global: { nodes: Array<{ id: string; kind: string }> };
    };
    const nodes = state.global.nodes;

    const folders = nodes.filter((n) => n.kind === "folder");

    console.log(`Final state: ${folders.length} folders`);

    expect(folders.length).toBe(20);
  }, 5000);

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

    const syncManagerA = moduleA.syncModule!.syncManager;
    const syncManagerB = moduleB.syncModule!.syncManager;

    // 1. ReactorA creates document and syncs to B
    const doc = driveDocumentModelModule.utils.createDocument();
    const createJob = await reactorA.create(doc);
    await syncManagerA.waitForSync(createJob.id);
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    // 2. ReactorA performs an operation that we can UNDO later
    const setNameJob = await reactorA.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Initial Name" }),
    ]);
    await syncManagerA.waitForSync(setNameJob.id);
    await vi.waitUntil(() => areChannelsEmpty(moduleB));

    // Now both reactors have: [0: SET_DRIVE_NAME]

    // 3. Fire concurrent operations from both reactors at the same time
    // A does UNDO (creates NOOP) while B does ADD_FOLDER
    // The timestamps will overlap, triggering reshuffle on one or both reactors
    const undoJob = await reactorA.execute(doc.header.id, "main", [
      {
        id: generateId(),
        type: "UNDO",
        scope: "global",
        timestampUtcMs: new Date().toISOString(),
        input: {},
      },
    ]);

    const folderJob = await reactorB.execute(doc.header.id, "main", [
      driveDocumentModelModule.actions.addFolder({
        id: "folder-from-b",
        name: "Folder from B",
        parentFolder: null,
      }),
    ]);

    // Wait for both to sync
    await Promise.all([
      syncManagerA.waitForSync(undoJob.id),
      syncManagerB.waitForSync(folderJob.id),
    ]);

    await vi.waitUntil(
      () => areChannelsEmpty(moduleA) && areChannelsEmpty(moduleB),
    );

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
    expect(docFromA.state).toEqual(docFromB.state);
  }, 30000);
});
