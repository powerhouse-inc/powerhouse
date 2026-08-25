/**
 * Two reactors syncing with each other, over four workloads.
 *
 * Run explicitly: `pnpm bench:sync`. This is not a vitest bench and not part of
 * the test suite; it drives tinybench directly and executes on import.
 *
 * Three things this harness gets wrong if you write it the obvious way, all of
 * which made it silently fail before:
 *
 * 1. A create has to be awaited. Firing `void reactor.create(doc)` and then
 *    executing against the document races the create, and every write loses
 *    with DocumentNotFoundError.
 * 2. A collection is identified by the document that belongs to it. Syncing a
 *    fixed name like "collection1" registers remotes for a collection nothing
 *    is a member of: it connects, reports healthy, and transfers nothing. The
 *    ids are deterministic, so the remotes can be registered up front - which
 *    they have to be, because the outbox is filled from JOB_WRITE_READY as
 *    writes happen. A remote added afterwards never sees them, and pulling
 *    them later is the backfill this transport cannot do.
 * 3. Concurrent writes still have to be awaited somewhere. `void execute(...)`
 *    hides a rejection and leaves the bench waiting on convergence that can
 *    never happen, so the promises are collected and awaited together.
 * 4. Both sides need the drive model registered. This one was invisible until
 *    the create above was awaited: the failure it produces is exactly the one
 *    the fire-and-forget call was swallowing.
 *
 * What it does not cover: backfill. TestChannel pushes on write and its
 * triggerPull is a stub, so a reactor cannot pull history it never saw. Every
 * scenario here has both sides writing live.
 */

import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { Bench } from "tinybench";
import { DriveCollectionId } from "../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../src/core/types.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import { JobStatus } from "../src/shared/types.js";
import type { ISyncCursorStorage } from "../src/storage/interfaces.js";
import type { IChannelFactory } from "../src/sync/interfaces.js";
import { SyncBuilder } from "../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../src/sync/types.js";
import { TestChannel } from "../test/sync/channels/test-channel.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  moduleA: ReactorModule;
  moduleB: ReactorModule;
  channelRegistry: Map<string, TestChannel>;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
  /** Remote name to its peer's, filled in per document by connectDocuments. */
  peerMapping: Map<string, string>;
};

function deterministicId(prefix: string, counter: number): string {
  return `${prefix}-${counter.toString().padStart(8, "0")}`;
}

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  const channelRegistry = new Map<string, TestChannel>();
  const peerMapping = new Map<string, string>();

  const createChannelFactory = (): IChannelFactory => {
    return {
      instance(
        remoteId: string,
        remoteName: string,
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
        _collectionId: DriveCollectionId,
        _filter: unknown,
        _operationIndex: unknown,
      ): TestChannel {
        const send = (envelope: SyncEnvelope): void => {
          const peerName = peerMapping.get(remoteName);
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

  // Both sides must hold the drive model, or every create fails on a model it
  // cannot load. The previous version never registered it and never noticed,
  // because it did not await the create that failed.
  const build = (eventBus: IEventBus) =>
    new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModelSources([driveDocumentModelModule as never])
      // --no-batch-applies is here because this harness is the only thing that
      // catches a batching change breaking convergence: two reactors writing
      // one document concurrently is the case the unit suite and the
      // integration suites do not produce.
      .withExecutorConfig({
        batchApplies: !process.argv.includes("--no-batch-applies"),
      })
      .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
      .buildModule();

  const moduleA = await build(eventBusA);
  const moduleB = await build(eventBusB);

  return {
    reactorA: moduleA.reactor,
    reactorB: moduleB.reactor,
    moduleA,
    moduleB,
    channelRegistry,
    eventBusA,
    eventBusB,
    peerMapping,
  };
}

async function settle(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? `job ${jobId} failed`);
    }
    if (status.status === JobStatus.READ_READY) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`job ${jobId} did not settle within ${timeoutMs}ms`);
}

/** Creates documents on the chosen side, awaiting each one. */
async function createDocuments(
  setup: TwoReactorSetup,
  ids: string[],
  sideFor: (index: number) => IReactor,
): Promise<void> {
  for (const [index, id] of ids.entries()) {
    const document = driveDocumentModelModule.utils.createDocument();
    document.header.id = id;
    const reactor = sideFor(index);
    await settle(reactor, (await reactor.create(document)).id);
  }
}

/** Registers a remote pair per document, which is what makes sync transfer. */
async function connectDocuments(
  setup: TwoReactorSetup,
  ids: string[],
): Promise<void> {
  const filter = { documentId: [], scope: [], branch: "main" };
  for (const id of ids) {
    const toB = `remoteB-${id}`;
    const toA = `remoteA-${id}`;
    setup.peerMapping.set(toB, toA);
    setup.peerMapping.set(toA, toB);

    const collectionId = DriveCollectionId.forDrive(id);
    await setup.moduleA.syncModule!.syncManager.add(
      toB,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
    await setup.moduleB.syncModule!.syncManager.add(
      toA,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
  }
}

async function waitForSync(
  reactorA: IReactor,
  reactorB: IReactor,
  documentIds: string[],
  timeoutMs = 60_000,
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

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Sync did not complete within ${timeoutMs}ms`);
}

/** Both sides must agree on every document, or the workload proved nothing. */
async function assertConverged(
  reactorA: IReactor,
  reactorB: IReactor,
  documentIds: string[],
): Promise<void> {
  for (const docId of documentIds) {
    const docA = await reactorA.get(docId, { branch: "main" });
    const docB = await reactorB.get(docId, { branch: "main" });
    if (JSON.stringify(docA) !== JSON.stringify(docB)) {
      throw new Error(`Documents ${docId} not synced`);
    }
  }
}

let setup: TwoReactorSetup | null = null;

const lifecycle = {
  beforeEach: async () => {
    setup = await setupTwoReactors();
  },
  afterEach: () => {
    setup!.reactorA.kill();
    setup!.reactorB.kill();
  },
};

type Scenario = { name: string; run: () => Promise<void> };

const scenarios: Scenario[] = [
  {
    name: "Baseline: 10 documents, 10 operations each",
    run: async () => {
      const { reactorA, reactorB } = setup!;
      const ids = Array.from({ length: 10 }, (_, i) =>
        deterministicId("doc", i),
      );
      const sideFor = (i: number) => (i < 5 ? reactorA : reactorB);

      await connectDocuments(setup!, ids);
      await createDocuments(setup!, ids, sideFor);

      const writes: Promise<unknown>[] = [];
      for (const [i, docId] of ids.entries()) {
        for (let j = 0; j < 10; j++) {
          writes.push(
            sideFor(i).execute(docId, "main", [
              driveDocumentModelModule.actions.setDriveName({
                name: `Doc ${i} Update ${j}`,
              }),
            ]),
          );
        }
      }
      await Promise.all(writes);

      await waitForSync(reactorA, reactorB, ids);
      await assertConverged(reactorA, reactorB, ids);
    },
  },
  {
    name: "Conflicts: 5 documents, 20 conflicting operations each",
    run: async () => {
      const { reactorA, reactorB } = setup!;
      const ids = Array.from({ length: 5 }, (_, i) =>
        deterministicId("doc", i + 100),
      );

      await connectDocuments(setup!, ids);
      await createDocuments(setup!, ids, () => reactorA);

      const writes: Promise<unknown>[] = [];
      for (const [i, docId] of ids.entries()) {
        for (let j = 0; j < 20; j++) {
          const reactor = j % 2 === 0 ? reactorA : reactorB;
          writes.push(
            reactor.execute(docId, "main", [
              driveDocumentModelModule.actions.setDriveName({
                name: `Conflict ${i} Write ${j}`,
              }),
            ]),
          );
        }
      }
      await Promise.all(writes);

      await waitForSync(reactorA, reactorB, ids);
      await assertConverged(reactorA, reactorB, ids);
    },
  },
  {
    name: "Heavy Load: 50 documents, 100 operations each",
    run: async () => {
      const { reactorA, reactorB } = setup!;
      const ids = Array.from({ length: 50 }, (_, i) =>
        deterministicId("doc", i + 200),
      );
      const sideFor = (i: number) => (i % 2 === 0 ? reactorA : reactorB);

      await connectDocuments(setup!, ids);
      await createDocuments(setup!, ids, sideFor);

      const writes: Promise<unknown>[] = [];
      for (const [i, docId] of ids.entries()) {
        for (let j = 0; j < 100; j++) {
          writes.push(
            sideFor(i).execute(docId, "main", [
              driveDocumentModelModule.actions.setDriveName({
                name: `Heavy ${i} Update ${j}`,
              }),
            ]),
          );
        }
      }
      await Promise.all(writes);

      await waitForSync(reactorA, reactorB, ids);
      await assertConverged(reactorA, reactorB, ids);
    },
  },
  {
    name: "Deep Hierarchy: 10 documents with nested structures",
    run: async () => {
      const { reactorA, reactorB } = setup!;
      const ids = Array.from({ length: 10 }, (_, i) =>
        deterministicId("doc", i + 300),
      );

      await connectDocuments(setup!, ids);
      await createDocuments(setup!, ids, () => reactorA);

      const writes: Promise<unknown>[] = [];
      for (const [i, docId] of ids.entries()) {
        let parentFolder: string | null = null;
        for (let level = 0; level < 5; level++) {
          const folderId = deterministicId("folder", i * 100 + level);
          writes.push(
            reactorA.execute(docId, "main", [
              driveDocumentModelModule.actions.addFolder({
                id: folderId,
                name: `Level ${level} Folder`,
                parentFolder,
              }),
            ]),
          );
          writes.push(
            reactorB.execute(docId, "main", [
              driveDocumentModelModule.actions.addFile({
                id: deterministicId("file", i * 100 + level),
                name: `File at Level ${level}`,
                documentType: "powerhouse/document-model",
                parentFolder,
              }),
            ]),
          );
          parentFolder = folderId;
        }
      }
      await Promise.all(writes);

      await waitForSync(reactorA, reactorB, ids);
      await assertConverged(reactorA, reactorB, ids);
    },
  },
];

/**
 * A single pass of every scenario, for checking the harness still works.
 *
 * This exists because the harness silently rotted: it is not in the test suite
 * and no CI job runs it, so four separate defects accumulated with nothing to
 * catch them. `--smoke` runs each workload once and fails loudly, which is
 * cheap enough to run before trusting a number.
 */
async function smoke(): Promise<void> {
  let failures = 0;
  for (const scenario of scenarios) {
    await lifecycle.beforeEach();
    const started = Date.now();
    try {
      await scenario.run();
      process.stdout.write(
        `PASS  ${scenario.name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`,
      );
    } catch (error) {
      failures += 1;
      process.stdout.write(
        `FAIL  ${scenario.name}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    } finally {
      lifecycle.afterEach();
    }
  }
  if (failures > 0) {
    process.stdout.write(
      `\n${failures} of ${scenarios.length} scenarios failed\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`\nall ${scenarios.length} scenarios passed\n`);
  process.exit(0);
}

if (process.argv.includes("--smoke")) {
  await smoke();
}

const bench = new Bench({ time: 10000 });
for (const scenario of scenarios) {
  bench.add(scenario.name, scenario.run, lifecycle);
}

console.log("Running Two-Reactor Sync Benchmarks...\n");

await bench.run();

console.log("\nResults:");
console.table(bench.table());
