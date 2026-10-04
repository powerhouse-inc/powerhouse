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
  messagePortTransport,
  type LocalChannelPort,
} from "../../../../src/sync/channels/local-channel-transport.js";
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

/** The sync manager's channel-reset seam, not on the public interface. */
interface Resettable {
  resetChannel(remoteName: string): Promise<void>;
}

type Peer = FleetNode & {
  transports: Map<string, LocalChannelPort>;
};

function portKey(peerId: string, channelName: string): string {
  return `${peerId} ${channelName}`;
}

async function buildPeer(name: string, versions: number[]): Promise<Peer> {
  const transports = new Map<string, LocalChannelPort>();
  const factory = new LocalChannelFactory(
    createMockLogger(),
    (peerId, channelName) => transports.get(portKey(peerId, channelName)),
  );
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
    transports,
  };
}

/** A MessageChannel joining a->b and b->a, kept so a reconnect can replace it. */
type Link = { port1: MessagePort; port2: MessagePort };

class Pair {
  readonly links = new Map<string, Link>();

  constructor(
    readonly a: Peer,
    readonly b: Peer,
  ) {}

  private wire(driveId: string): Link {
    const { port1, port2 } = new MessageChannel();
    port1.unref();
    port2.unref();
    this.a.transports.set(portKey("b", driveId), messagePortTransport(port1));
    this.b.transports.set(portKey("a", driveId), messagePortTransport(port2));
    const link = { port1, port2 };
    this.links.set(driveId, link);
    return link;
  }

  async connect(driveId: string): Promise<void> {
    this.wire(driveId);
    const collection = DriveCollectionId.forDrive(driveId);
    await this.a.sync.add(
      `a->b`,
      collection,
      { type: "local", parameters: { peerId: "b", channelName: driveId } },
      FILTER,
    );
    await this.b.sync.add(
      `b->a`,
      collection,
      { type: "local", parameters: { peerId: "a", channelName: driveId } },
      FILTER,
    );
  }

  /** Drops the current link and reconnects over a fresh MessageChannel. */
  async reconnect(driveId: string): Promise<void> {
    const old = this.links.get(driveId)!;
    old.port1.close();
    old.port2.close();
    this.wire(driveId);
    await (this.a.sync as unknown as Resettable).resetChannel("a->b");
    await (this.b.sync as unknown as Resettable).resetChannel("b->a");
  }

  kill(): void {
    this.a.reactor.kill();
    this.b.reactor.kill();
    for (const link of this.links.values()) {
      link.port1.close();
      link.port2.close();
    }
    this.links.clear();
  }
}

describe("LocalChannel over a message port between two reactors", () => {
  let pair: Pair | undefined;

  afterEach(() => {
    pair?.kill();
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

  it("recovers after the transport drops and is replaced", async () => {
    const a = await buildPeer("a", WIDE);
    const b = await buildPeer("b", WIDE);
    pair = new Pair(a, b);

    const driveId = "reconnect-drive";
    await pair.connect(driveId);
    await create(a, driveId, {});
    await vi.waitFor(async () => expect(await has(b, driveId)).toBe(true), {
      timeout: 15_000,
    });

    await pair.reconnect(driveId);

    // Traffic after the new port is adopted still flows both ways.
    await addFolder(a, driveId, "afterReconnect");
    await vi.waitFor(
      async () => expect(await folders(b, driveId)).toContain("afterReconnect"),
      { timeout: 15_000 },
    );
    await addFolder(b, driveId, "backToA");
    await vi.waitFor(
      async () => expect(await folders(a, driveId)).toContain("backToA"),
      { timeout: 15_000 },
    );
  }, 40_000);
});
