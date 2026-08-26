import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestChannel } from "./channels/test-channel.js";

/**
 * Two reactors writing the same documents at once, which is the only shape
 * that exercises a reshuffle against live local work. Both properties below
 * held under the unit suite and under the single-reactor integration tests
 * while being broken here, because neither produces concurrent writers on one
 * document.
 *
 * Note what is deliberately not asserted: that the two logs are the same
 * length. Each replica re-appends during its own reshuffles, and the number of
 * those it performs is its own business. Waiting on operation counts to match
 * is what made an earlier version of this look intermittently hung when it was
 * really diverging.
 */

const DOCUMENTS = 50;
const LEVELS = 5;

type Setup = {
  reactorA: IReactor;
  reactorB: IReactor;
  moduleA: ReactorModule;
  moduleB: ReactorModule;
  peerMapping: Map<string, string>;
};

describe("two reactors writing the same documents", () => {
  let setup: Setup;

  beforeEach(async () => {
    setup = await setupTwoReactors();
  });

  afterEach(() => {
    setup.reactorA.kill();
    setup.reactorB.kill();
  });

  it("converges, and each replica serves what its own log reduces to", async () => {
    const ids = Array.from(
      { length: DOCUMENTS },
      (_, i) => `converge-${i.toString().padStart(4, "0")}`,
    );

    await connectDocuments(setup, ids);
    await createDocuments(setup, ids);

    // A builds a folder chain, B hangs files off it, both at once.
    const writes: Promise<unknown>[] = [];
    for (const [i, id] of ids.entries()) {
      let parentFolder: string | null = null;
      for (let level = 0; level < LEVELS; level++) {
        const folderId = `folder-${i}-${level}`;
        writes.push(
          setup.reactorA.execute(id, "main", [
            driveDocumentModelModule.actions.addFolder({
              id: folderId,
              name: `Level ${level}`,
              parentFolder,
            }),
          ]),
        );
        writes.push(
          setup.reactorB.execute(id, "main", [
            driveDocumentModelModule.actions.addFile({
              id: `file-${i}-${level}`,
              name: `File ${level}`,
              documentType: "powerhouse/document-model",
              parentFolder,
            }),
          ]),
        );
        parentFolder = folderId;
      }
    }
    await Promise.all(writes);

    await waitForConvergence(setup, ids);

    for (const id of ids) {
      const [servedA, logA] = await servedAndLogged(setup.reactorA, id);
      const [servedB, logB] = await servedAndLogged(setup.reactorB, id);

      // A replica has to serve the state its own log reduces to. This needs no
      // second reactor to state; the second reactor is only how the reshuffle
      // that broke it gets provoked.
      expect({ id, served: servedA }).toEqual({ id, served: logA });
      expect({ id, served: servedB }).toEqual({ id, served: logB });

      // And the two have to agree.
      expect({ id, a: servedA }).toEqual({ id, a: servedB });
    }
  }, 120_000);
});

type DriveNodes = { state: { global: { nodes: Array<{ id: string }> } } };

// Left in stream order on purpose. Sorting would hide a merge that put the
// same nodes in a different order on each replica, which is its own bug.
function nodeIds(document: DriveNodes): string[] {
  return document.state.global.nodes.map((node) => String(node.id));
}

/** The node ids a replica serves, and the ones its own log reduces to. */
async function servedAndLogged(
  reactor: IReactor,
  documentId: string,
): Promise<[string[], string[]]> {
  const served = (await reactor.get(documentId, {
    branch: "main",
  })) as unknown as DriveNodes;

  const stored = await reactor.getOperations(documentId, { branch: "main" });
  const effective = garbageCollect(sortOperations([...stored.global.results]));

  const module = driveDocumentModelModule as unknown as {
    reducer: (document: unknown, action: unknown) => unknown;
  };
  let rebuilt: unknown = driveDocumentModelModule.utils.createDocument();
  (rebuilt as { header: { id: string } }).header.id = documentId;
  for (const operation of effective) {
    rebuilt = module.reducer(rebuilt, operation.action);
  }

  return [nodeIds(served), nodeIds(rebuilt as DriveNodes)];
}

async function waitForConvergence(
  setup: Setup,
  ids: string[],
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let settled = true;
    for (const id of ids) {
      const a = await setup.reactorA.get(id, { branch: "main" });
      const b = await setup.reactorB.get(id, { branch: "main" });
      if (JSON.stringify(a.state) !== JSON.stringify(b.state)) {
        settled = false;
        break;
      }
    }
    if (settled) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Falling through is not a failure by itself; the assertions report which
  // document diverged and how, which is more use than a timeout message.
}

async function setupTwoReactors(): Promise<Setup> {
  const channelRegistry = new Map<string, TestChannel>();
  const peerMapping = new Map<string, string>();

  const channelFactory = (): IChannelFactory => ({
    instance(
      remoteId: string,
      remoteName: string,
      _config: ChannelConfig,
      cursorStorage: ISyncCursorStorage,
      _collectionId: DriveCollectionId,
      _filter: unknown,
      _operationIndex: unknown,
    ): TestChannel {
      const send = (envelope: SyncEnvelope): void => {
        const peerName = peerMapping.get(remoteName);
        const peer = peerName ? channelRegistry.get(peerName) : undefined;
        if (!peer) {
          throw new Error(`peer channel for '${remoteName}' is missing`);
        }
        peer.receive(envelope);
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
  });

  const build = (eventBus: IEventBus) =>
    new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModelSources([driveDocumentModelModule as never])
      .withSync(new SyncBuilder().withChannelFactory(channelFactory()))
      .buildModule();

  const moduleA = await build(new EventBus());
  const moduleB = await build(new EventBus());

  return {
    reactorA: moduleA.reactor,
    reactorB: moduleB.reactor,
    moduleA,
    moduleB,
    peerMapping,
  };
}

/** A remote pair per document; a collection is named by its member document. */
async function connectDocuments(setup: Setup, ids: string[]): Promise<void> {
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

async function createDocuments(setup: Setup, ids: string[]): Promise<void> {
  for (const id of ids) {
    const document = driveDocumentModelModule.utils.createDocument();
    document.header.id = id;
    const info = await setup.reactorA.create(document);
    await settle(setup.reactorA, info.id);
  }
}

async function settle(reactor: IReactor, jobId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
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
  throw new Error(`job ${jobId} did not settle`);
}
