import { Bench } from "tinybench";
import { driveDocumentModelModule } from "document-drive";
import { ReactorBuilder } from "../src/core/reactor-builder.js";
import type { IReactor } from "../src/core/types.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { ISyncCursorStorage } from "../src/storage/interfaces.js";
import { InternalChannel } from "../src/sync/channels/internal-channel.js";
import type { IChannelFactory } from "../src/sync/interfaces.js";
import { SyncBuilder } from "../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../src/sync/types.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  channelRegistry: Map<string, InternalChannel>;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
};

function deterministicId(prefix: string, counter: number): string {
  return `${prefix}-${counter.toString().padStart(8, "0")}`;
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

async function waitForSync(
  reactorA: IReactor,
  reactorB: IReactor,
  documentIds: string[],
  timeoutMs = 30000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    let allSynced = true;

    for (const docId of documentIds) {
      const resultA = await reactorA.getOperations(docId, { branch: "main" });
      const opsA = Object.values(resultA).flatMap((scope) => scope.results);

      const resultB = await reactorB.getOperations(docId, { branch: "main" });
      const opsB = Object.values(resultB).flatMap((scope) => scope.results);

      if (opsA.length !== opsB.length || opsA.length === 0) {
        allSynced = false;
        break;
      }
    }

    if (allSynced) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Sync did not complete within ${timeoutMs}ms`);
}

const bench = new Bench({ time: 10000 });

bench
  .add(
    "Baseline: 10 documents, 10 operations each",
    async () => {
      const { reactorA, reactorB } = setup!;
      const documentIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const doc = driveDocumentModelModule.utils.createDocument();
        doc.header.id = deterministicId("doc", i);
        documentIds.push(doc.header.id);

        if (i < 5) {
          void reactorA.create(doc);
        } else {
          void reactorB.create(doc);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      for (let i = 0; i < 10; i++) {
        const docId = documentIds[i];
        const reactor = i < 5 ? reactorA : reactorB;

        for (let j = 0; j < 10; j++) {
          void reactor.mutate(docId, "main", [
            driveDocumentModelModule.actions.setDriveName({
              name: `Doc ${i} Update ${j}`,
            }),
          ]);
        }
      }

      await waitForSync(reactorA, reactorB, documentIds);

      for (const docId of documentIds) {
        const docA = await reactorA.get(docId, { branch: "main" });
        const docB = await reactorB.get(docId, { branch: "main" });
        if (JSON.stringify(docA.document) !== JSON.stringify(docB.document)) {
          throw new Error(`Documents ${docId} not synced`);
        }
      }
    },
    {
      beforeEach: async () => {
        setup = await setupTwoReactors();
      },
      afterEach: () => {
        setup!.reactorA.kill();
        setup!.reactorB.kill();
      },
    },
  )
  .add(
    "Conflicts: 5 documents, 20 conflicting operations each",
    async () => {
      const { reactorA, reactorB } = setup!;
      const documentIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const doc = driveDocumentModelModule.utils.createDocument();
        doc.header.id = deterministicId("doc", i + 100);
        documentIds.push(doc.header.id);
        void reactorA.create(doc);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      for (let i = 0; i < 5; i++) {
        const docId = documentIds[i];

        for (let j = 0; j < 20; j++) {
          void reactorA.mutate(docId, "main", [
            driveDocumentModelModule.actions.setDriveName({
              name: `From A: Doc ${i} Update ${j}`,
            }),
          ]);

          void reactorB.mutate(docId, "main", [
            driveDocumentModelModule.actions.setDriveName({
              name: `From B: Doc ${i} Update ${j}`,
            }),
          ]);
        }
      }

      await waitForSync(reactorA, reactorB, documentIds);

      for (const docId of documentIds) {
        const docA = await reactorA.get(docId, { branch: "main" });
        const docB = await reactorB.get(docId, { branch: "main" });
        if (JSON.stringify(docA.document) !== JSON.stringify(docB.document)) {
          throw new Error(`Documents ${docId} not synced after conflicts`);
        }
      }
    },
    {
      beforeEach: async () => {
        setup = await setupTwoReactors();
      },
      afterEach: () => {
        setup!.reactorA.kill();
        setup!.reactorB.kill();
      },
    },
  )
  .add(
    "Heavy Load: 50 documents, 100 operations each",
    async () => {
      const { reactorA, reactorB } = setup!;
      const documentIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const doc = driveDocumentModelModule.utils.createDocument();
        doc.header.id = deterministicId("doc", i + 200);
        documentIds.push(doc.header.id);

        if (i % 2 === 0) {
          void reactorA.create(doc);
        } else {
          void reactorB.create(doc);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      for (let i = 0; i < 50; i++) {
        const docId = documentIds[i];
        const reactor = i % 2 === 0 ? reactorA : reactorB;

        for (let j = 0; j < 100; j++) {
          const operation = j % 3;

          if (operation === 0) {
            void reactor.mutate(docId, "main", [
              driveDocumentModelModule.actions.setDriveName({
                name: `Doc ${i} Update ${j}`,
              }),
            ]);
          } else if (operation === 1) {
            void reactor.mutate(docId, "main", [
              driveDocumentModelModule.actions.addFolder({
                id: deterministicId("folder", i * 100 + j),
                name: `Folder ${j}`,
                parentFolder: null,
              }),
            ]);
          } else {
            void reactor.mutate(docId, "main", [
              driveDocumentModelModule.actions.setDriveIcon({
                icon: `icon-${j}`,
              }),
            ]);
          }
        }
      }

      await waitForSync(reactorA, reactorB, documentIds, 60000);

      for (const docId of documentIds) {
        const docA = await reactorA.get(docId, { branch: "main" });
        const docB = await reactorB.get(docId, { branch: "main" });
        if (JSON.stringify(docA.document) !== JSON.stringify(docB.document)) {
          throw new Error(`Documents ${docId} not synced under heavy load`);
        }
      }
    },
    {
      beforeEach: async () => {
        setup = await setupTwoReactors();
      },
      afterEach: () => {
        setup!.reactorA.kill();
        setup!.reactorB.kill();
      },
    },
  )
  .add(
    "Deep Hierarchy: 10 documents with nested structures",
    async () => {
      const { reactorA, reactorB } = setup!;
      const documentIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const doc = driveDocumentModelModule.utils.createDocument();
        doc.header.id = deterministicId("doc", i + 300);
        documentIds.push(doc.header.id);
        void reactorA.create(doc);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      for (let i = 0; i < 10; i++) {
        const docId = documentIds[i];
        let parentFolder: string | null = null;

        for (let level = 0; level < 5; level++) {
          const folderId = deterministicId("folder", i * 100 + level);

          void reactorA.mutate(docId, "main", [
            driveDocumentModelModule.actions.addFolder({
              id: folderId,
              name: `Level ${level} Folder`,
              parentFolder,
            }),
          ]);

          void reactorB.mutate(docId, "main", [
            driveDocumentModelModule.actions.addFile({
              id: deterministicId("file", i * 100 + level),
              name: `File at Level ${level}`,
              documentType: "powerhouse/document-model",
              parentFolder: folderId,
            }),
          ]);

          parentFolder = folderId;
        }
      }

      await waitForSync(reactorA, reactorB, documentIds);

      for (const docId of documentIds) {
        const docA = await reactorA.get(docId, { branch: "main" });
        const docB = await reactorB.get(docId, { branch: "main" });
        if (JSON.stringify(docA.document) !== JSON.stringify(docB.document)) {
          throw new Error(`Documents ${docId} not synced with deep hierarchy`);
        }
      }
    },
    {
      beforeEach: async () => {
        setup = await setupTwoReactors();
      },
      afterEach: () => {
        setup!.reactorA.kill();
        setup!.reactorB.kill();
      },
    },
  );

let setup: TwoReactorSetup | null = null;

console.log("Running Two-Reactor Sync Benchmarks...\n");

await bench.run();

console.log("\nResults:");
console.table(bench.table());
