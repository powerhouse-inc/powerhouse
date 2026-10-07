import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../../src/core/reactor-client-builder.js";
import { EventBus } from "../../../../src/events/event-bus.js";
import { LocalChannelFactory } from "../../../../src/sync/channels/local-channel-factory.js";
import {
  LocalChannelPortRegistry,
  registerLocalPeer,
} from "../../../../src/sync/channels/local-channel-registry.js";
import { messagePortTransport } from "../../../../src/sync/channels/local-channel-transport.js";
import type { ISyncAdmin } from "../../../../src/sync/interfaces.js";
import { SyncBuilder } from "../../../../src/sync/sync-builder.js";
import { SyncEventTypes } from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";
import {
  addFolder,
  create,
  folders,
  has,
  NARROW,
  testProtocol,
  WIDE,
  type Node as FleetNode,
} from "../../peer-agreement/fleet.js";

const FILTER = { documentId: [], scope: [], branch: "main" };

type Peer = FleetNode & {
  admin: ISyncAdmin;
  ports: LocalChannelPortRegistry;
};

async function buildPeer(name: string, versions: number[]): Promise<Peer> {
  const ports = new LocalChannelPortRegistry();
  const factory = new LocalChannelFactory(createMockLogger(), ports.provider);
  const built = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withLogger(createMockLogger())
        .withEventBus(new EventBus())
        .withDocumentModelSources([
          driveDocumentModelModule as never,
          documentModelDocumentModelModule,
        ])
        .withPeerCapabilities([testProtocol(versions)])
        .withSync(new SyncBuilder().withChannelFactory(factory)),
    )
    .withCreateSignaturePolicy("legacy")
    .buildModule();
  const module = built.reactorModule!;
  return {
    name,
    client: built.client,
    module,
    reactor: module.reactor,
    sync: module.syncModule!.syncManager,
    admin: module.syncModule!.syncAdmin!,
    ports,
  };
}

function brokeredPorts(): [MessagePort, MessagePort] {
  const { port1, port2 } = new MessageChannel();
  port1.unref();
  port2.unref();
  return [port1, port2];
}

/** Links a and b over one MessageChannel per drive, through each registry. */
class Pair {
  private readonly driveIds = new Set<string>();

  constructor(
    readonly a: Peer,
    readonly b: Peer,
  ) {}

  async connect(driveId: string): Promise<void> {
    this.driveIds.add(driveId);
    const [port1, port2] = brokeredPorts();
    const collectionId = DriveCollectionId.forDrive(driveId);
    await registerLocalPeer(
      this.a.sync,
      this.a.ports,
      {
        peerId: "b",
        channelName: driveId,
        collectionId,
        remoteName: "a->b",
        filter: FILTER,
      },
      messagePortTransport(port1),
    );
    await registerLocalPeer(
      this.b.sync,
      this.b.ports,
      {
        peerId: "a",
        channelName: driveId,
        collectionId,
        remoteName: "b->a",
        filter: FILTER,
      },
      messagePortTransport(port2),
    );
  }

  async kill(): Promise<void> {
    for (const peer of [this.a, this.b]) {
      await peer.reactor.kill().completed;
      await peer.sync.shutdown().completed;
    }
    for (const driveId of this.driveIds) {
      this.a.ports.unregister("b", driveId);
      this.b.ports.unregister("a", driveId);
    }
  }
}

describe("LocalChannel over a message port between two reactors", () => {
  let pair: Pair | undefined;

  afterEach(async () => {
    await pair?.kill();
    pair = undefined;
  });

  it("syncs a drive in both directions without either side polling", async () => {
    const a = await buildPeer("a", WIDE);
    const b = await buildPeer("b", WIDE);
    pair = new Pair(a, b);

    const driveId = "sym-drive";
    await pair.connect(driveId);
    await create(a, driveId, {});

    // A -> B
    await vi.waitFor(async () => expect(await has(b, driveId)).toBe(true), {
      timeout: 15_000,
    });
    await addFolder(a, driveId, "fromA");
    await vi.waitFor(
      async () => expect(await folders(b, driveId)).toContain("fromA"),
      { timeout: 15_000 },
    );

    // B -> A, over the same link, with neither side polling.
    await addFolder(b, driveId, "fromB");
    await vi.waitFor(
      async () => expect(await folders(a, driveId)).toContain("fromB"),
      { timeout: 15_000 },
    );
    expect((await folders(a, driveId)).sort()).toEqual(["fromA", "fromB"]);
  }, 40_000);

  it("holds a document from a peer whose manifest cannot run it", async () => {
    const a = await buildPeer("a", WIDE);
    const b = await buildPeer("b", NARROW);
    pair = new Pair(a, b);

    const held = vi.fn();
    a.module.eventBus.subscribe(SyncEventTypes.SYNC_HELD, (_type, event) => {
      held(event);
    });

    const driveId = "v2-drive";
    await pair.connect(driveId);
    await create(a, driveId, { "test-protocol": 2 });

    await vi.waitFor(
      async () =>
        expect(await a.sync.listHolds({ remoteName: "a->b" })).toHaveLength(1),
      { timeout: 15_000 },
    );
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([
      expect.objectContaining({
        documentId: driveId,
        branch: "main",
        reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
      }),
    ]);
    expect(await has(b, driveId)).toBe(false);
    expect(held).toHaveBeenCalledTimes(1);
  }, 40_000);
});
