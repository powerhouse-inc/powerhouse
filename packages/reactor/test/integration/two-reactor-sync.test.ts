import { driveDocumentModelModule } from "document-drive";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import {
  OperationEventTypes,
  type OperationsReadyEvent,
} from "../../src/events/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import { InternalChannel } from "../../src/sync/channels/internal-channel.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  channelRegistry: Map<string, InternalChannel>;
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

    if (status.status === JobStatus.COMPLETED) {
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
  const channelRegistry = new Map<string, InternalChannel>();
  const peerMapping = new Map<string, string>();
  peerMapping.set("remoteA", "remoteB");
  peerMapping.set("remoteB", "remoteA");

  const createChannelFactory = (): IChannelFactory => {
    return {
      instance(
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): InternalChannel {
        const remoteName = config.remoteName;
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

        const channel = new InternalChannel(
          config.channelId,
          config.remoteName,
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

  const reactorA = await new ReactorBuilder()
    .withEventBus(eventBusA)
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .build();

  const reactorB = await new ReactorBuilder()
    .withEventBus(eventBusB)
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .build();

  await reactorA.syncManager!.add(
    "remoteB",
    "collection1",
    {
      type: "internal",
      channelId: "channelB",
      remoteName: "remoteB",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  await reactorB.syncManager!.add(
    "remoteA",
    "collection1",
    {
      type: "internal",
      channelId: "channelA",
      remoteName: "remoteA",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  return { reactorA, reactorB, channelRegistry, eventBusA, eventBusB };
}

describe("Two-Reactor Sync Integration", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;
  let eventBusA: IEventBus;
  let eventBusB: IEventBus;

  beforeEach(async () => {
    const setup = await setupTwoReactors();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
    eventBusA = setup.eventBusA;
    eventBusB = setup.eventBusB;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("should sync operation from ReactorA to ReactorB", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const jobInfo = await reactorA.create(document);

    await waitForJobCompletion(reactorA, jobInfo.id);

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    await waitForOperationsReady(eventBusB, document.header.id);

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
    const jobInfo = await reactorB.create(document);

    await waitForJobCompletion(reactorB, jobInfo.id);

    const resultB = await reactorB.getOperations(document.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    await waitForOperationsReady(eventBusA, document.header.id);

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

    const waitForCreatesA = waitForMultipleOperationsReady(eventBusA, 2, 10000);
    const waitForCreatesB = waitForMultipleOperationsReady(eventBusB, 2, 10000);

    void reactorA.create(docA);
    void reactorB.create(docC);
    void reactorA.create(docB);
    void reactorB.create(docD);

    await waitForCreatesA;
    await waitForCreatesB;

    const waitForMutatesA = waitForMultipleOperationsReady(eventBusA, 2, 10000);
    const waitForMutatesB = waitForMultipleOperationsReady(eventBusB, 2, 10000);

    void reactorA.mutate(docA.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive A1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-a1",
        name: "Folder A1",
        parentFolder: null,
      }),
    ]);

    void reactorB.mutate(docC.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive C1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-c1",
        name: "Folder C1",
        parentFolder: null,
      }),
    ]);

    void reactorA.mutate(docB.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-b1" }),
      driveDocumentModelModule.actions.addFolder({
        id: "folder-b1",
        name: "Folder B1",
        parentFolder: null,
      }),
    ]);

    void reactorB.mutate(docD.header.id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Drive D1" }),
      driveDocumentModelModule.actions.updateNode({
        id: docD.header.id,
        name: "Updated D1",
      }),
    ]);

    void reactorA.mutate(docA.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-a1",
        name: "File A1",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-a1",
      }),
    ]);

    void reactorB.mutate(docC.header.id, "main", [
      driveDocumentModelModule.actions.addFile({
        id: "file-c1",
        name: "File C1",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-c1",
      }),
    ]);

    void reactorA.mutate(docB.header.id, "main", [
      driveDocumentModelModule.actions.updateFile({
        id: "file-b1",
        name: "Updated File B1",
      }),
    ]);

    void reactorB.mutate(docD.header.id, "main", [
      driveDocumentModelModule.actions.setDriveIcon({ icon: "icon-d1" }),
    ]);

    void reactorA.mutate(docA.header.id, "main", [
      driveDocumentModelModule.actions.updateNode({
        id: "folder-a1",
        name: "Updated Folder A1",
      }),
    ]);

    void reactorB.mutate(docC.header.id, "main", [
      driveDocumentModelModule.actions.updateFile({
        id: "file-c1",
        name: "Updated File C1",
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
  }, 15000);
});
